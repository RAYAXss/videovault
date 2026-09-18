"""
models/user.py — Modèle SQLAlchemy pour les utilisateurs.

Champ email ajouté pour la récupération de compte (optionnel).
Avertissement : l'email réduit la sécurité — documenté dans les paramètres UI.
"""

from datetime import datetime
from sqlalchemy import String, Integer, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(256), nullable=False)
    kdf_salt: Mapped[str] = mapped_column(String(64), nullable=False)

    # Email optionnel pour récupération de compte.
    # N'est PAS utilisé pour l'authentification principale.
    email: Mapped[str | None] = mapped_column(String(256), nullable=True, unique=True, index=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
