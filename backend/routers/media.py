"""
routers/media.py — Gestion des médias.

Nouveautés :
  - Upload avec chiffrement optionnel (is_encrypted flag)
  - Import depuis URL externe via yt-dlp (YouTube, Vimeo, etc.)
  - Stream adapté : si is_encrypted=False, sert le fichier directement

Sécurité URL import :
  - L'URL est validée (schéma http/https uniquement, pas de file://)
  - yt-dlp tourne dans un sous-processus isolé avec timeout
  - Le fichier téléchargé est optionnellement chiffré avant stockage
  - Le fichier temporaire est toujours supprimé après traitement
"""

import asyncio
import shutil
import subprocess
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.models.media_item import MediaItem, MediaType
from backend.models.user import User
from backend.schemas.media import (
    MediaListResponse, MediaResponse, RenameTitleRequest,
    SortField, ImportUrlRequest,
)
from backend.services.auth import get_current_user_id
from backend.services.crypto import (
    encrypt_file, decrypt_file_stream,
    generate_salt, generate_iv,
)
from backend.config import settings

router = APIRouter()

# Extensions autorisées pour l'import URL (vidéo uniquement)
URL_IMPORT_EXTENSIONS = {".mp4", ".mkv", ".webm", ".mov", ".avi"}


def _get_media_type(extension: str) -> MediaType:
    if extension in {".mp4", ".mkv", ".avi", ".mov", ".webm"}:
        return MediaType.VIDEO
    if extension in {".pdf"}:
        return MediaType.DOCUMENT
    return MediaType.SCAN


def _get_mime_type(extension: str) -> str:
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


def _validate_url(url: str) -> None:
    """Valide que l'URL est http/https et non une ressource locale."""
    import urllib.parse
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=422,
            detail="L'URL doit utiliser le protocole http ou https.",
        )
    if not parsed.netloc:
        raise HTTPException(status_code=422, detail="URL invalide.")
    # Bloquer les IPs locales / loopback
    host = parsed.hostname or ""
    blocked = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}
    if host in blocked or host.startswith("192.168.") or host.startswith("10."):
        raise HTTPException(status_code=422, detail="URL non autorisée.")


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
    user = await db.get(User, user_id)
    stmt = select(MediaItem)
    if not user.is_admin:
        stmt = stmt.where(MediaItem.owner_id == user_id)
    if media_type:
        stmt = stmt.where(MediaItem.media_type == media_type)
    if search:
        stmt = stmt.where(MediaItem.title.ilike(f"%{search}%"))

    col = getattr(MediaItem, sort_by.value)
    stmt = stmt.order_by(col.desc() if descending else col.asc())

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = await db.scalar(count_stmt) or 0

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
    password: str | None = Form(default=None),
    encrypted: str = Form(default="true"),
    db: AsyncSession = Depends(get_session),
    user_id: int = Depends(get_current_user_id),
) -> MediaResponse:
    """Upload d'un fichier avec chiffrement optionnel."""
    should_encrypt = encrypted.lower() == "true" and password is not None

    if should_encrypt and (not password or len(password) < 8):
        raise HTTPException(status_code=422, detail="Mot de passe requis (min 8 caractères) pour le chiffrement.")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Extension non autorisée : {ext}.",
        )

    file_uuid = uuid.uuid4().hex
    # Nom du fichier stocké : .enc si chiffré, extension originale sinon
    stored_filename = f"{file_uuid}.enc" if should_encrypt else f"{file_uuid}{ext}"
    stored_path = settings.VAULT_DIR / stored_filename
    temp_path = settings.VAULT_DIR / f"_tmp_{file_uuid}{ext}"

    file_salt = generate_salt() if should_encrypt else b""
    base_iv = generate_iv() if should_encrypt else b""

    try:
        with temp_path.open("wb") as tmp:
            size = 0
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
                    raise HTTPException(status_code=413, detail="Fichier trop volumineux.")
                tmp.write(chunk)

        if should_encrypt:
            await encrypt_file(
                source_path=temp_path,
                dest_path=stored_path,
                password=password,
                file_salt=file_salt,
                base_iv=base_iv,
            )
        else:
            # Pas de chiffrement : copie directe
            shutil.copy2(temp_path, stored_path)

        media = MediaItem(
            title=Path(file.filename or "").stem,
            original_filename=file.filename or "",
            extension=ext,
            media_type=_get_media_type(ext),
            size_bytes=size,
            encrypted_filename=stored_filename,
            is_encrypted=should_encrypt,
            file_iv=base_iv.hex() if should_encrypt else "",
            file_kdf_salt=file_salt.hex() if should_encrypt else "",
            owner_id=user_id,
        )
        db.add(media)
        await db.commit()
        await db.refresh(media)
        return MediaResponse.model_validate(media)

    except HTTPException:
        raise
    except Exception as exc:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Erreur : {exc}") from exc
    finally:
        temp_path.unlink(missing_ok=True)


