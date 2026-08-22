"""账户标识规范化与密码策略。"""

from __future__ import annotations

import unicodedata

import phonenumbers
from email_validator import EmailNotValidError, validate_email
from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()


class IdentityValidationError(ValueError):
    """不携带原始输入值的账户输入错误。"""

    def __init__(self, field: str, reason: str) -> None:
        super().__init__(reason)
        self.field = field
        self.reason = reason


def normalize_username(value: str) -> str:
    return unicodedata.normalize("NFKC", value).casefold()


def validate_username(value: str) -> str:
    normalized = normalize_username(value)
    if not 3 <= len(normalized) <= 32:
        raise IdentityValidationError("username", "length")
    if "@" in normalized or normalized.isdecimal() or (normalized.startswith("+") and normalized[1:].isdecimal()):
        raise IdentityValidationError("username", "format")
    if any(unicodedata.category(character).startswith("C") for character in normalized):
        raise IdentityValidationError("username", "format")
    return normalized


def normalize_email(value: str) -> str:
    return value.strip().lower()


def validate_account_email(value: str) -> str:
    normalized = normalize_email(value)
    try:
        validate_email(normalized, check_deliverability=False)
    except EmailNotValidError as exc:
        raise IdentityValidationError("email", "format") from exc
    return normalized


def validate_phone_e164(value: str | None) -> str | None:
    if value is None:
        return None
    if not value.startswith("+") or value != value.strip():
        raise IdentityValidationError("phone_e164", "format")
    try:
        parsed = phonenumbers.parse(value, None)
    except phonenumbers.NumberParseException as exc:
        raise IdentityValidationError("phone_e164", "format") from exc
    if not phonenumbers.is_valid_number(parsed):
        raise IdentityValidationError("phone_e164", "format")
    normalized = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    if normalized != value:
        raise IdentityValidationError("phone_e164", "format")
    return normalized


def validate_nickname(value: str) -> str:
    if not 1 <= len(value) <= 100 or any(character == "\x00" for character in value):
        raise IdentityValidationError("nickname", "length")
    return value


def validate_password(value: str) -> str:
    if not 8 <= len(value) <= 128:
        raise IdentityValidationError("password", "length")
    if "\x00" in value:
        raise IdentityValidationError("password", "format")
    return value


def hash_password(value: str) -> str:
    return password_hash.hash(validate_password(value))


def hash_bootstrap_password(value: str = "123456") -> str:
    if value != "123456":
        raise ValueError("invalid bootstrap password")
    return password_hash.hash(value)


def validate_strong_password(value: str, *, username: str, email: str | None = None) -> str:
    validate_password(value)
    categories = sum(
        (
            any(character.isupper() for character in value),
            any(character.islower() for character in value),
            any(character.isdigit() for character in value),
            any(not character.isalnum() for character in value),
        )
    )
    lowered = value.casefold()
    email_local = email.split("@", 1)[0].casefold() if email else ""
    if (
        categories < 3
        or value == "123456"
        or lowered == "password"
        or username.casefold() in lowered
        or (email_local and email_local in lowered)
    ):
        raise IdentityValidationError("password", "strength")
    return value


def hash_strong_password(value: str, *, username: str, email: str | None = None) -> str:
    return password_hash.hash(validate_strong_password(value, username=username, email=email))


def verify_password(value: str, password_digest: str) -> bool:
    return password_hash.verify(value, password_digest)
