"""C 端 API 路由聚合。"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import auth, health, media, preferences, profile, projects
from app.schemas.common import HTTPErrorResponse

api_router = APIRouter(responses={"default": {"model": HTTPErrorResponse}})
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(profile.router, tags=["profile"])
api_router.include_router(media.router, tags=["media"])
api_router.include_router(preferences.router, tags=["preferences"])
api_router.include_router(projects.router, tags=["projects"])
