"""
schemas/media.py — Schémas Pydantic pour les médias.

SortField est un Enum strict : seules les colonnes whitelistées peuvent être
utilisées comme critère de tri. Cela empêche toute injection SQL via le paramètre
de tri (ex: ?sort_by=id;DROP TABLE users--).
"""

from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field

from backend.models.media_item import MediaType


class SortField(str, Enum):
    """Colonnes de tri autorisées — whitelist stricte, pas d'interpolation libre."""
    TITLE = "title"
    CREATED_AT = "created_at"
    SIZE = "size_bytes"
    DURATION = "duration_seconds"


class MediaResponse(BaseModel):
    id: int
    title: str
    original_filename: str
    extension: str
    media_type: MediaType
    size_bytes: int
    duration_seconds: int | None
    created_at: datetime
    updated_at: datetime
    # On ne renvoie jamais encrypted_filename, file_iv, file_kdf_salt au client.

    model_config = {"from_attributes": True}


class MediaListResponse(BaseModel):
    items: list[MediaResponse]
    total: int
    page: int
    per_page: int


class RenameTitleRequest(BaseModel):
    title: str = Field(min_length=1, max_length=256)
