"""C 端 API 路由聚合。"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import (
    ai_batches,
    ai_history,
    ai_tasks,
    auth,
    health,
    management_queries,
    manuscript_tools,
    media,
    planning,
    preferences,
    profile,
    projects,
    providers,
    revisions,
    skills,
    studio,
)
from app.schemas.common import HTTPErrorResponse

api_router = APIRouter(responses={"default": {"model": HTTPErrorResponse}})
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(profile.router, tags=["profile"])
api_router.include_router(media.router, tags=["media"])
api_router.include_router(preferences.router, tags=["preferences"])
api_router.include_router(projects.router, tags=["projects"])
api_router.include_router(planning.router, tags=["planning"])
api_router.include_router(providers.router, tags=["ai-providers"])
api_router.include_router(skills.router, tags=["skills"])
api_router.include_router(ai_tasks.router, tags=["ai-tasks"])
api_router.include_router(ai_history.router, tags=["ai-history"])
api_router.include_router(ai_batches.router, tags=["ai-batches"])
api_router.include_router(revisions.router, tags=["document-revisions"])
api_router.include_router(studio.router, tags=["writing-studio"])
api_router.include_router(manuscript_tools.router, tags=["manuscript-tools"])
api_router.include_router(management_queries.router, tags=["management-queries"])
