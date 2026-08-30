"""账户输入规范化与密码策略测试。"""

from __future__ import annotations

import pytest

from app.services.identity import (
    IdentityValidationError,
    hash_password,
    normalize_email,
    normalize_username,
    validate_account_email,
    validate_password,
    validate_phone_e164,
    validate_strong_password,
    validate_username,
    verify_password,
)


def test_username_uses_nfkc_and_casefold() -> None:
    assert normalize_username("ＸＸAdmin") == "xxadmin"
    assert validate_username("Straße") == "strasse"


@pytest.mark.parametrize("value", ["12", "12345", "+8613800138000", "name@example.com", "a\x00b"])
def test_username_rejects_ambiguous_or_invalid_values(value: str) -> None:
    with pytest.raises(IdentityValidationError):
        validate_username(value)


def test_email_is_trimmed_lowered_and_validated() -> None:
    assert normalize_email(" User@Example.COM ") == "user@example.com"
    assert validate_account_email(" User@Example.COM ") == "user@example.com"


def test_phone_requires_canonical_e164() -> None:
    assert validate_phone_e164("+8613800138000") == "+8613800138000"
    assert validate_phone_e164(None) is None
    with pytest.raises(IdentityValidationError):
        validate_phone_e164("13800138000")


def test_password_preserves_unicode_and_spaces() -> None:
    password = "  长篇小说密码测试  "
    assert validate_password(password) == password
    digest = hash_password(password)
    assert digest.startswith("$argon2id$")
    assert verify_password(password, digest)


@pytest.mark.parametrize("value", ["short", "valid-password\x00", "x" * 33])
def test_password_rejects_invalid_values(value: str) -> None:
    with pytest.raises(IdentityValidationError):
        validate_password(value)


def test_strong_password_requires_two_of_four_character_types() -> None:
    assert (
        validate_strong_password("Abcdefgh", username="writer")
        == "Abcdefgh"
    )
    with pytest.raises(IdentityValidationError):
        validate_strong_password("abcdefgh", username="writer")
