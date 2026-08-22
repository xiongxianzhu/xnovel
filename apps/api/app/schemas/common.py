"""统一 API 响应 Schema。"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, RootModel
from sqlmodel import SQLModel

BEARER_AUTH_RESPONSE_HEADERS = {
    "WWW-Authenticate": {
        "description": "客户端应使用 Bearer 认证方案",
        "schema": {"type": "string"},
    }
}


class APIResponse[DataT](BaseModel):
    """成功响应信封。"""

    code: Literal[0]
    msg: Literal["SUCCESS"]
    data: DataT


class _ErrorResponse(BaseModel):
    """稳定错误响应的公共字段。"""

    data: dict[str, Any]


class InternalErrorResponse(_ErrorResponse):
    code: Literal[-1]
    msg: Literal["INTERNAL_ERROR"]


class ValidationErrorResponse(_ErrorResponse):
    code: Literal[10001]
    msg: Literal["VALIDATION_ERROR"]


class UnauthorizedErrorResponse(_ErrorResponse):
    code: Literal[10002]
    msg: Literal["UNAUTHORIZED"]


class ForbiddenErrorResponse(_ErrorResponse):
    code: Literal[10003]
    msg: Literal["FORBIDDEN"]


class NotFoundErrorResponse(_ErrorResponse):
    code: Literal[10004]
    msg: Literal["NOT_FOUND"]


class ConflictErrorResponse(_ErrorResponse):
    code: Literal[10005]
    msg: Literal["CONFLICT"]


class RateLimitedErrorResponse(_ErrorResponse):
    code: Literal[10006]
    msg: Literal["RATE_LIMITED"]


class ServiceUnavailableErrorResponse(_ErrorResponse):
    code: Literal[10007]
    msg: Literal["SERVICE_UNAVAILABLE"]


class RegistrationDisabledErrorResponse(_ErrorResponse):
    code: Literal[11001]
    msg: Literal["REGISTRATION_DISABLED"]


class AccountIdentifierUnavailableErrorResponse(_ErrorResponse):
    code: Literal[11002]
    msg: Literal["ACCOUNT_IDENTIFIER_UNAVAILABLE"]


class RegistrationRateLimitedErrorResponse(_ErrorResponse):
    code: Literal[11003]
    msg: Literal["REGISTRATION_RATE_LIMITED"]


class InvalidCredentialsErrorResponse(_ErrorResponse):
    code: Literal[11004]
    msg: Literal["INVALID_CREDENTIALS"]


class LoginRateLimitedErrorResponse(_ErrorResponse):
    code: Literal[11005]
    msg: Literal["LOGIN_RATE_LIMITED"]


class SessionInvalidErrorResponse(_ErrorResponse):
    code: Literal[11006]
    msg: Literal["SESSION_INVALID"]


class CurrentPasswordInvalidErrorResponse(_ErrorResponse):
    code: Literal[11007]
    msg: Literal["CURRENT_PASSWORD_INVALID"]


class MediaInvalidErrorResponse(_ErrorResponse):
    code: Literal[12001]
    msg: Literal["MEDIA_INVALID"]


class MediaTooLargeErrorResponse(_ErrorResponse):
    code: Literal[12002]
    msg: Literal["MEDIA_TOO_LARGE"]


class AuthenticationErrorResponse(RootModel[UnauthorizedErrorResponse | SessionInvalidErrorResponse]):
    """Bearer 缺失、无效或会话失效。"""


class ProfileValidationErrorResponse(RootModel[ValidationErrorResponse | CurrentPasswordInvalidErrorResponse]):
    """资料或密码修改校验失败。"""


class MediaValidationErrorResponse(RootModel[ValidationErrorResponse | MediaInvalidErrorResponse]):
    """媒体请求结构或内容校验失败。"""


class HTTPErrorResponse(
    RootModel[
        InternalErrorResponse
        | ValidationErrorResponse
        | UnauthorizedErrorResponse
        | ForbiddenErrorResponse
        | NotFoundErrorResponse
        | ConflictErrorResponse
        | RateLimitedErrorResponse
        | ServiceUnavailableErrorResponse
        | RegistrationDisabledErrorResponse
        | AccountIdentifierUnavailableErrorResponse
        | RegistrationRateLimitedErrorResponse
        | InvalidCredentialsErrorResponse
        | LoginRateLimitedErrorResponse
        | SessionInvalidErrorResponse
        | CurrentPasswordInvalidErrorResponse
        | MediaInvalidErrorResponse
        | MediaTooLargeErrorResponse
    ]
):
    """所有稳定错误响应的联合类型，用于未预见状态的兜底契约。"""


class ExampleCreate(SQLModel):
    name: str


class ExampleRead(SQLModel):
    id: int
    name: str
