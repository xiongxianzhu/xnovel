"""管理端 API 路由聚合。"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.v1.admin.endpoints import health, management, site_settings, skills
from app.core.security import admin_required
from app.schemas.common import HTTPErrorResponse

admin_router = APIRouter(
    dependencies=[Depends(admin_required)],
    responses={"default": {"model": HTTPErrorResponse}},
)
admin_router.include_router(health.router, tags=["admin-health"])
admin_router.include_router(site_settings.router, tags=["admin-site-settings"])
admin_router.include_router(skills.router, tags=["admin-skills"])
admin_router.include_router(management.router, tags=["admin-management"])
