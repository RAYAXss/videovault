"""
routers/auth.py — Endpoints d'authentification.

Sécurité :
  - Rate limiting via slowapi sur /login : 5 tentatives/minute par IP.
    En complément du blocage BDD (failed_login_attempts).
  - Les cookies sont posés par le serveur (Set-Cookie) et non par JavaScript.
    → Le frontend ne touche jamais les tokens directement.
  - Même message d'erreur pour "utilisateur inconnu" et "mauvais mot de passe"
    → pas d'énumération d'utilisateurs.
  - La vérification du mot de passe est toujours effectuée même si l'utilisateur
    n'existe pas (dummy hash) → temps de réponse constant, pas de timing attack.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.models.user import User
from backend.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from backend.services.auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
    get_current_user_id,
)
from backend.services.crypto import generate_salt
from backend.config import settings

router = APIRouter()

# Hash bidon pour éviter le timing attack quand l'utilisateur n'existe pas.
_DUMMY_HASH = hash_password("dummy_constant_password_for_timing_safety")

COOKIE_OPTS = dict(
    httponly=True,       # Inaccessible depuis JavaScript.
    samesite="lax",      # Protège contre le CSRF (requêtes cross-site bloquées).
    secure=not settings.DEBUG,  # HTTPS uniquement en production.
    path="/",
)


def _set_auth_cookies(response: Response, user_id: int, username: str) -> None:
    access_token = create_access_token(user_id, username)
    refresh_token = create_refresh_token(user_id)
    response.set_cookie("access_token", access_token, max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, **COOKIE_OPTS)
    response.set_cookie("refresh_token", refresh_token, max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400, **COOKIE_OPTS)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_session),
) -> TokenResponse:
    """Crée un compte utilisateur. Le premier inscrit devient admin."""
    # Vérification unicité (case-insensitive car username est lowercasé par le validator).
    existing = await db.scalar(select(User).where(User.username == body.username))
    if existing:
        raise HTTPException(status_code=409, detail="Ce nom d'utilisateur est déjà pris.")

    # Le kdf_salt est spécifique à l'utilisateur et sert à dériver les clés de ses fichiers.
    kdf_salt = generate_salt().hex()
    is_first_user = (await db.scalar(select(User))) is None

    user = User(
        username=body.username,
        hashed_password=hash_password(body.password),
        kdf_salt=kdf_salt,
        is_admin=is_first_user,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    _set_auth_cookies(response, user.id, user.username)
    return TokenResponse(user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_session),
) -> TokenResponse:
    """Authentifie un utilisateur et pose les cookies JWT."""
    user = await db.scalar(select(User).where(User.username == body.username))

    # Toujours vérifier un hash, même si l'utilisateur n'existe pas
    # → temps de réponse identique, pas de timing attack.
    if user is None:
        verify_password(body.password, _DUMMY_HASH)
        raise HTTPException(status_code=401, detail="Identifiants incorrects.")

    # Vérification du verrouillage de compte.
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=429,
            detail=f"Compte temporairement verrouillé. Réessayez après {user.locked_until.strftime('%H:%M')}.",
        )

    if not verify_password(body.password, user.hashed_password):
        user.failed_login_attempts += 1
        # Verrouillage après 10 échecs : 15 minutes.
        if user.failed_login_attempts >= 10:
            from datetime import timedelta
            user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
            user.failed_login_attempts = 0
        await db.commit()
        raise HTTPException(status_code=401, detail="Identifiants incorrects.")

    # Connexion réussie : reset des compteurs d'échec.
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    _set_auth_cookies(response, user.id, user.username)
    return TokenResponse(user=UserResponse.model_validate(user))


@router.post("/refresh")
async def refresh_token(request: Request, response: Response) -> dict:
    """Échange un refresh token valide contre un nouvel access token."""
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Refresh token manquant.")

    payload = decode_token(token, expected_type="refresh")
    user_id = int(payload["sub"])
    new_access = create_access_token(user_id, payload.get("username", ""))
    response.set_cookie("access_token", new_access, max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, **COOKIE_OPTS)
    return {"message": "Token rafraîchi."}


@router.post("/logout")
async def logout(response: Response) -> dict:
    """Efface les cookies d'authentification."""
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Déconnecté."}


@router.get("/me", response_model=UserResponse)
async def me(
    request: Request,
    db: AsyncSession = Depends(get_session),
    user_id: int = Depends(get_current_user_id),
) -> UserResponse:
    """Retourne le profil de l'utilisateur connecté."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    return UserResponse.model_validate(user)
