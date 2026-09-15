"""
schemas/auth.py — Schémas Pydantic pour l'authentification.

Pydantic valide ET sanitise les inputs avant qu'ils n'atteignent la BDD.
Les contraintes (longueur, pattern) réduisent la surface d'attaque.
"""

import re
from pydantic import BaseModel, field_validator, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        """N'autorise que les caractères alphanumériques + _ et -.
        Élimine les tentatives d'injection via le nom d'utilisateur.
        """
        if not re.match(r"^[a-zA-Z0-9_\-]+$", v):
            raise ValueError("Le nom d'utilisateur ne peut contenir que des lettres, chiffres, _ et -.")
        return v.lower()


class RegisterRequest(LoginRequest):
    """Même validation que LoginRequest, pas de champ supplémentaire pour l'instant."""
    pass


class UserResponse(BaseModel):
    id: int
    username: str
    is_admin: bool

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    user: UserResponse
    message: str = "Authentification réussie."
