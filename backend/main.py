"""
main.py — Point d'entrée FastAPI de VideoVault.

Décisions d'architecture :
- Lifespan context manager pour init/teardown propres (pas de @app.on_event dépréciés).
- CORS strict : seule l'origine du frontend est autorisée ; credentials=True pour
  envoyer les cookies httpOnly cross-origin en développement local.
- Tous les headers de sécurité sont ajoutés par SecurityHeadersMiddleware (middleware/).
- Le rate limiting est géré au niveau du router /auth via slowapi.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database import init_db
from backend.routers import auth, media
from backend.middleware.security import SecurityHeadersMiddleware
from backend.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise la BDD au démarrage, rien à libérer à l'arrêt."""
    await init_db()
    yield


app = FastAPI(
    title="VideoVault API",
    version="1.0.0",
    # Désactive la doc Swagger en production pour ne pas exposer les endpoints.
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url=None,
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# allow_credentials=True est nécessaire pour que le frontend puisse envoyer
# les cookies httpOnly. En production, FRONTEND_URL doit être le domaine exact.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)

# ── Middleware de sécurité ────────────────────────────────────────────────────
app.add_middleware(SecurityHeadersMiddleware)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(media.router, prefix="/api/media", tags=["media"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
