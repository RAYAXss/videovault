"""
models/media_item.py — Modèle SQLAlchemy pour les fichiers chiffrés.

Points de sécurité :
  - encrypted_path stocke UNIQUEMENT le nom du fichier (ex: "abc123.enc"), pas le
    chemin absolu. Le chemin complet est reconstruit côté serveur via VAULT_DIR.
    → Même si la BDD est exfiltrée, l'attaquant ne sait pas où est le vault.
  - file_iv (Initialization Vector) est stocké ici car il est nécessaire au
    déchiffrement mais n'est pas secret en lui-même. Chaque fichier a son propre IV.
  - owner_id lie chaque fichier à un utilisateur → contrôle d'accès au niveau données.
    Un utilisateur ne peut accéder qu'aux fichiers dont il est propriétaire (ou admin).
"""

from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Integer, BigInteger, ForeignKey, DateTime, Enum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class MediaType(str, PyEnum):
    VIDEO = "video"
    SCAN = "scan"
    DOCUMENT = "document"


class MediaItem(Base):
    __tablename__ = "media_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Métadonnées visibles (non sensibles).
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(256), nullable=False)
    extension: Mapped[str] = mapped_column(String(16), nullable=False)
    media_type: Mapped[MediaType] = mapped_column(Enum(MediaType), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Chiffrement : nom du fichier .enc dans le vault + IV Base64.
    encrypted_filename: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    # L'IV AES-GCM (12 bytes) encodé en hex — public, nécessaire au déchiffrement.
    file_iv: Mapped[str] = mapped_column(String(32), nullable=False)
    # Sel PBKDF2 propre à ce fichier (différent du kdf_salt utilisateur).
    # → Même clé utilisateur, même fichier importé deux fois = IVs et sels différents.
    file_kdf_salt: Mapped[str] = mapped_column(String(64), nullable=False)

    # Appartenance.
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
