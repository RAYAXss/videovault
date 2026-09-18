"""
routers/media.py — Gestion des médias.

Nouveautés :
  - Upload avec chiffrement optionnel (is_encrypted flag)
  - Import depuis URL externe via yt-dlp (YouTube, Vimeo, etc.)
  - Stream adapté : si is_encrypted=False, sert le fichier directement
  - Fix Windows : yt-dlp résolu depuis le venv, pas seulement le PATH système

Sécurité URL import :
  - L'URL est validée (schéma http/https uniquement, pas de file://)
  - yt-dlp tourne dans un sous-processus isolé avec timeout
  - Le fichier téléchargé est optionnellement chiffré avant stockage
  - Le fichier temporaire est toujours supprimé après traitement
"""

import asyncio
import logging
import shutil
import subprocess
import sys
import traceback
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
logger = logging.getLogger(__name__)

# Extensions autorisées pour l'import URL (vidéo uniquement)
URL_IMPORT_EXTENSIONS = {".mp4", ".mkv", ".webm", ".mov", ".avi"}


def _resolve_ytdlp() -> str:
    """
    Résout le chemin vers yt-dlp en cherchant d'abord dans le venv courant
    (même dossier que l'exécutable Python), puis dans le PATH système.
    Retourne le chemin absolu ou lève HTTPException 501.
    """
    # 1. Même dossier que python.exe (venv Windows : Scripts/, Unix : bin/)
    python_dir = Path(sys.executable).parent
    for candidate in ["yt-dlp.exe", "yt-dlp"]:
        p = python_dir / candidate
        if p.exists():
            logger.info(f"yt-dlp trouvé dans le venv : {p}")
            return str(p)

    # 2. PATH système
    found = shutil.which("yt-dlp")
    if found:
        logger.info(f"yt-dlp trouvé dans le PATH : {found}")
        return found

    raise HTTPException(
        status_code=501,
        detail="yt-dlp n'est pas installé. Lancez : pip install yt-dlp",
    )


def _resolve_ffmpeg() -> bool:
    """Vérifie que ffmpeg est disponible (requis pour merger audio+vidéo)."""
    python_dir = Path(sys.executable).parent
    for candidate in ["ffmpeg.exe", "ffmpeg"]:
        if (python_dir / candidate).exists():
            return True
    return shutil.which("ffmpeg") is not None


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
        logger.error(f"Erreur upload : {traceback.format_exc()}")
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

    # Résoudre yt-dlp (venv d'abord, puis PATH)
    ytdlp_path = _resolve_ytdlp()

    # Avertir si ffmpeg absent (merge audio+video impossible)
    if not _resolve_ffmpeg():
        logger.warning(
            "ffmpeg introuvable — yt-dlp ne pourra pas merger audio+vidéo. "
            "Installez ffmpeg : https://ffmpeg.org/download.html"
        )

    file_uuid = uuid.uuid4().hex
    temp_dir = settings.VAULT_DIR / f"_ytdl_{file_uuid}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_output = temp_dir / "%(title)s.%(ext)s"

    logger.info(f"[import-url] Démarrage téléchargement : {body.url}")
    logger.info(f"[import-url] yt-dlp path : {ytdlp_path}")
    logger.info(f"[import-url] temp_dir : {temp_dir}")

    try:
        cmd = [
            ytdlp_path,
            "--no-playlist",
            "--format", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "--merge-output-format", "mp4",
            "--output", str(temp_output),
            "--max-filesize", f"{settings.MAX_UPLOAD_SIZE_MB}M",
            "--no-warnings",
            # Retiré --quiet pour voir les erreurs dans les logs
            body.url,
        ]
        logger.info(f"[import-url] Commande : {' '.join(cmd)}")

        def _run_ytdlp() -> subprocess.CompletedProcess:
            return subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=600,
            )

        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(_run_ytdlp),
                timeout=620,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=408, detail="Timeout : le téléchargement a pris trop longtemps.")
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=408, detail="Timeout yt-dlp.")

        stdout_str = result.stdout.decode(errors="replace").strip()
        stderr_str = result.stderr.decode(errors="replace").strip()

        if stdout_str:
            logger.info(f"[import-url] yt-dlp stdout :\n{stdout_str}")
        if stderr_str:
            logger.warning(f"[import-url] yt-dlp stderr :\n{stderr_str}")

        logger.info(f"[import-url] yt-dlp returncode : {result.returncode}")

        if result.returncode != 0:
            logger.error(f"[import-url] yt-dlp a échoué (code {result.returncode}) :\n{stderr_str}")
            if settings.DEBUG:
                raise HTTPException(
                    status_code=422,
                    detail=f"yt-dlp error (code {result.returncode}) : {stderr_str[:500]}",
                )
            raise HTTPException(
                status_code=422,
                detail="Impossible de télécharger cette URL. Vérifiez qu'elle est supportée.",
            )

        # Trouver le fichier téléchargé
        downloaded_files = [f for f in temp_dir.glob("*") if f.is_file()]
        logger.info(f"[import-url] Fichiers dans temp_dir : {downloaded_files}")

        if not downloaded_files:
            raise HTTPException(status_code=422, detail="Aucun fichier téléchargé.")

        # Prendre le plus gros fichier si plusieurs (cas du merge partiel)
        downloaded = max(downloaded_files, key=lambda f: f.stat().st_size)
        ext = downloaded.suffix.lower()
        logger.info(f"[import-url] Fichier sélectionné : {downloaded} ({ext})")

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
        logger.info(f"[import-url] Succès : media_id={media.id}, titre={title}")
        return MediaResponse.model_validate(media)

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[import-url] Erreur inattendue :\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Erreur d'import : {exc}") from exc
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@router.post("/{media_id}/stream", response_model=None)
async def stream_media(
    media_id: int,
    request: Request,
    password: str = Form(default=""),
    db: AsyncSession = Depends(get_session),
    user_id: int = Depends(get_current_user_id),
):
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

    # Sanitize filename pour HTTP headers (latin-1 uniquement)
    # RFC 5987 : utiliser filename* pour les caractères non-ASCII
    import urllib.parse
    safe_filename = item.original_filename.encode("ascii", errors="ignore").decode("ascii") or "file"
    encoded_filename = urllib.parse.quote(item.original_filename, safe="")
    headers = {
        "Content-Disposition": (
            f'inline; filename="{safe_filename}"; ' 
            f"filename*=UTF-8''{encoded_filename}"
        ),
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
    }

    if not item.is_encrypted:
        return FileResponse(
            path=stored_path,
            media_type=mime,
            headers=headers,
        )

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