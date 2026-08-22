"""Access Token、Refresh Token 与认证依赖。"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID, uuid4

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import SessionDep
from app.core.config import Settings, get_settings
from app.core.error_codes import ErrorCode, ErrorMessage
from app.core.exceptions import APIException
from app.models.account import User
from app.models.session import UserSession

bearer_scheme = HTTPBearer(auto_error=False)
_REFRESH_HASH_CONTEXT = b"xnovel:refresh-token:v1"


@dataclass(frozen=True)
class AuthContext:
    user: User
    session: UserSession


def password_change_required_error() -> APIException:
    return APIException(
        status_code=403,
        code=ErrorCode.FORBIDDEN,
        msg=ErrorMessage.FORBIDDEN,
        data={"reason": "must_change_password"},
    )


def create_access_token(
    *,
    user_id: UUID,
    session_id: UUID,
    settings: Settings,
    now: datetime | None = None,
) -> tuple[str, datetime]:
    issued_at = now or datetime.now(UTC)
    expires_at = issued_at + timedelta(minutes=settings.access_token_minutes)
    payload = {
        "sub": str(user_id),
        "sid": str(session_id),
        "jti": str(uuid4()),
        "type": "access",
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": issued_at,
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256"), expires_at


def decode_access_token(token: str, settings: Settings) -> tuple[UUID, UUID]:
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=["HS256"],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            options={"require": ["sub", "sid", "jti", "type", "iat", "exp"]},
        )
        if payload["type"] != "access":
            raise InvalidTokenError
        return UUID(payload["sub"]), UUID(payload["sid"])
    except (InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        raise _unauthorized() from exc


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str, secret_key: str) -> bytes:
    derived_key = hmac.new(secret_key.encode(), _REFRESH_HASH_CONTEXT, hashlib.sha256).digest()
    return hmac.new(derived_key, token.encode(), hashlib.sha256).digest()


def _unauthorized(
    code: ErrorCode = ErrorCode.UNAUTHORIZED,
    msg: ErrorMessage = ErrorMessage.UNAUTHORIZED,
) -> APIException:
    return APIException(
        status_code=401,
        code=code,
        msg=msg,
        headers={"WWW-Authenticate": "Bearer"},
    )


def session_invalid_error() -> APIException:
    return _unauthorized(ErrorCode.SESSION_INVALID, ErrorMessage.SESSION_INVALID)


async def get_auth_context(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: SessionDep,
) -> AuthContext:
    if credentials is None or not credentials.credentials:
        raise _unauthorized()
    user_id, session_id = decode_access_token(credentials.credentials, get_settings())
    try:
        login_session = await session.get(UserSession, session_id)
        user = await session.get(User, user_id)
    except SQLAlchemyError as exc:
        raise APIException(
            status_code=503,
            code=ErrorCode.SERVICE_UNAVAILABLE,
            msg=ErrorMessage.SERVICE_UNAVAILABLE,
        ) from exc
    now = datetime.now(UTC)
    if (
        login_session is None
        or user is None
        or login_session.user_id != user.id
        or login_session.revoked_at is not None
        or _as_utc(login_session.expires_at) <= now
        or user.status != "active"
    ):
        raise session_invalid_error()
    return AuthContext(user=user, session=login_session)


async def admin_required(context: Annotated[AuthContext, Depends(get_auth_context)]) -> AuthContext:
    if context.user.role != "admin":
        raise APIException(status_code=403, code=ErrorCode.FORBIDDEN, msg=ErrorMessage.FORBIDDEN)
    return context


async def password_change_completed(
    context: Annotated[AuthContext, Depends(get_auth_context)],
) -> AuthContext:
    if context.user.must_change_password:
        raise password_change_required_error()
    return context


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


AuthContextDep = Annotated[AuthContext, Depends(get_auth_context)]
PasswordChangeCompletedContextDep = Annotated[AuthContext, Depends(password_change_completed)]
AdminContextDep = Annotated[AuthContext, Depends(admin_required)]
