"""AI 凭据与 Provider 地址安全测试。"""

from __future__ import annotations

import base64
from uuid import uuid7

import pytest

from app.core.config import Settings
from app.core.exceptions import APIException
from app.services.ai_credentials import CredentialCipher
from app.services.provider_security import normalize_provider_url, validate_provider_target


def test_credential_cipher_binds_owner_id_credential_id_and_key_version() -> None:
    owner_id = uuid7()
    credential_id = uuid7()
    cipher = CredentialCipher(b"k" * 32, "v1", nonce_factory=lambda _: b"n" * 12)
    ciphertext, nonce, hint = cipher.encrypt(owner_id, credential_id, "secret-api-key")

    assert nonce == b"n" * 12
    assert hint == "••••-key"
    assert cipher.decrypt(owner_id, credential_id, ciphertext, nonce, "v1") == "secret-api-key"
    with pytest.raises(APIException):
        cipher.decrypt(uuid7(), credential_id, ciphertext, nonce, "v1")
    with pytest.raises(APIException):
        cipher.decrypt(owner_id, credential_id, ciphertext, nonce, "v2")


def test_credential_cipher_requires_valid_base64_32_byte_settings_key() -> None:
    settings = Settings(
        secret_key="testing-secret-key-at-least-32-bytes-long",
        xnovel_credential_master_key=base64.b64encode(b"x" * 32).decode(),
    )
    assert CredentialCipher.from_settings(settings).key_version == "v1"
    with pytest.raises(APIException):
        CredentialCipher.from_settings(
            Settings(secret_key="testing-secret-key-at-least-32-bytes-long", xnovel_credential_master_key="bad")
        )


def test_provider_url_normalization_rejects_ambiguous_urls() -> None:
    assert normalize_provider_url("https://API.Example.com:443/v1/") == "https://api.example.com/v1"
    for value in (
        "ftp://example.com",
        "https://user@example.com",
        "https://example.com/path?token=secret",
        "https://example.com/#fragment",
    ):
        with pytest.raises(APIException):
            normalize_provider_url(value)


@pytest.mark.anyio
async def test_provider_target_rejects_private_addresses_unless_origin_is_allowed() -> None:
    with pytest.raises(APIException):
        await validate_provider_target("http://127.0.0.1:11434/v1", [])
    assert (
        await validate_provider_target(
            "http://127.0.0.1:11434/v1",
            ["http://127.0.0.1:11434"],
        )
        == "http://127.0.0.1:11434/v1"
    )
