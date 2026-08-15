"""统一异常与全局处理器。"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.error_codes import ErrorCode, ErrorMessage

_HTTP_ERROR_MAP: dict[int, tuple[ErrorCode, ErrorMessage]] = {
    401: (ErrorCode.UNAUTHORIZED, ErrorMessage.UNAUTHORIZED),
    403: (ErrorCode.FORBIDDEN, ErrorMessage.FORBIDDEN),
    404: (ErrorCode.NOT_FOUND, ErrorMessage.NOT_FOUND),
    409: (ErrorCode.CONFLICT, ErrorMessage.CONFLICT),
    429: (ErrorCode.RATE_LIMITED, ErrorMessage.RATE_LIMITED),
    503: (ErrorCode.SERVICE_UNAVAILABLE, ErrorMessage.SERVICE_UNAVAILABLE),
}


def _validation_details(exc: RequestValidationError) -> list[dict[str, Any]]:
    """返回不包含原始输入值的校验错误。"""

    return [
        {
            "type": error["type"],
            "loc": list(error["loc"]),
            "msg": error["msg"],
        }
        for error in exc.errors()
    ]


class APIException(Exception):
    """业务异常基类。"""

    status_code: int = 400
    code: int = ErrorCode.INTERNAL_ERROR
    msg: str = ErrorMessage.INTERNAL_ERROR

    def __init__(
        self,
        *,
        code: int | None = None,
        msg: str | None = None,
        status_code: int | None = None,
        data: dict[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(msg or self.msg)
        if code is not None:
            self.code = code
        if msg is not None:
            self.msg = msg
        if status_code is not None:
            self.status_code = status_code
        self.data = data or {}
        self.headers = dict(headers or {})

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": int(self.code),
            "msg": str(self.msg),
            "data": self.data,
        }


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(APIException)
    async def api_exception_handler(_: Request, exc: APIException) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, headers=exc.headers, content=exc.to_dict())

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code, msg = _HTTP_ERROR_MAP.get(
            exc.status_code,
            (ErrorCode.INTERNAL_ERROR, ErrorMessage.INTERNAL_ERROR),
        )
        return JSONResponse(
            status_code=exc.status_code,
            headers=exc.headers,
            content={
                "code": int(code),
                "msg": str(msg),
                "data": {},
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "code": int(ErrorCode.VALIDATION_ERROR),
                "msg": str(ErrorMessage.VALIDATION_ERROR),
                "data": {"details": _validation_details(exc)},
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_: Request, __: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={
                "code": int(ErrorCode.INTERNAL_ERROR),
                "msg": str(ErrorMessage.INTERNAL_ERROR),
                "data": {},
            },
        )
