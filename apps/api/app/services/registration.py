"""公开注册领域服务。"""

from __future__ import annotations

import logging

from fastapi.concurrency import run_in_threadpool
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.error_codes import ErrorCode, ErrorMessage
from app.core.exceptions import APIException
from app.models.account import User, UserPreference
from app.models.site import SiteSetting
from app.schemas.auth import RegisteredUserData, RegisterRequest
from app.services.identity import (
    IdentityValidationError,
    hash_password,
    normalize_email,
    normalize_username,
    validate_account_email,
    validate_nickname,
    validate_phone_e164,
    validate_username,
)
from app.services.rate_limit import increment_registration_limits

logger = logging.getLogger(__name__)


def _registration_disabled() -> APIException:
    return APIException(
        status_code=403,
        code=ErrorCode.REGISTRATION_DISABLED,
        msg=ErrorMessage.REGISTRATION_DISABLED,
    )


def _validation_error(exc: IdentityValidationError) -> APIException:
    return APIException(
        status_code=422,
        code=ErrorCode.VALIDATION_ERROR,
        msg=ErrorMessage.VALIDATION_ERROR,
        data={"details": [{"loc": ["body", exc.field], "msg": exc.reason, "type": "value_error"}]},
    )


async def get_registration_enabled(session: AsyncSession) -> bool:
    try:
        setting = await session.get(SiteSetting, 1)
    except SQLAlchemyError as exc:
        raise APIException(
            status_code=503,
            code=ErrorCode.SERVICE_UNAVAILABLE,
            msg=ErrorMessage.SERVICE_UNAVAILABLE,
        ) from exc
    if setting is None:
        logger.error("site_settings singleton is missing; registration remains disabled")
        return False
    return setting.registration_enabled


async def register_user(
    session: AsyncSession,
    *,
    payload: RegisterRequest,
    client_ip: str,
    secret_key: str,
) -> RegisteredUserData:
    if not await get_registration_enabled(session):
        raise _registration_disabled()

    username_for_key = normalize_username(payload.username)
    email_for_key = normalize_email(payload.email)
    try:
        limit = await increment_registration_limits(
            session,
            secret_key=secret_key,
            client_ip=client_ip,
            username=username_for_key,
            email=email_for_key,
        )
    except (SQLAlchemyError, RuntimeError, ValueError) as exc:
        await session.rollback()
        raise APIException(
            status_code=503,
            code=ErrorCode.SERVICE_UNAVAILABLE,
            msg=ErrorMessage.SERVICE_UNAVAILABLE,
        ) from exc
    if not limit.allowed:
        retry_after = str(limit.retry_after_seconds)
        raise APIException(
            status_code=429,
            code=ErrorCode.REGISTRATION_RATE_LIMITED,
            msg=ErrorMessage.REGISTRATION_RATE_LIMITED,
            data={"retry_after_seconds": limit.retry_after_seconds},
            headers={"Retry-After": retry_after},
        )

    try:
        username = validate_username(payload.username)
        email = validate_account_email(payload.email)
        phone = validate_phone_e164(payload.phone_e164)
        nickname = validate_nickname(payload.nickname)
        password_digest = await run_in_threadpool(hash_password, payload.password)
    except IdentityValidationError as exc:
        raise _validation_error(exc) from exc

    try:
        async with session.begin():
            statement = (
                select(SiteSetting)
                .where(col(SiteSetting.id) == 1)
                .with_for_update(read=True)
                .execution_options(populate_existing=True)
            )
            setting_result = await session.exec(statement)
            setting = setting_result.one_or_none()
            if setting is None or not setting.registration_enabled:
                raise _registration_disabled()

            user = User(
                username=username,
                email=email,
                phone_e164=phone,
                password_hash=password_digest,
                nickname=nickname,
                role="user",
                status="active",
            )
            session.add(user)
            await session.flush()
            session.add(UserPreference(user_id=user.id))
    except APIException:
        raise
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

    if user.created_at is None or user.updated_at is None:
        raise APIException(
            status_code=500,
            code=ErrorCode.INTERNAL_ERROR,
            msg=ErrorMessage.INTERNAL_ERROR,
        )
    return RegisteredUserData(
        id=user.id,
        username=user.username,
        email=user.email,
        phone_e164=user.phone_e164,
        nickname=user.nickname,
        role="user",
        status="active",
        created_at=user.created_at,
        updated_at=user.updated_at,
    )
