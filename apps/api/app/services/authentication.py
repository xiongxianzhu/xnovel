"""登录、刷新与退出登录领域服务。"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.concurrency import run_in_threadpool
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import Settings
from app.core.error_codes import ErrorCode, ErrorMessage
from app.core.exceptions import APIException
from app.core.security import create_access_token, generate_refresh_token, hash_refresh_token
from app.models.account import User
from app.models.session import UserSession, UserSessionToken
from app.schemas.auth import AuthenticatedUserData, AuthTokenData, LoginRequest, RefreshTokenData
from app.services.identity import (
    IdentityValidationError,
    normalize_email,
    normalize_username,
    validate_account_email,
    validate_phone_e164,
    validate_username,
    verify_password,
)
from app.services.rate_limit import increment_login_limits, normalize_client_ip


def _auth_error(code: ErrorCode, msg: ErrorMessage, status_code: int = 401) -> APIException:
    return APIException(
        status_code=status_code,
        code=code,
        msg=msg,
        headers={"WWW-Authenticate": "Bearer"} if status_code == 401 else None,
    )


def normalize_login_identifier(value: str) -> tuple[str, str]:
    try:
        if "@" in value:
            return "email", validate_account_email(value)
        if value.startswith("+"):
            phone = validate_phone_e164(value)
            if phone is None:
                raise IdentityValidationError("identifier", "format")
            return "phone_e164", phone
        return "username", validate_username(value)
    except IdentityValidationError:
        if "@" in value:
            return "email", normalize_email(value)
        return "username", normalize_username(value)


async def login_user(
    session: AsyncSession,
    *,
    payload: LoginRequest,
    client_ip: str,
    user_agent: str,
    settings: Settings,
) -> tuple[AuthTokenData, str]:
    field, identifier = normalize_login_identifier(payload.identifier)
    try:
        limit = await increment_login_limits(
            session,
            secret_key=settings.secret_key,
            client_ip=client_ip,
            identifier=identifier,
        )
    except (SQLAlchemyError, RuntimeError, ValueError) as exc:
        await session.rollback()
        raise _auth_error(ErrorCode.SERVICE_UNAVAILABLE, ErrorMessage.SERVICE_UNAVAILABLE, 503) from exc
    if not limit.allowed:
        raise APIException(
            status_code=429,
            code=ErrorCode.LOGIN_RATE_LIMITED,
            msg=ErrorMessage.LOGIN_RATE_LIMITED,
            data={"retry_after_seconds": limit.retry_after_seconds},
            headers={"Retry-After": str(limit.retry_after_seconds)},
        )

    try:
        statement = select(User).where(col(getattr(User, field)) == identifier)
        user = (await session.exec(statement)).one_or_none()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _auth_error(ErrorCode.SERVICE_UNAVAILABLE, ErrorMessage.SERVICE_UNAVAILABLE, 503) from exc
    valid_password = (
        user is not None
        and user.status == "active"
        and await run_in_threadpool(verify_password, payload.password, user.password_hash)
    )
    if not valid_password or user is None:
        raise _auth_error(ErrorCode.INVALID_CREDENTIALS, ErrorMessage.INVALID_CREDENTIALS)

    now = datetime.now(UTC)
    refresh_expires_at = now + timedelta(days=settings.refresh_token_days)
    refresh_token = generate_refresh_token()
    login_session = UserSession(
        user_id=user.id,
        expires_at=refresh_expires_at,
        last_used_at=now,
        created_ip=normalize_client_ip(client_ip),
        last_ip=normalize_client_ip(client_ip),
        user_agent=user_agent[:512],
    )
    try:
        session.add(login_session)
        await session.flush()
        session.add(
            UserSessionToken(
                session_id=login_session.id,
                token_hash=hash_refresh_token(refresh_token, settings.secret_key),
                expires_at=refresh_expires_at,
            )
        )
        user.last_login_at = now
        session.add(user)
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _auth_error(ErrorCode.SERVICE_UNAVAILABLE, ErrorMessage.SERVICE_UNAVAILABLE, 503) from exc
    access_token, access_expires_at = create_access_token(
        user_id=user.id,
        session_id=login_session.id,
        settings=settings,
        now=now,
    )
    return (
        AuthTokenData(
            access_token=access_token,
            expires_at=access_expires_at,
            user=AuthenticatedUserData(
                id=user.id,
                username=user.username,
                email=user.email,
                phone_e164=user.phone_e164,
                nickname=user.nickname,
                avatar_url=(
                    f"/api/v1/media/{user.avatar_storage_key}"
                    if user.avatar_source == "upload" and user.avatar_storage_key
                    else user.avatar_url
                ),
                role=user.role,
                status="active",
                must_change_password=user.must_change_password,
            ),
        ),
        refresh_token,
    )


async def refresh_session(
    session: AsyncSession,
    *,
    raw_token: str,
    client_ip: str,
    settings: Settings,
) -> tuple[RefreshTokenData, str]:
    now = datetime.now(UTC)
    token_hash = hash_refresh_token(raw_token, settings.secret_key)
    try:
        statement = select(UserSessionToken).where(col(UserSessionToken.token_hash) == token_hash).with_for_update()
        token_record = (await session.exec(statement)).one_or_none()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _auth_error(ErrorCode.SERVICE_UNAVAILABLE, ErrorMessage.SERVICE_UNAVAILABLE, 503) from exc
    if token_record is None:
        raise _auth_error(ErrorCode.SESSION_INVALID, ErrorMessage.SESSION_INVALID)

    try:
        login_session = await session.get(UserSession, token_record.session_id, with_for_update=True)
        user = await session.get(User, login_session.user_id) if login_session is not None else None
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _auth_error(ErrorCode.SERVICE_UNAVAILABLE, ErrorMessage.SERVICE_UNAVAILABLE, 503) from exc
    if (
        login_session is None
        or user is None
        or user.status != "active"
        or login_session.revoked_at is not None
        or _as_utc(token_record.expires_at) <= now
        or _as_utc(login_session.expires_at) <= now
    ):
        raise _auth_error(ErrorCode.SESSION_INVALID, ErrorMessage.SESSION_INVALID)

    if token_record.used_at is not None or token_record.revoked_at is not None:
        login_session.revoked_at = now
        login_session.revoke_reason = "refresh_token_reuse"
        try:
            session.add(login_session)
            await session.commit()
        except SQLAlchemyError as exc:
            await session.rollback()
            raise _auth_error(ErrorCode.SERVICE_UNAVAILABLE, ErrorMessage.SERVICE_UNAVAILABLE, 503) from exc
        raise _auth_error(ErrorCode.SESSION_INVALID, ErrorMessage.SESSION_INVALID)

    new_raw_token = generate_refresh_token()
    new_token = UserSessionToken(
        session_id=login_session.id,
        token_hash=hash_refresh_token(new_raw_token, settings.secret_key),
        expires_at=login_session.expires_at,
    )
    try:
        session.add(new_token)
        await session.flush()
        token_record.used_at = now
        token_record.replaced_by_id = new_token.id
        login_session.last_used_at = now
        login_session.last_ip = normalize_client_ip(client_ip)
        session.add(token_record)
        session.add(login_session)
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _auth_error(ErrorCode.SERVICE_UNAVAILABLE, ErrorMessage.SERVICE_UNAVAILABLE, 503) from exc
    access_token, access_expires_at = create_access_token(
        user_id=user.id,
        session_id=login_session.id,
        settings=settings,
        now=now,
    )
    return RefreshTokenData(access_token=access_token, expires_at=access_expires_at), new_raw_token


async def logout_session(session: AsyncSession, *, raw_token: str | None, settings: Settings) -> None:
    if not raw_token:
        return
    token_hash = hash_refresh_token(raw_token, settings.secret_key)
    try:
        token_record = (
            await session.exec(select(UserSessionToken).where(col(UserSessionToken.token_hash) == token_hash))
        ).one_or_none()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _auth_error(ErrorCode.SERVICE_UNAVAILABLE, ErrorMessage.SERVICE_UNAVAILABLE, 503) from exc
    if token_record is None:
        return
    try:
        login_session = await session.get(UserSession, token_record.session_id)
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _auth_error(ErrorCode.SERVICE_UNAVAILABLE, ErrorMessage.SERVICE_UNAVAILABLE, 503) from exc
    if login_session is None or login_session.revoked_at is not None:
        return
    now = datetime.now(UTC)
    login_session.revoked_at = now
    login_session.revoke_reason = "logout"
    token_record.revoked_at = now
    try:
        session.add(login_session)
        session.add(token_record)
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _auth_error(ErrorCode.SERVICE_UNAVAILABLE, ErrorMessage.SERVICE_UNAVAILABLE, 503) from exc


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
