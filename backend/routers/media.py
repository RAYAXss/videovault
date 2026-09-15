"""
routers/media.py — Gestion des médias chiffrés.

Points de sécurité critiques :

1. Contrôle d'accès par owner_id :
   Chaque requête filtre par owner_id = utilisateur connecté. Même si un attaquant
   devine un ID de fichier, il ne peut pas y accéder (il n'en est pas propriétaire).
   Les admins ont accès à tous les fichiers (pour la gestion).

2. Validation de l'extension :
   L'extension est extraite du filename original (pas du Content-Type) et vérifiée
   contre la whitelist ALLOWED_EXTENSIONS. Le Content-Type envoyé par le client
   n'est pas trusté (il peut être forgé).

3. Le mot de passe voyage dans le corps de la requête HTTPS (POST), jamais en URL.
   Les URLs peuvent être loggées par les proxys ; les corps de requête, non.

4. Streaming du déchiffrement :
   StreamingResponse génère le plaintext à la volée depuis le générateur async.
   → Le fichier en clair n'existe jamais en entier sur le disque ou en RAM serveur.
   → Si le client coupe la connexion, le générateur s'arrête immédiatement.

5. Path traversal :
   encrypted_filename est stocké en BDD (pas fourni par le client). On ne concatène
   jamais un input utilisateur dans un chemin de fichier.
"""

import asyncio
import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.models.media_item import MediaItem, MediaType
from backend.models.user import User
from backend.schemas.media import MediaListResponse, MediaResponse, RenameTitleRequest, SortField
from backend.services.auth import get_current_user_id
from backend.services.crypto import (
    encrypt_file, decrypt_file_stream,
    generate_salt, generate_iv,
)
from backend.config import settings

router = APIRouter()


def _get_media_type(extension: str) -> MediaType:
    """Déduit le MediaType depuis l'extension."""
    if extension in {".mp4", ".mkv", ".avi", ".mov", ".webm"}:
        return MediaType.VIDEO
    if extension in {".pdf"}:
        return MediaType.DOCUMENT
    return MediaType.SCAN


def _get_mime_type(extension: str) -> str:
    """Retourne le MIME type pour le Content-Type du streaming."""
    mime_map = {
        ".mp4": "video/mp4",
        ".mkv": "video/x-matroska",
        ".webm": "video/webm",
        ".avi": "video/x-msvideo",
        ".mov": "video/quicktime",
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".tiff": "image/tiff",
        ".webp": "image/webp",
    }
    return mime_map.get(extension, "application/octet-stream")


