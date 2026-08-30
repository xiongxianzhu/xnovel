"""当前用户资料与密码修改领域服务。"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import Settings
from app.core.error_codes import ErrorCode, ErrorMessage
from app.core.exceptions import APIException
from app.core.security import (
    AuthContext,
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    session_invalid_error,
)
from app.models.account import User
from app.models.session import UserSession, UserSessionToken
from app.schemas.profile import (
    ChangePasswordRequest,
    PasswordChangedData,
    UpdateProfileRequest,
    UserProfileData,
)
from app.services.identity import (
    IdentityValidationError,
    hash_strong_password,
    validate_account_email,
    validate_nickname,
    validate_phone_e164,
    validate_username,
    verify_password,
)


def profile_data(user: User) -> UserProfileData:
    if user.created_at is None or user.updated_at is None:
        raise APIException(status_code=500, code=ErrorCode.INTERNAL_ERROR, msg=ErrorMessage.INTERNAL_ERROR)
    return UserProfileData(
        id=user.id,
        username=user.username,
        email=user.email,
        email_verified_at=user.email_verified_at,
        phone_e164=user.phone_e164,
        phone_verified_at=user.phone_verified_at,
        nickname=user.nickname,
        role=user.role,
        avatar_source=user.avatar_source,
        avatar_url=(
            f"/api/v1/media/{user.avatar_storage_key}"
            if user.avatar_source == "upload" and user.avatar_storage_key
            else user.avatar_url
        ),
        address=user.address,
        birthday=user.birthday,
        status="active",
        must_change_password=user.must_change_password,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


async def update_profile(
    session: AsyncSession,
    *,
    context: AuthContext,
    payload: UpdateProfileRequest,
) -> UserProfileData:
    fields = payload.model_fields_set - {"current_password"}
    sensitive_fields = fields & {"username", "email", "phone_e164"}
    if sensitive_fields:
        if payload.current_password is None or not await run_in_threadpool(
            verify_password,
            payload.current_password,
            context.user.password_hash,
        ):
            raise APIException(
                status_code=422,
                code=ErrorCode.CURRENT_PASSWORD_INVALID,
                msg=ErrorMessage.CURRENT_PASSWORD_INVALID,
            )

    try:
        if "username" in fields and payload.username is not None:
            context.user.username = validate_username(payload.username)
        if "email" in fields:
            context.user.email = (
                validate_account_email(payload.email) if payload.email else None
            )
            context.user.email_verified_at = None
        if "phone_e164" in fields:
            context.user.phone_e164 = validate_phone_e164(payload.phone_e164)
            context.user.phone_verified_at = None
        if "nickname" in fields and payload.nickname is not None:
            context.user.nickname = validate_nickname(payload.nickname)
        if "address" in fields:
            context.user.address = _optional_text(payload.address, 500)
        if "birthday" in fields:
            context.user.birthday = payload.birthday
    except IdentityValidationError as exc:
        raise APIException(
            status_code=422,
            code=ErrorCode.VALIDATION_ERROR,
            msg=ErrorMessage.VALIDATION_ERROR,
            data={"details": [{"loc": ["body", exc.field], "msg": exc.reason, "type": "value_error"}]},
        ) from exc

    try:
        session.add(context.user)
        await session.commit()
        await session.refresh(context.user)
    except IntegrityError as exc:
        await session.rollback()
        raise APIException(
            status_code=409,
            code=ErrorCode.ACCOUNT_IDENTIFIER_UNAVAILABLE,
            msg=ErrorMessage.ACCOUNT_IDENTIFIER_UNAVAILABLE,
        ) from exc
    except SQLAlchemyError as exc:
        await session.rollback()
        raise APIException(
            status_code=503,
            code=ErrorCode.SERVICE_UNAVAILABLE,
            msg=ErrorMessage.SERVICE_UNAVAILABLE,
        ) from exc
    return profile_data(context.user)


async def change_password(
    session: AsyncSession,
    *,
    context: AuthContext,
    payload: ChangePasswordRequest,
    raw_refresh_token: str,
    settings: Settings,
) -> tuple[PasswordChangedData, str]:
    if not await run_in_threadpool(verify_password, payload.current_password, context.user.password_hash):
        raise APIException(
            status_code=422,
            code=ErrorCode.CURRENT_PASSWORD_INVALID,
            msg=ErrorMessage.CURRENT_PASSWORD_INVALID,
        )
    try:
        new_password_hash = await run_in_threadpool(
            hash_strong_password,
            payload.new_password,
            username=context.user.username,
            email=context.user.email,
        )
    except IdentityValidationError as exc:
        raise APIException(
            status_code=422,
            code=ErrorCode.VALIDATION_ERROR,
            msg=ErrorMessage.VALIDATION_ERROR,
            data={"details": [{"loc": ["body", "new_password"], "msg": exc.reason, "type": "value_error"}]},
        ) from exc

    current_token_hash = hash_refresh_token(raw_refresh_token, settings.secret_key)
    try:
        current_token = (
            await session.exec(
                select(UserSessionToken).where(
                    col(UserSessionToken.session_id) == context.session.id,
                    col(UserSessionToken.token_hash) == current_token_hash,
                    col(UserSessionToken.used_at).is_(None),
                    col(UserSessionToken.revoked_at).is_(None),
                )
            )
        ).one_or_none()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise APIException(
            status_code=503,
            code=ErrorCode.SERVICE_UNAVAILABLE,
            msg=ErrorMessage.SERVICE_UNAVAILABLE,
        ) from exc
    if current_token is None:
        raise session_invalid_error()

    now = datetime.now(UTC)
    new_raw_token = generate_refresh_token()
    new_token = UserSessionToken(
        session_id=context.session.id,
        token_hash=hash_refresh_token(new_raw_token, settings.secret_key),
        expires_at=context.session.expires_at,
    )
    try:
        context.user.password_hash = new_password_hash
        context.user.must_change_password = False
        session.add(context.user)
        await session.exec(
            update(UserSession)
            .where(
                col(UserSession.user_id) == context.user.id,
                col(UserSession.id) != context.session.id,
                col(UserSession.revoked_at).is_(None),
            )
            .values(revoked_at=now, revoke_reason="password_changed", updated_at=now)
        )
        session.add(new_token)
        await session.flush()
        current_token.used_at = now
        current_token.replaced_by_id = new_token.id
        context.session.last_used_at = now
        session.add(current_token)
        session.add(context.session)
        await session.commit()
        await session.refresh(context.user)
    except SQLAlchemyError as exc:
        await session.rollback()
        raise APIException(
            status_code=503,
            code=ErrorCode.SERVICE_UNAVAILABLE,
            msg=ErrorMessage.SERVICE_UNAVAILABLE,
        ) from exc

    access_token, expires_at = create_access_token(
        user_id=context.user.id,
        session_id=context.session.id,
        settings=settings,
        now=now,
    )
    return (
        PasswordChangedData(
            access_token=access_token,
            expires_at=expires_at,
            user=profile_data(context.user),
        ),
        new_raw_token,
    )


def _optional_text(value: str | None, max_length: int) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > max_length or "\x00" in normalized:
        raise IdentityValidationError("address", "length")
    return normalized
