"""
config.py — Configuration centralisée via variables d'environnement.

Pourquoi pydantic-settings ?
  - Validation automatique des types au démarrage (une mauvaise config plante vite,
    pas silencieusement en production).
  - Lecture depuis .env + env vars système, avec priorité aux env vars (12-factor app).
  - SECRET_KEY et DATABASE_URL ne doivent JAMAIS être commités : ils viennent de l'env.

Sécurité :
  - SECRET_KEY sert à signer les JWT ; elle doit faire ≥ 32 octets aléatoires.
  - ACCESS_TOKEN_EXPIRE_MINUTES court (15 min) + refresh token long (7 jours)
    = compromis sécurité / UX standard.
  - PBKDF2_ITERATIONS à 600 000 : recommandation OWASP 2023 pour PBKDF2-HMAC-SHA256.
"""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # ── Général ───────────────────────────────────────────────────────────────
    DEBUG: bool = False
    FRONTEND_URL: str = "http://localhost:5173"

    # ── Base de données ───────────────────────────────────────────────────────
    # SQLite par défaut (dev), PostgreSQL en prod via DATABASE_URL=postgresql+asyncpg://...
    DATABASE_URL: str = "sqlite+aiosqlite:///./videovault.db"

    # ── Auth / JWT ────────────────────────────────────────────────────────────
    # Générer avec : python -c "import secrets; print(secrets.token_hex(32))"
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION_use_secrets_token_hex_32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Dérivation de clé (KDF) ───────────────────────────────────────────────
    # PBKDF2-HMAC-SHA256 : 600 000 itérations = recommandation OWASP 2023.
    # Augmenter si le hardware le permet (attention : chaque déchiffrement recalcule).
    PBKDF2_ITERATIONS: int = 600_000

    # ── Fichiers ───────────────────────────────────────────────────────────────
    VAULT_DIR: Path = Path("vault")
    ALLOWED_EXTENSIONS: frozenset[str] = frozenset({
        # Vidéo
        ".mp4", ".mkv", ".avi", ".mov", ".webm",
        # Documents / scans
        ".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".webp",
    })
    MAX_UPLOAD_SIZE_MB: int = 4096  # 4 Go

    # ── Rate limiting (login) ─────────────────────────────────────────────────
    # 5 tentatives / minute par IP avant blocage → protection brute-force.
    LOGIN_RATE_LIMIT: str = "5/minute"


settings = Settings()

# Création du dossier vault au chargement du module.
settings.VAULT_DIR.mkdir(parents=True, exist_ok=True)
