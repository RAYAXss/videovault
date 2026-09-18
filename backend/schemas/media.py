"""
schemas/media.py — Schémas Pydantic pour les médias.
"""

from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field

from backend.models.media_item import MediaType


class SortField(str, Enum):
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
    is_encrypted: bool
    created_at: datetime
    updated_at: datetime
    # Jamais renvoyé au client : encrypted_filename, file_iv, file_kdf_salt

    model_config = {"from_attributes": True}


class MediaListResponse(BaseModel):
    items: list[MediaResponse]
    total: int
    page: int
    per_page: int


class RenameTitleRequest(BaseModel):
    title: str = Field(min_length=1, max_length=256)


class ImportUrlRequest(BaseModel):
    url: str = Field(min_length=10, max_length=2048)
    password: str | None = None
    encrypted: bool = True
