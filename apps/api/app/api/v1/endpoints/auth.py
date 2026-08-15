"""公开站点配置与注册端点。"""

from __future__ import annotations

from fastapi import APIRouter, Request, status

from app.api.deps import SessionDep
from app.core.config import get_settings
from app.core.error_codes import ErrorCode, ErrorMessage
from app.core.exceptions import APIException
from app.schemas.auth import (
    RegisteredUserData,
    RegisterRequest,
    RegisterUserResponse,
    SiteConfigData,
    SiteConfigResponse,
)
from app.schemas.common import (
    AccountIdentifierUnavailableErrorResponse,
    RegistrationDisabledErrorResponse,
    RegistrationRateLimitedErrorResponse,
    ServiceUnavailableErrorResponse,
    ValidationErrorResponse,
)
from app.services.registration import get_registration_enabled, register_user

router = APIRouter()


@router.get(
    "/site-config",
    operation_id="getSiteConfig",
    responses={503: {"model": ServiceUnavailableErrorResponse}},
)
async def get_site_config(session: SessionDep) -> SiteConfigResponse:
    enabled = await get_registration_enabled(session)
    return SiteConfigResponse(code=0, msg="SUCCESS", data=SiteConfigData(registration_enabled=enabled))


@router.post(
    "/auth/register",
    operation_id="register",
    status_code=status.HTTP_201_CREATED,
    responses={
        403: {"model": RegistrationDisabledErrorResponse},
        409: {"model": AccountIdentifierUnavailableErrorResponse},
        422: {"model": ValidationErrorResponse},
        429: {
            "model": RegistrationRateLimitedErrorResponse,
            "headers": {
                "Retry-After": {
                    "description": "当前固定窗口剩余秒数。",
                    "schema": {"type": "integer", "minimum": 1},
                }
            },
        },
        503: {"model": ServiceUnavailableErrorResponse},
    },
)
async def register(payload: RegisterRequest, request: Request, session: SessionDep) -> RegisterUserResponse:
    if request.client is None:
        raise APIException(
            status_code=503,
            code=ErrorCode.SERVICE_UNAVAILABLE,
            msg=ErrorMessage.SERVICE_UNAVAILABLE,
        )
    user: RegisteredUserData = await register_user(
        session,
        payload=payload,
        client_ip=request.client.host,
        secret_key=get_settings().secret_key,
    )
    return RegisterUserResponse(code=0, msg="SUCCESS", data=user)
