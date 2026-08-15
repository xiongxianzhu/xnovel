"""健康检查端点。"""

from __future__ import annotations

from fastapi import APIRouter

from app.schemas.health import HealthData, HealthResponse

router = APIRouter()


@router.get("/health", operation_id="getHealth")
async def health() -> HealthResponse:
    return HealthResponse(code=0, msg="SUCCESS", data=HealthData(status="ok"))
