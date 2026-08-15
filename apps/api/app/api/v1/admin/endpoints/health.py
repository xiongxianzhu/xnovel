"""管理端健康检查。"""

from __future__ import annotations

from fastapi import APIRouter

from app.schemas.common import UnauthorizedErrorResponse
from app.schemas.health import HealthData, HealthResponse

router = APIRouter()


@router.get(
    "/health",
    operation_id="getAdminHealth",
    responses={
        401: {
            "description": "缺少或无效的 Bearer 访问令牌",
            "headers": {
                "WWW-Authenticate": {
                    "description": "客户端应使用 Bearer 认证方案",
                    "schema": {"type": "string"},
                }
            },
            "model": UnauthorizedErrorResponse,
        }
    },
)
async def admin_health() -> HealthResponse:
    return HealthResponse(code=0, msg="SUCCESS", data=HealthData(status="ok"))
