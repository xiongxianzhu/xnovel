"""当前用户资料与密码端点。"""

from __future__ import annotations

from fastapi import APIRouter, Request, Response

from app.api.deps import SessionDep
from app.api.v1.endpoints.auth import _set_refresh_cookie
from app.core.config import get_settings
from app.core.security import AuthContextDep, PasswordChangeCompletedContextDep, session_invalid_error
from app.schemas.common import (
    BEARER_AUTH_RESPONSE_HEADERS,
    AccountIdentifierUnavailableErrorResponse,
    AuthenticationErrorResponse,
    ProfileValidationErrorResponse,
    ServiceUnavailableErrorResponse,
)
from app.schemas.profile import (
    ChangePasswordRequest,
    ChangePasswordResponse,
    UpdateProfileRequest,
    UserProfileResponse,
)
from app.services.profile import change_password, profile_data, update_profile

router = APIRouter(prefix="/users/me")


@router.get(
    "",
    operation_id="getCurrentUserProfile",
    responses={
        401: {"model": AuthenticationErrorResponse, "headers": BEARER_AUTH_RESPONSE_HEADERS},
        503: {"model": ServiceUnavailableErrorResponse},
    },
)
async def get_profile(context: AuthContextDep) -> UserProfileResponse:
    return UserProfileResponse(code=0, msg="SUCCESS", data=profile_data(context.user))


@router.patch(
    "",
    operation_id="updateCurrentUserProfile",
    responses={
        401: {"model": AuthenticationErrorResponse, "headers": BEARER_AUTH_RESPONSE_HEADERS},
        409: {"model": AccountIdentifierUnavailableErrorResponse},
        422: {"model": ProfileValidationErrorResponse},
        503: {"model": ServiceUnavailableErrorResponse},
    },
)
async def patch_profile(
    payload: UpdateProfileRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> UserProfileResponse:
    data = await update_profile(session, context=context, payload=payload)
    return UserProfileResponse(code=0, msg="SUCCESS", data=data)


@router.put(
    "/password",
    operation_id="changeCurrentUserPassword",
    responses={
        401: {"model": AuthenticationErrorResponse, "headers": BEARER_AUTH_RESPONSE_HEADERS},
        422: {"model": ProfileValidationErrorResponse},
        503: {"model": ServiceUnavailableErrorResponse},
    },
)
async def put_password(
    payload: ChangePasswordRequest,
    request: Request,
    response: Response,
    context: AuthContextDep,
    session: SessionDep,
) -> ChangePasswordResponse:
    settings = get_settings()
    raw_refresh_token = request.cookies.get(settings.refresh_cookie_name)
    if not raw_refresh_token:
        raise session_invalid_error()
    data, new_refresh_token = await change_password(
        session,
        context=context,
        payload=payload,
        raw_refresh_token=raw_refresh_token,
        settings=settings,
    )
    _set_refresh_cookie(response, new_refresh_token)
    return ChangePasswordResponse(code=0, msg="SUCCESS", data=data)
