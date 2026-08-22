"""当前用户偏好领域服务。"""

from __future__ import annotations

from sqlalchemy.exc import SQLAlchemyError
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.error_codes import ErrorCode, ErrorMessage
from app.core.exceptions import APIException
from app.models.account import UserPreference
from app.schemas.preferences import UpdateUserPreferenceRequest, UserPreferenceData


def preference_data(preference: UserPreference) -> UserPreferenceData:
    if preference.created_at is None or preference.updated_at is None:
        raise APIException(status_code=500, code=ErrorCode.INTERNAL_ERROR, msg=ErrorMessage.INTERNAL_ERROR)
    return UserPreferenceData(
        locale=preference.locale,
        theme_palette=preference.theme_palette,
        theme_mode=preference.theme_mode,
        created_at=preference.created_at,
        updated_at=preference.updated_at,
    )


async def get_user_preference(session: AsyncSession, *, user_id) -> UserPreferenceData:
    try:
        preference = await session.get(UserPreference, user_id)
    except SQLAlchemyError as exc:
        raise _service_unavailable() from exc
    if preference is None:
        raise APIException(status_code=500, code=ErrorCode.INTERNAL_ERROR, msg=ErrorMessage.INTERNAL_ERROR)
    return preference_data(preference)


async def update_user_preference(
    session: AsyncSession,
    *,
    user_id,
    payload: UpdateUserPreferenceRequest,
) -> UserPreferenceData:
    try:
        preference = await session.get(UserPreference, user_id)
        if preference is None:
            raise APIException(status_code=500, code=ErrorCode.INTERNAL_ERROR, msg=ErrorMessage.INTERNAL_ERROR)
        changes = payload.root
        for field in changes.model_fields_set:
            setattr(preference, field, getattr(changes, field))
        session.add(preference)
        await session.commit()
        await session.refresh(preference)
    except APIException:
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    return preference_data(preference)


def _service_unavailable() -> APIException:
    return APIException(
        status_code=503,
        code=ErrorCode.SERVICE_UNAVAILABLE,
        msg=ErrorMessage.SERVICE_UNAVAILABLE,
    )