@router.post("/import-url", response_model=MediaResponse, status_code=status.HTTP_201_CREATED)
async def import_from_url(
    body: ImportUrlRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
    user_id: int = Depends(get_current_user_id),
) -> MediaResponse:
    """
    Importe une vidéo depuis une URL externe (YouTube, Vimeo, etc.) via yt-dlp.

    Sécurité :
      - URL validée (http/https uniquement, pas d'IP locale)
      - yt-dlp tourne en subprocess avec timeout de 10 minutes
      - Fichier temporaire supprimé quoi qu'il arrive
      - Chiffrement optionnel avant stockage final
    """
    _validate_url(body.url)

    should_encrypt = body.encrypted and body.password is not None
    if should_encrypt and (not body.password or len(body.password) < 8):
        raise HTTPException(status_code=422, detail="Mot de passe requis (min 8 caractères).")

    # Vérifier que yt-dlp est disponible
    if not shutil.which("yt-dlp"):
        raise HTTPException(
            status_code=501,
            detail="yt-dlp n'est pas installé sur le serveur. Contactez l'administrateur.",
        )

    file_uuid = uuid.uuid4().hex
    temp_dir = settings.VAULT_DIR / f"_ytdl_{file_uuid}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_output = temp_dir / "%(title)s.%(ext)s"

    try:
        # Lancer yt-dlp en subprocess (isolé, avec timeout)
        proc = await asyncio.create_subprocess_exec(
            "yt-dlp",
            "--no-playlist",
            "--format", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "--merge-output-format", "mp4",
            "--output", str(temp_output),
            "--max-filesize", f"{settings.MAX_UPLOAD_SIZE_MB}M",
            "--no-warnings",
            "--quiet",
            body.url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=600)
        except asyncio.TimeoutError:
            proc.kill()
            raise HTTPException(status_code=408, detail="Timeout : le téléchargement a pris trop longtemps.")

        if proc.returncode != 0:
            err_msg = stderr.decode(errors="replace").strip()
            # Masquer les détails techniques en prod
            if settings.DEBUG:
                raise HTTPException(status_code=422, detail=f"yt-dlp error: {err_msg}")
            raise HTTPException(status_code=422, detail="Impossible de télécharger cette URL. Vérifiez qu'elle est supportée.")

        # Trouver le fichier téléchargé
        downloaded_files = list(temp_dir.glob("*"))
        if not downloaded_files:
            raise HTTPException(status_code=422, detail="Aucun fichier téléchargé.")

        downloaded = downloaded_files[0]
        ext = downloaded.suffix.lower()
        if ext not in URL_IMPORT_EXTENSIONS:
            raise HTTPException(status_code=422, detail=f"Format non supporté : {ext}")

        size = downloaded.stat().st_size
        if size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Fichier trop volumineux.")

        # Chiffrement ou copie directe
        stored_filename = f"{file_uuid}.enc" if should_encrypt else f"{file_uuid}{ext}"
        stored_path = settings.VAULT_DIR / stored_filename

        file_salt = generate_salt() if should_encrypt else b""
        base_iv = generate_iv() if should_encrypt else b""

        if should_encrypt:
            await encrypt_file(
                source_path=downloaded,
                dest_path=stored_path,
                password=body.password,
                file_salt=file_salt,
                base_iv=base_iv,
            )
        else:
            shutil.copy2(downloaded, stored_path)

        # Titre = nom du fichier sans extension
        title = downloaded.stem[:256]

        media = MediaItem(
            title=title,
            original_filename=downloaded.name,
            extension=ext,
            media_type=MediaType.VIDEO,
            size_bytes=size,
            encrypted_filename=stored_filename,
            is_encrypted=should_encrypt,
            file_iv=base_iv.hex() if should_encrypt else "",
            file_kdf_salt=file_salt.hex() if should_encrypt else "",
            owner_id=user_id,
        )
        db.add(media)
        await db.commit()
        await db.refresh(media)
        return MediaResponse.model_validate(media)

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur d'import : {exc}") from exc
    finally:
        # Nettoyage du dossier temporaire (toujours)
        shutil.rmtree(temp_dir, ignore_errors=True)


@router.post("/{media_id}/stream")
async def stream_media(
    media_id: int,
    request: Request,
    password: str = Form(default=""),
    db: AsyncSession = Depends(get_session),
    user_id: int = Depends(get_current_user_id),
) -> StreamingResponse | FileResponse:
    """
    Déchiffre et streame un fichier.

    Si is_encrypted=False : sert le fichier directement (password ignoré).
    Si is_encrypted=True  : déchiffre à la volée avec le mot de passe fourni.
    """
    user = await db.get(User, user_id)
    item = await db.get(MediaItem, media_id)

    if item is None or (item.owner_id != user_id and not user.is_admin):
        raise HTTPException(status_code=404, detail="Fichier introuvable.")

    stored_path = settings.VAULT_DIR / item.encrypted_filename
    if not stored_path.exists():
        raise HTTPException(status_code=404, detail="Fichier manquant dans le vault.")

    mime = _get_mime_type(item.extension)
    headers = {
        "Content-Disposition": f'inline; filename="{item.original_filename}"',
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
    }

    if not item.is_encrypted:
        # Fichier en clair : FileResponse simple
        return FileResponse(
            path=stored_path,
            media_type=mime,
            headers=headers,
        )

    # Fichier chiffré : streaming déchiffrement
    if not password or len(password) < 8:
        raise HTTPException(status_code=422, detail="Mot de passe requis pour déchiffrer ce fichier.")

    file_salt = bytes.fromhex(item.file_kdf_salt)
    base_iv = bytes.fromhex(item.file_iv)

    try:
        generator = decrypt_file_stream(stored_path, password, file_salt, base_iv)
        return StreamingResponse(generator, media_type=mime, headers=headers)
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
    user = await db.get(User, user_id)
    item = await db.get(MediaItem, media_id)
    if item is None or (item.owner_id != user_id and not user.is_admin):
        raise HTTPException(status_code=404, detail="Fichier introuvable.")
    stored_path = settings.VAULT_DIR / item.encrypted_filename
    stored_path.unlink(missing_ok=True)
    await db.delete(item)
    await db.commit()
