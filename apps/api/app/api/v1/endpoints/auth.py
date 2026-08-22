"""公开站点配置与注册端点。"""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from app.api.deps import SessionDep
from app.core.config import get_settings
from app.core.error_codes import ErrorCode, ErrorMessage
from app.core.exceptions import APIException
from app.core.security import session_invalid_error
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    RefreshResponse,
    RegisteredUserData,
    RegisterRequest,
    RegisterUserResponse,
    SiteConfigData,
    SiteConfigResponse,
)
from app.schemas.common import (
    BEARER_AUTH_RESPONSE_HEADERS,
    AccountIdentifierUnavailableErrorResponse,
    ForbiddenErrorResponse,
    InvalidCredentialsErrorResponse,
    LoginRateLimitedErrorResponse,
    RegistrationDisabledErrorResponse,
    RegistrationRateLimitedErrorResponse,
    ServiceUnavailableErrorResponse,
    SessionInvalidErrorResponse,
    ValidationErrorResponse,
)
from app.services.authentication import login_user, logout_session, refresh_session
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


def _set_refresh_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=token,
        max_age=settings.refresh_token_days * 24 * 60 * 60,
        path="/api/v1",
        secure=settings.refresh_cookie_secure,
        httponly=True,
        samesite="lax",
    )


def _clear_refresh_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path="/api/v1",
        secure=settings.refresh_cookie_secure,
        httponly=True,
        samesite="lax",
    )


def _require_trusted_origin(request: Request) -> None:
    if request.headers.get("origin") not in get_settings().trusted_web_origins:
        raise APIException(status_code=403, code=ErrorCode.FORBIDDEN, msg=ErrorMessage.FORBIDDEN)


@router.post(
    "/auth/login",
    operation_id="login",
    responses={
        401: {"model": InvalidCredentialsErrorResponse, "headers": BEARER_AUTH_RESPONSE_HEADERS},
        422: {"model": ValidationErrorResponse},
        429: {"model": LoginRateLimitedErrorResponse},
        503: {"model": ServiceUnavailableErrorResponse},
    },
)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: SessionDep,
) -> LoginResponse:
    if request.client is None:
        raise APIException(status_code=503, code=ErrorCode.SERVICE_UNAVAILABLE, msg=ErrorMessage.SERVICE_UNAVAILABLE)
    data, refresh_token = await login_user(
        session,
        payload=payload,
        client_ip=request.client.host,
        user_agent=request.headers.get("user-agent", ""),
        settings=get_settings(),
    )
    _set_refresh_cookie(response, refresh_token)
    return LoginResponse(code=0, msg="SUCCESS", data=data)


@router.post(
    "/auth/refresh",
    operation_id="refreshSession",
    responses={
        401: {"model": SessionInvalidErrorResponse, "headers": BEARER_AUTH_RESPONSE_HEADERS},
        403: {"model": ForbiddenErrorResponse},
        503: {"model": ServiceUnavailableErrorResponse},
    },
)
async def refresh(request: Request, response: Response, session: SessionDep) -> RefreshResponse:
    _require_trusted_origin(request)
    if request.client is None:
        raise APIException(status_code=503, code=ErrorCode.SERVICE_UNAVAILABLE, msg=ErrorMessage.SERVICE_UNAVAILABLE)
    settings = get_settings()
    raw_token = request.cookies.get(settings.refresh_cookie_name)
    if not raw_token:
        _clear_refresh_cookie(response)
        raise session_invalid_error()
    try:
        data, new_token = await refresh_session(
            session,
            raw_token=raw_token,
            client_ip=request.client.host,
            settings=settings,
        )
    except APIException:
        _clear_refresh_cookie(response)
        raise
    _set_refresh_cookie(response, new_token)
    return RefreshResponse(code=0, msg="SUCCESS", data=data)


@router.post(
    "/auth/logout",
    operation_id="logout",
    responses={
        403: {"model": ForbiddenErrorResponse},
        503: {"model": ServiceUnavailableErrorResponse},
    },
)
async def logout(request: Request, response: Response, session: SessionDep) -> LogoutResponse:
    _require_trusted_origin(request)
    settings = get_settings()
    await logout_session(
        session,
        raw_token=request.cookies.get(settings.refresh_cookie_name),
        settings=settings,
    )
    _clear_refresh_cookie(response)
    return LogoutResponse(code=0, msg="SUCCESS", data={})
