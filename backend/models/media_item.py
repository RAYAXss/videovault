"""
models/media_item.py — Modèle SQLAlchemy pour les fichiers.

Nouveau champ is_encrypted : permet le stockage optionnel sans chiffrement.
Quand is_encrypted=False, file_iv et file_kdf_salt sont des chaînes vides.
"""

from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Integer, BigInteger, ForeignKey, DateTime, Enum, func, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class MediaType(str, PyEnum):
    VIDEO = "video"
    SCAN = "scan"
    DOCUMENT = "document"


class MediaItem(Base):
    __tablename__ = "media_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    title: Mapped[str] = mapped_column(String(256), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(256), nullable=False)
    extension: Mapped[str] = mapped_column(String(16), nullable=False)
    media_type: Mapped[MediaType] = mapped_column(Enum(MediaType), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Nom du fichier dans le vault (UUID.enc ou UUID.ext si non chiffré)
    encrypted_filename: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)

    # Chiffrement optionnel
    is_encrypted: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Vide si is_encrypted=False
    file_iv: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    file_kdf_salt: Mapped[str] = mapped_column(String(64), nullable=False, default="")

    owner_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner: Mapped["User"] = relationship("User", lazy="select")  # type: ignore[name-defined]

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
