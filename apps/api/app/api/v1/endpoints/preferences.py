"""当前用户语言与主题偏好端点。"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.api.deps import SessionDep
from app.core.security import PasswordChangeCompletedContextDep
from app.schemas.common import (
    BEARER_AUTH_RESPONSE_HEADERS,
    AuthenticationErrorResponse,
    ServiceUnavailableErrorResponse,
    ValidationErrorResponse,
)
from app.schemas.preferences import (
    UpdateUserPreferenceRequest,
    UserPreferenceResponse,
)
from app.services.preferences import get_user_preference, update_user_preference

router = APIRouter(prefix="/users/me/preferences")

_AUTH_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": AuthenticationErrorResponse, "headers": BEARER_AUTH_RESPONSE_HEADERS},
    503: {"model": ServiceUnavailableErrorResponse},
}


@router.get(
    "",
    operation_id="getCurrentUserPreferences",
    responses=_AUTH_RESPONSES,
)
async def get_preferences(context: PasswordChangeCompletedContextDep, session: SessionDep) -> UserPreferenceResponse:
    data = await get_user_preference(session, user_id=context.user.id)
    return UserPreferenceResponse(code=0, msg="SUCCESS", data=data)


@router.patch(
    "",
    operation_id="updateCurrentUserPreferences",
    responses={
        **_AUTH_RESPONSES,
        422: {"model": ValidationErrorResponse},
    },
)
async def patch_preferences(
    payload: UpdateUserPreferenceRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> UserPreferenceResponse:
    data = await update_user_preference(session, user_id=context.user.id, payload=payload)
    return UserPreferenceResponse(code=0, msg="SUCCESS", data=data)
