"""
routers/auth.py — Endpoints d'authentification.

Nouveaux endpoints :
  POST /auth/change-password  — changer le mot de passe (authentifié)
  PATCH /auth/email           — enregistrer/modifier l'email de récupération
  POST /auth/forgot-password  — demander un lien de reset par email
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
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

_DUMMY_HASH = hash_password("dummy_constant_password_for_timing_safety")

COOKIE_OPTS = dict(
    httponly=True,
    samesite="lax",
    secure=not settings.DEBUG,
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
    existing = await db.scalar(select(User).where(User.username == body.username))
    if existing:
        raise HTTPException(status_code=409, detail="Ce nom d'utilisateur est déjà pris.")

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
    user = await db.scalar(select(User).where(User.username == body.username))

    if user is None:
        verify_password(body.password, _DUMMY_HASH)
        raise HTTPException(status_code=401, detail="Identifiants incorrects.")

    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=429,
            detail=f"Compte temporairement verrouillé. Réessayez après {user.locked_until.strftime('%H:%M')}.",
        )

    if not verify_password(body.password, user.hashed_password):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= 10:
            user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
            user.failed_login_attempts = 0
        await db.commit()
        raise HTTPException(status_code=401, detail="Identifiants incorrects.")

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    _set_auth_cookies(response, user.id, user.username)
    return TokenResponse(user=UserResponse.model_validate(user))


@router.post("/refresh")
async def refresh_token(request: Request, response: Response) -> dict:
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
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Déconnecté."}


@router.get("/me", response_model=UserResponse)
async def me(
    request: Request,
    db: AsyncSession = Depends(get_session),
    user_id: int = Depends(get_current_user_id),
) -> UserResponse:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
    return UserResponse.model_validate(user)


# ── New endpoints ──────────────────────────────────────────────────────────────

class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UpdateEmailRequest(BaseModel):
    email: EmailStr | None = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
    user_id: int = Depends(get_current_user_id),
) -> dict:
    """Change le mot de passe de l'utilisateur connecté."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")

    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Mot de passe actuel incorrect.")

    user.hashed_password = hash_password(body.new_password)
    await db.commit()
    return {"message": "Mot de passe mis à jour."}


@router.patch("/email")
async def update_email(
    body: UpdateEmailRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
    user_id: int = Depends(get_current_user_id),
) -> dict:
    """Enregistre ou modifie l'adresse email de récupération."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")

    # Store email on user (field added below)
    user.email = body.email  # type: ignore[attr-defined]
    await db.commit()
    return {"message": "Email enregistré."}


@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_session),
) -> dict:
    """
    Envoie un email de réinitialisation si l'adresse correspond à un compte.

    Toujours renvoyer la même réponse — pas d'énumération d'emails.
    En production : intégrer un service email (SendGrid, SES, etc.).
    """
    user = await db.scalar(select(User).where(User.email == body.email))  # type: ignore[attr-defined]

    if user:
        # TODO: générer un token de reset, l'envoyer par email
        # Pour l'instant : log en dev uniquement
        if settings.DEBUG:
            print(f"[DEV] Reset requested for user {user.username} ({body.email})")
        # En prod : await send_reset_email(user, token)

    # Toujours même réponse
    return {"message": "Si un compte correspond à cet email, un lien de réinitialisation a été envoyé."}
