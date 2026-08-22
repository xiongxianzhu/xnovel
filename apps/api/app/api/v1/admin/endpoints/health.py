"""管理端健康检查。"""

from __future__ import annotations

from fastapi import APIRouter

from app.schemas.common import (
    BEARER_AUTH_RESPONSE_HEADERS,
    AuthenticationErrorResponse,
    ForbiddenErrorResponse,
    ServiceUnavailableErrorResponse,
)
from app.schemas.health import HealthData, HealthResponse

router = APIRouter()


@router.get(
    "/health",
    operation_id="getAdminHealth",
    responses={
        401: {
            "description": "缺少或无效的 Bearer 访问令牌",
            "headers": BEARER_AUTH_RESPONSE_HEADERS,
            "model": AuthenticationErrorResponse,
        },
        403: {"model": ForbiddenErrorResponse},
        503: {"model": ServiceUnavailableErrorResponse},
    },
)
async def admin_health() -> HealthResponse:
    return HealthResponse(code=0, msg="SUCCESS", data=HealthData(status="ok"))
