"""健康检查响应 Schema。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.schemas.common import APIResponse


class HealthData(BaseModel):
    status: Literal["ok"]


class HealthResponse(APIResponse[HealthData]):
    pass
