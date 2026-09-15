"""
services/auth.py — Authentification : hachage de mots de passe et JWT.

Choix techniques :
  bcrypt pour les mots de passe (et non PBKDF2) :
    - bcrypt a un facteur de coût adaptatif : on peut l'augmenter sans recalculer
      tous les hashes existants (via work_factor).
    - Inclut son propre sel aléatoire — impossible de faire une rainbow table.
    - PBKDF2 est réservé à la DÉRIVATION DE CLÉ de chiffrement (voir crypto.py)
      car il donne un output de longueur arbitraire (32 bytes pour AES-256).

  JWT httpOnly cookies (et non Authorization header) :
    - Un header "Authorization: Bearer token" est accessible depuis JavaScript
      → vulnérable au XSS (un script malicieux peut le lire).
    - Un cookie httpOnly est transmis automatiquement par le navigateur mais
      n'est pas accessible depuis JS → XSS ne peut pas voler le token.
    - SameSite=Lax protège contre le CSRF (un site tiers ne peut pas déclencher
      une requête authentifiée vers l'API).
    - Secure=True (prod) : cookie uniquement sur HTTPS.

  Refresh token pattern :
    - Access token court (15 min) : si volé, expire vite.
    - Refresh token long (7 jours) stocké en cookie httpOnly séparé.
    - Le client rafraîchit silencieusement via /api/auth/refresh.
"""

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt
from fastapi import HTTPException, Request, status

from backend.config import settings


# ── Hachage de mots de passe ──────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hache le mot de passe avec bcrypt (work_factor=12)."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Vérifie un mot de passe contre son hash bcrypt.

    Utilise hmac.compare_digest en interne → temps constant, pas de timing attack.
    """
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(user_id: int, username: str) -> str:
    """Crée un JWT d'accès signé HS256, valide ACCESS_TOKEN_EXPIRE_MINUTES."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "username": username,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(user_id: int) -> str:
    """Crée un JWT de rafraîchissement, valide REFRESH_TOKEN_EXPIRE_DAYS."""
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str, expected_type: str = "access") -> dict[str, Any]:
    """Décode et valide un JWT. Lève HTTPException 401 si invalide ou expiré."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Session invalide ou expirée.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != expected_type:
            raise credentials_exception
        return payload
    except JWTError:
        raise credentials_exception


def get_current_user_id(request: Request) -> int:
    """Extrait l'ID utilisateur depuis le cookie access_token.

    Dépendance FastAPI à injecter dans les routes protégées :
        user_id: int = Depends(get_current_user_id)
    """
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Non authentifié.",
        )
    payload = decode_token(token, expected_type="access")
    return int(payload["sub"])
