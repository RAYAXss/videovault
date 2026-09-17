from __future__ import annotations

import os
import struct
from pathlib import Path
from typing import AsyncGenerator

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

from backend.config import settings

CHUNK_SIZE = 4 * 1024 * 1024
MAGIC = b"VV01"
GCM_TAG_SIZE = 16
IV_SIZE = 12


def derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=settings.PBKDF2_ITERATIONS,
    )
    return kdf.derive(password.encode("utf-8"))


def generate_salt() -> bytes:
    return os.urandom(32)


def generate_iv() -> bytes:
    return os.urandom(IV_SIZE)


def derive_block_iv(base_iv: bytes, block_index: int) -> bytes:
    iv = bytearray(base_iv)
    counter_bytes = block_index.to_bytes(4, "big")
    for i in range(4):
        iv[IV_SIZE - 4 + i] ^= counter_bytes[i]
    return bytes(iv)


async def encrypt_file(
    source_path: Path,
    dest_path: Path,
    password: str,
    file_salt: bytes,
    base_iv: bytes,
) -> None:
    key = derive_key(password, file_salt)
    aesgcm = AESGCM(key)
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    with source_path.open("rb") as src, dest_path.open("wb") as dst:
        dst.write(MAGIC)
        dst.write(struct.pack(">I", CHUNK_SIZE))
        dst.write(base_iv)
        block_index = 0
        while True:
            plaintext = src.read(CHUNK_SIZE)
            if not plaintext:
                break
            block_iv = derive_block_iv(base_iv, block_index)
            ciphertext = aesgcm.encrypt(block_iv, plaintext, associated_data=None)
            dst.write(struct.pack(">I", len(ciphertext)))
            dst.write(ciphertext)
            block_index += 1


async def decrypt_file_stream(
    source_path: Path,
    password: str,
    file_salt: bytes,
    stored_iv: bytes,
) -> AsyncGenerator[bytes, None]:
    key = derive_key(password, file_salt)
    aesgcm = AESGCM(key)
    with source_path.open("rb") as f:
        magic = f.read(4)
        if magic != MAGIC:
            raise ValueError("Fichier invalide : magic header incorrect.")
        chunk_size = struct.unpack(">I", f.read(4))[0]
        base_iv = f.read(IV_SIZE)
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
            plaintext = aesgcm.decrypt(block_iv, ciphertext, associated_data=None)
            yield plaintext
            block_index += 1
