"""
database.py — Couche d'accès async SQLAlchemy.

Pourquoi async ?
  Le déchiffrement/streaming de fichiers volumineux est I/O-bound. Avec un moteur
  async (aiosqlite / asyncpg), FastAPI peut servir d'autres requêtes pendant qu'une
  lecture de fichier est en cours, sans bloquer le thread principal.

Sécurité SQL :
  Toutes les requêtes passent par l'ORM SQLAlchemy ou des paramètres bindés explicites.
  Il n'y a AUCUNE interpolation de chaîne dans les requêtes SQL → immunité contre
  l'injection SQL. Les colonnes de tri sont validées par enum Pydantic avant d'atteindre
  la couche BDD (voir schemas/media.py).
"""

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from backend.config import settings


engine = create_async_engine(
    settings.DATABASE_URL,
    # echo=True en debug uniquement — n'exposer jamais les requêtes SQL en prod.
    echo=settings.DEBUG,
    # pool_pre_ping vérifie la connexion avant usage (évite les "connection closed").
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def init_db() -> None:
    """Crée toutes les tables au démarrage si elles n'existent pas."""
    # Import des modèles ici pour que Base les connaisse.
    from backend.models import user, media_item  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncSession:
    """Dependency FastAPI : fournit une session async par requête."""
    async with AsyncSessionLocal() as session:
        yield session
