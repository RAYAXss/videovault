from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    DEBUG: bool = False
    FRONTEND_URL: str = "http://localhost:5173"
    DATABASE_URL: str = "sqlite+aiosqlite:///./videovault.db"

    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION_use_secrets_token_hex_32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    PBKDF2_ITERATIONS: int = 600_000

    VAULT_DIR: Path = Path("vault")
    ALLOWED_EXTENSIONS: frozenset[str] = frozenset({
        ".mp4", ".mkv", ".avi", ".mov", ".webm",
        ".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".webp",
    })
    MAX_UPLOAD_SIZE_MB: int = 4096
    LOGIN_RATE_LIMIT: str = "5/minute"


settings = Settings()
settings.VAULT_DIR.mkdir(parents=True, exist_ok=True)
