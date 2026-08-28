"""AI 凭据 AES-256-GCM 加解密。"""

from __future__ import annotations

import base64
import os
from collections.abc import Callable
from uuid import UUID

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import Settings
from app.core.error_codes import ErrorCode, ErrorMessage
from app.core.exceptions import APIException


class CredentialCipher:
    def __init__(
        self,
        key: bytes,
        key_version: str,
        nonce_factory: Callable[[int], bytes] = os.urandom,
    ) -> None:
        if len(key) != 32 or not key_version:
            raise ValueError("AES-256-GCM requires a 32-byte key and version")
        self._aes = AESGCM(key)
        self.key_version = key_version
        self._nonce_factory = nonce_factory

    @classmethod
    def from_settings(cls, settings: Settings) -> CredentialCipher:
        encoded = settings.xnovel_credential_master_key
        if not encoded:
            raise _unavailable()
        try:
            key = base64.b64decode(encoded, validate=True)
            return cls(key, settings.credential_master_key_version)
        except (ValueError, TypeError) as exc:
            raise _unavailable() from exc

    @staticmethod
    def aad(owner_id: UUID, credential_id: UUID, key_version: str) -> bytes:
        return f"xnovel-ai-credential:v1:{owner_id}:{credential_id}:{key_version}".encode()

    def encrypt(self, owner_id: UUID, credential_id: UUID, plaintext: str) -> tuple[bytes, bytes, str]:
        nonce = self._nonce_factory(12)
        if len(nonce) != 12:
            raise ValueError("nonce factory must return 12 bytes")
        ciphertext = self._aes.encrypt(
            nonce,
            plaintext.encode(),
            self.aad(owner_id, credential_id, self.key_version),
        )
        hint = f"••••{plaintext[-4:]}" if len(plaintext) >= 4 else "••••"
        return ciphertext, nonce, hint

    def decrypt(
        self,
        owner_id: UUID,
        credential_id: UUID,
        ciphertext: bytes,
        nonce: bytes,
        key_version: str,
    ) -> str:
        if key_version != self.key_version:
            raise _unavailable()
        try:
            value = self._aes.decrypt(
                nonce,
                ciphertext,
                self.aad(owner_id, credential_id, key_version),
            )
            return value.decode()
        except (InvalidTag, UnicodeDecodeError) as exc:
            raise _unavailable() from exc


def _unavailable() -> APIException:
    return APIException(
        status_code=503,
        code=ErrorCode.SERVICE_UNAVAILABLE,
        msg=ErrorMessage.SERVICE_UNAVAILABLE,
        data={"reason": "credential_service_unavailable"},
    )