@router.get("", response_model=MediaListResponse)
async def list_media(
    request: Request,
    search: str = Query("", max_length=128),
    media_type: MediaType | None = Query(None),
    sort_by: SortField = Query(SortField.CREATED_AT),
    descending: bool = Query(True),
    page: int = Query(1, ge=1),
    per_page: int = Query(24, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
    user_id: int = Depends(get_current_user_id),
) -> MediaListResponse:
    """Liste les médias de l'utilisateur connecté avec pagination et tri sécurisé."""
    user = await db.get(User, user_id)

    # Base query : filtre par propriétaire (sauf admin).
    stmt = select(MediaItem)
    if not user.is_admin:
        stmt = stmt.where(MediaItem.owner_id == user_id)

    # Filtre par type.
    if media_type:
        stmt = stmt.where(MediaItem.media_type == media_type)

    # Recherche (LIKE paramétré — pas d'interpolation).
    if search:
        stmt = stmt.where(MediaItem.title.ilike(f"%{search}%"))

    # Tri : sort_by est un Enum validé par Pydantic → pas d'injection possible.
    col = getattr(MediaItem, sort_by.value)
    stmt = stmt.order_by(col.desc() if descending else col.asc())

    # Total pour la pagination.
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = await db.scalar(count_stmt) or 0

    # Pagination.
    stmt = stmt.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    items = result.scalars().all()

    return MediaListResponse(
        items=[MediaResponse.model_validate(i) for i in items],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/upload", response_model=MediaResponse, status_code=status.HTTP_201_CREATED)
async def upload_media(
    request: Request,
    file: UploadFile = File(...),
    password: str = Form(..., min_length=8),
    db: AsyncSession = Depends(get_session),
    user_id: int = Depends(get_current_user_id),
) -> MediaResponse:
    """Chiffre et stocke un fichier dans le vault.

    Le mot de passe voyage dans le corps de la requête POST (HTTPS uniquement).
    Il n'est jamais stocké — il sert uniquement à dériver la clé de chiffrement.
    """
    # Validation de l'extension depuis le nom de fichier original.
    ext = Path(file.filename or "").suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Extension non autorisée : {ext}. "
                   f"Formats acceptés : {', '.join(sorted(settings.ALLOWED_EXTENSIONS))}",
        )

    # Écriture du fichier reçu dans un temp file pour pouvoir le chiffrer.
    temp_path = settings.VAULT_DIR / f"_tmp_{uuid.uuid4().hex}{ext}"
    encrypted_filename = f"{uuid.uuid4().hex}.enc"
    encrypted_path = settings.VAULT_DIR / encrypted_filename

    file_salt = generate_salt()
    base_iv = generate_iv()

    try:
        # Lecture par chunks pour ne pas charger le fichier entier en RAM.
        with temp_path.open("wb") as tmp:
            size = 0
            while chunk := await file.read(1024 * 1024):  # 1 Mo par chunk
                size = size + len(chunk)
                if size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
                    raise HTTPException(status_code=413, detail="Fichier trop volumineux.")
                tmp.write(chunk)

        # Chiffrement AES-256-GCM par blocs.
        await encrypt_file(
            source_path=temp_path,
            dest_path=encrypted_path,
            password=password,
            file_salt=file_salt,
            base_iv=base_iv,
        )

        media = MediaItem(
            title=Path(file.filename or "").stem,
            original_filename=file.filename or "",
            extension=ext,
            media_type=_get_media_type(ext),
            size_bytes=size,
            encrypted_filename=encrypted_filename,
            file_iv=base_iv.hex(),
            file_kdf_salt=file_salt.hex(),
            owner_id=user_id,
        )
        db.add(media)
        await db.commit()
        await db.refresh(media)
        return MediaResponse.model_validate(media)

    except HTTPException:
        raise
    except Exception as exc:
        # Nettoyage des fichiers partiels en cas d'erreur.
        encrypted_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Erreur lors du chiffrement : {exc}") from exc
    finally:
        # Le fichier temporaire en clair est TOUJOURS supprimé.
        temp_path.unlink(missing_ok=True)


@router.post("/{media_id}/stream")
async def stream_media(
    media_id: int,
    request: Request,
    password: str = Form(...),
    db: AsyncSession = Depends(get_session),
    user_id: int = Depends(get_current_user_id),
) -> StreamingResponse:
    """Déchiffre et streame un fichier à la volée.

    POST (et non GET) pour que le mot de passe passe dans le corps, pas dans l'URL.
    Le plaintext ne touche jamais le disque : decrypt_file_stream() est un générateur
    async qui yield les blocs déchiffrés directement vers le client.
    """
    user = await db.get(User, user_id)
    item = await db.get(MediaItem, media_id)

    if item is None or (item.owner_id != user_id and not user.is_admin):
        # Même message pour "introuvable" et "accès refusé" → pas d'énumération.
        raise HTTPException(status_code=404, detail="Fichier introuvable.")

    encrypted_path = settings.VAULT_DIR / item.encrypted_filename
    if not encrypted_path.exists():
        raise HTTPException(status_code=404, detail="Fichier chiffré manquant dans le vault.")

    file_salt = bytes.fromhex(item.file_kdf_salt)
    base_iv = bytes.fromhex(item.file_iv)

    try:
        generator = decrypt_file_stream(encrypted_path, password, file_salt, base_iv)
        return StreamingResponse(
            generator,
            media_type=_get_mime_type(item.extension),
            headers={
                "Content-Disposition": f'inline; filename="{item.original_filename}"',
                # Interdit la mise en cache du contenu déchiffré.
                "Cache-Control": "no-store, no-cache, must-revalidate",
                "Pragma": "no-cache",
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=401, detail="Mot de passe incorrect ou fichier corrompu.")


@router.patch("/{media_id}/title", response_model=MediaResponse)
async def rename_media(
    media_id: int,
    body: RenameTitleRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
    user_id: int = Depends(get_current_user_id),
) -> MediaResponse:
    """Renomme un fichier (titre affiché uniquement, pas le nom chiffré)."""
    user = await db.get(User, user_id)
    item = await db.get(MediaItem, media_id)

    if item is None or (item.owner_id != user_id and not user.is_admin):
        raise HTTPException(status_code=404, detail="Fichier introuvable.")

    item.title = body.title
    await db.commit()
    await db.refresh(item)
    return MediaResponse.model_validate(item)


@router.delete("/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(
    media_id: int,
    request: Request,
    db: AsyncSession = Depends(get_session),
    user_id: int = Depends(get_current_user_id),
) -> None:
    """Supprime un fichier du vault et de la BDD."""
    user = await db.get(User, user_id)
    item = await db.get(MediaItem, media_id)

    if item is None or (item.owner_id != user_id and not user.is_admin):
        raise HTTPException(status_code=404, detail="Fichier introuvable.")

    # Suppression du fichier chiffré (le seul existant — pas de copie en clair).
    encrypted_path = settings.VAULT_DIR / item.encrypted_filename
    encrypted_path.unlink(missing_ok=True)

    await db.delete(item)
    await db.commit()
