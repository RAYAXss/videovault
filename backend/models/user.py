"""
models/user.py — Modèle SQLAlchemy pour les utilisateurs.

Sécurité :
  - Le mot de passe n'est JAMAIS stocké en clair : seul le hash bcrypt est persisté.
  - kdf_salt est le sel PBKDF2 utilisé pour dériver la clé de chiffrement des fichiers
    à partir du mot de passe. Il est unique par utilisateur, généré à l'inscription.
    → Même si deux utilisateurs ont le même mot de passe, leurs clés dérivées diffèrent.
  - failed_login_attempts + locked_until : protection brute-force côté BDD en plus
    du rate limiting réseau (défense en profondeur).
"""

from datetime import datetime
from sqlalchemy import String, Integer, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    # Hash bcrypt du mot de passe. bcrypt inclut son propre sel — pas besoin d'en ajouter.
    hashed_password: Mapped[str] = mapped_column(String(256), nullable=False)
    # Sel PBKDF2 pour la dérivation de clé (hex 32 bytes = 64 chars).
    kdf_salt: Mapped[str] = mapped_column(String(64), nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Protection brute-force côté BDD.
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
