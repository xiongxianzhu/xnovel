"""AI Provider 配置端点。"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.api.deps import SessionDep
from app.core.config import get_settings
from app.core.security import PasswordChangeCompletedContextDep
from app.schemas.ai import (
    ProviderCatalogData,
    ProviderCatalogResponse,
    ProviderConfigCreateRequest,
    ProviderConfigDeleteResponse,
    ProviderConfigListResponse,
    ProviderConfigResponse,
    ProviderConfigUpdateRequest,
    ProviderConnectionTestRequest,
    ProviderConnectionTestResponse,
)
from app.schemas.common import (
    BEARER_AUTH_RESPONSE_HEADERS,
    AuthenticationErrorResponse,
    ConflictErrorResponse,
    NotFoundErrorResponse,
    ServiceUnavailableErrorResponse,
    ValidationErrorResponse,
)
from app.services.ai_tasks import run_provider_connection_test
from app.services.provider_catalog import BUILTIN_PROVIDERS
from app.services.providers import (
    create_provider_config,
    delete_provider_config,
    list_provider_configs,
    read_provider_config_data,
    update_provider_config,
)

router = APIRouter(prefix="/ai/providers")
_PAGE_QUERY = Query(default=1, ge=1)
_PAGE_SIZE_QUERY = Query(default=50, ge=1, le=100)
_SEARCH_QUERY = Query(default=None, max_length=200)
_AUTH: dict[int | str, dict[str, Any]] = {
    401: {"model": AuthenticationErrorResponse, "headers": BEARER_AUTH_RESPONSE_HEADERS},
    503: {"model": ServiceUnavailableErrorResponse},
}


@router.get("/catalog", operation_id="getAIProviderCatalog", responses=_AUTH)
async def get_catalog(_: PasswordChangeCompletedContextDep) -> ProviderCatalogResponse:
    return ProviderCatalogResponse(
        code=0,
        msg="SUCCESS",
        data=ProviderCatalogData(items=list(BUILTIN_PROVIDERS.values())),
    )


@router.get("", operation_id="listAIProviderConfigs", responses=_AUTH)
async def get_configs(
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    page: int = _PAGE_QUERY,
    page_size: int = _PAGE_SIZE_QUERY,
    q: str | None = _SEARCH_QUERY,
) -> ProviderConfigListResponse:
    data = await list_provider_configs(
        session,
        owner_id=context.user.id,
        settings=get_settings(),
        page=page,
        page_size=page_size,
        query=q,
    )
    return ProviderConfigListResponse(code=0, msg="SUCCESS", data=data)


@router.post(
    "",
    operation_id="createAIProviderConfig",
    status_code=status.HTTP_201_CREATED,
    responses=_AUTH
    | {
        409: {"model": ConflictErrorResponse},
        422: {"model": ValidationErrorResponse},
    },
)
async def post_config(
    payload: ProviderConfigCreateRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> ProviderConfigResponse:
    data = await create_provider_config(
        session,
        owner_id=context.user.id,
        payload=payload,
        settings=get_settings(),
    )
    return ProviderConfigResponse(code=0, msg="SUCCESS", data=data)


@router.delete(
    "/{config_id}",
    operation_id="deleteAIProviderConfig",
    responses=_AUTH | {404: {"model": NotFoundErrorResponse}},
)
async def delete_config(
    config_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> ProviderConfigDeleteResponse:
    data = await delete_provider_config(
        session,
        owner_id=context.user.id,
        config_id=config_id,
        settings=get_settings(),
    )
    return ProviderConfigDeleteResponse(code=0, msg="SUCCESS", data=data)


@router.get(
    "/{config_id}",
    operation_id="getAIProviderConfig",
    responses=_AUTH | {404: {"model": NotFoundErrorResponse}, 422: {"model": ValidationErrorResponse}},
)
async def get_config(
    config_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> ProviderConfigResponse:
    data = await read_provider_config_data(
        session,
        owner_id=context.user.id,
        config_id=config_id,
        settings=get_settings(),
    )
    return ProviderConfigResponse(code=0, msg="SUCCESS", data=data)


@router.put(
    "/{config_id}",
    operation_id="updateAIProviderConfig",
    responses=_AUTH
    | {
        404: {"model": NotFoundErrorResponse},
        409: {"model": ConflictErrorResponse},
        422: {"model": ValidationErrorResponse},
    },
)
async def put_config(
    config_id: UUID,
    payload: ProviderConfigUpdateRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> ProviderConfigResponse:
    data = await update_provider_config(
        session,
        owner_id=context.user.id,
        config_id=config_id,
        payload=payload,
        settings=get_settings(),
    )
    return ProviderConfigResponse(code=0, msg="SUCCESS", data=data)


@router.post(
    "/{config_id}/test",
    operation_id="testAIProviderConnection",
    responses=_AUTH
    | {
        404: {"model": NotFoundErrorResponse},
        422: {"model": ValidationErrorResponse},
    },
)
async def post_connection_test(
    config_id: UUID,
    payload: ProviderConnectionTestRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> ProviderConnectionTestResponse:
    data = await run_provider_connection_test(
        session,
        owner_id=context.user.id,
        config_id=config_id,
        model_id=payload.model_id,
        settings=get_settings(),
    )
    return ProviderConnectionTestResponse(code=0, msg="SUCCESS", data=data)
