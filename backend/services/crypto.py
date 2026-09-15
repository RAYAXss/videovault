"""
services/crypto.py — Couche cryptographique de VideoVault.

Pourquoi AES-256-GCM et non Fernet (app Python originale) ?
  - Fernet = AES-128-CBC + HMAC-SHA256. Solide mais limité : pas d'AEAD natif,
    impossible de vérifier l'intégrité sans déchiffrer.
  - AES-256-GCM = chiffrement authentifié (AEAD) : confidentialité + intégrité +
    authenticité en un seul passage. Détecte toute altération du ciphertext avant
    de livrer le plaintext. Standard recommandé par NIST SP 800-38D.
  - 256 bits de clé (vs 128 pour Fernet) : marge de sécurité doublée.

Architecture de dérivation de clé :
  Le mot de passe utilisateur → PBKDF2-HMAC-SHA256 (600 000 itérations) + sel unique
  → clé maître de 32 bytes.
  Cette clé maître ne chiffre PAS directement les fichiers. Pour chaque fichier :
    - Nouveau sel PBKDF2 spécifique au fichier
    - Nouveau IV AES-GCM de 12 bytes
    → Chaque fichier a sa propre clé dérivée. Compromettre un fichier ne compromet
       pas les autres, même pour le même utilisateur.

Streaming par blocs (CHUNK_SIZE = 4 Mo) :
  AES-GCM standard ne supporte pas le streaming — le tag d'authenticité n'est
  connu qu'à la fin. On découpe le fichier en blocs, chaque bloc est chiffré
  indépendamment avec son propre IV (IV de base + compteur de bloc). C'est le
  pattern "block-level AEAD" utilisé par age et Tink.
  → Les fichiers de 10 Go sont chiffrés/déchiffrés sans jamais tout charger en RAM.

Format des fichiers .enc :
  [4 bytes: magic "VV01"][4 bytes: taille bloc][12 bytes: IV base]
  puis pour chaque bloc : [4 bytes: taille ciphertext][ciphertext + 16 bytes GCM tag]
"""

from __future__ import annotations

import os
import struct
from pathlib import Path
from typing import AsyncGenerator

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

from backend.config import settings


# ── Constantes ────────────────────────────────────────────────────────────────

CHUNK_SIZE = 4 * 1024 * 1024   # 4 Mo par bloc
MAGIC = b"VV01"                 # En-tête pour détecter un fichier VideoVault valide
GCM_TAG_SIZE = 16               # AES-GCM produit toujours un tag de 16 bytes
IV_SIZE = 12                    # NIST recommande 96 bits (12 bytes) pour AES-GCM


# ── Dérivation de clé ─────────────────────────────────────────────────────────

def derive_key(password: str, salt: bytes) -> bytes:
    """Dérive une clé AES-256 de 32 bytes depuis un mot de passe + sel.

    PBKDF2-HMAC-SHA256 avec 600 000 itérations (recommandation OWASP 2023).
    Le sel doit être unique par (utilisateur, fichier) — jamais réutilisé.
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=settings.PBKDF2_ITERATIONS,
    )
    return kdf.derive(password.encode("utf-8"))


def generate_salt() -> bytes:
    """Génère 32 bytes aléatoires cryptographiquement sûrs."""
    return os.urandom(32)


def generate_iv() -> bytes:
    """Génère un IV AES-GCM de 12 bytes."""
    return os.urandom(IV_SIZE)


def derive_block_iv(base_iv: bytes, block_index: int) -> bytes:
    """Dérive un IV unique pour chaque bloc à partir de l'IV de base.

    XOR du compteur de bloc dans les 4 derniers bytes de l'IV.
    → Garantit que deux blocs du même fichier n'ont jamais le même IV,
      sans avoir à stocker un IV par bloc.
    """
    iv = bytearray(base_iv)
    counter_bytes = block_index.to_bytes(4, "big")
    for i in range(4):
        iv[IV_SIZE - 4 + i] ^= counter_bytes[i]
    return bytes(iv)


# ── Chiffrement ───────────────────────────────────────────────────────────────

async def encrypt_file(
    source_path: Path,
    dest_path: Path,
    password: str,
    file_salt: bytes,
    base_iv: bytes,
) -> None:
    """Chiffre source_path vers dest_path en AES-256-GCM par blocs de 4 Mo.

    Args:
        source_path: fichier en clair à chiffrer.
        dest_path: chemin de destination du fichier .enc.
        password: mot de passe de l'utilisateur (non stocké).
        file_salt: sel unique à ce fichier (stocké en BDD, non secret).
        base_iv: IV de base unique à ce fichier (stocké en BDD, non secret).
    """
    key = derive_key(password, file_salt)
    aesgcm = AESGCM(key)

    dest_path.parent.mkdir(parents=True, exist_ok=True)

    with source_path.open("rb") as src, dest_path.open("wb") as dst:
        # En-tête : magic + taille de bloc + IV de base
        dst.write(MAGIC)
        dst.write(struct.pack(">I", CHUNK_SIZE))
        dst.write(base_iv)

        block_index = 0
        while True:
            plaintext = src.read(CHUNK_SIZE)
            if not plaintext:
                break
            block_iv = derive_block_iv(base_iv, block_index)
            # encrypt() retourne ciphertext + GCM tag (16 bytes) concaténés.
            ciphertext = aesgcm.encrypt(block_iv, plaintext, associated_data=None)
            dst.write(struct.pack(">I", len(ciphertext)))
            dst.write(ciphertext)
            block_index += 1


# ── Déchiffrement streaming ───────────────────────────────────────────────────

async def decrypt_file_stream(
    source_path: Path,
    password: str,
    file_salt: bytes,
    stored_iv: bytes,
) -> AsyncGenerator[bytes, None]:
    """Déchiffre source_path et yield le plaintext bloc par bloc.

    Ne crée JAMAIS de fichier temporaire en clair sur le disque.
    Le plaintext ne transite que par la mémoire RAM et est immédiatement
    envoyé au client via StreamingResponse.

    Raises:
        ValueError: si le magic header est invalide (fichier non-VideoVault).
        cryptography.exceptions.InvalidTag: si le ciphertext est altéré
            (attaque ou corruption). FastAPI intercepte → 422.
    """
    key = derive_key(password, file_salt)
    aesgcm = AESGCM(key)

    with source_path.open("rb") as f:
        # Vérification du magic header
        magic = f.read(4)
        if magic != MAGIC:
            raise ValueError("Fichier invalide : magic header incorrect.")

        chunk_size = struct.unpack(">I", f.read(4))[0]
        base_iv = f.read(IV_SIZE)

        # Cohérence : l'IV stocké en BDD doit correspondre à celui du fichier.
        if base_iv != stored_iv:
            raise ValueError("IV incohérent : fichier potentiellement altéré.")

        block_index = 0
        while True:
            length_bytes = f.read(4)
            if not length_bytes:
                break
            (ciphertext_len,) = struct.unpack(">I", length_bytes)
            ciphertext = f.read(ciphertext_len)

            block_iv = derive_block_iv(base_iv, block_index)
            # decrypt() lève InvalidTag si le ciphertext ou l'IV a été modifié.
            plaintext = aesgcm.decrypt(block_iv, ciphertext, associated_data=None)
            yield plaintext
            block_index += 1
