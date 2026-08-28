"""作品规划、设定、引用与导出端点。"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Query, Response, status

from app.api.deps import SessionDep
from app.core.security import PasswordChangeCompletedContextDep
from app.schemas.common import (
    BEARER_AUTH_RESPONSE_HEADERS,
    AuthenticationErrorResponse,
    ConflictErrorResponse,
    NotFoundErrorResponse,
    ServiceUnavailableErrorResponse,
    ValidationErrorResponse,
)
from app.schemas.planning import (
    CharacterCreateRequest,
    CharacterListResponse,
    CharacterReorderRequest,
    CharacterResponse,
    CharacterUpdateRequest,
    DocumentReferencesResponse,
    DocumentReferencesUpdateRequest,
    ExportFormat,
    ResourceDeleteResponse,
    WorldEntryCreateRequest,
    WorldEntryListResponse,
    WorldEntryReorderRequest,
    WorldEntryResponse,
    WorldEntryUpdateRequest,
)
from app.services.exporting import export_project
from app.services.planning import (
    create_character,
    create_world_entry,
    delete_character,
    delete_world_entry,
    get_document_references,
    list_characters,
    list_world_entries,
    reorder_characters,
    reorder_world_entries,
    update_character,
    update_document_references,
    update_world_entry,
)

router = APIRouter(prefix="/projects/{project_id}")
_EXPORT_FORMAT_QUERY = Query(default="markdown", alias="format")

_AUTH_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": AuthenticationErrorResponse, "headers": BEARER_AUTH_RESPONSE_HEADERS},
    503: {"model": ServiceUnavailableErrorResponse},
}
_MUTATION_RESPONSES = _AUTH_RESPONSES | {
    404: {"model": NotFoundErrorResponse},
    409: {"model": ConflictErrorResponse},
    422: {"model": ValidationErrorResponse},
}


@router.get(
    "/characters",
    operation_id="listProjectCharacters",
    responses=_AUTH_RESPONSES | {404: {"model": NotFoundErrorResponse}, 422: {"model": ValidationErrorResponse}},
)
async def get_characters(
    project_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> CharacterListResponse:
    data = await list_characters(session, owner_id=context.user.id, project_id=project_id)
    return CharacterListResponse(code=0, msg="SUCCESS", data=data)


@router.post(
    "/characters",
    operation_id="createProjectCharacter",
    status_code=status.HTTP_201_CREATED,
    responses=_MUTATION_RESPONSES,
)
async def post_character(
    project_id: UUID,
    payload: CharacterCreateRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> CharacterResponse:
    data = await create_character(session, owner_id=context.user.id, project_id=project_id, payload=payload)
    return CharacterResponse(code=0, msg="SUCCESS", data=data)


@router.post(
    "/characters/reorder",
    operation_id="reorderProjectCharacters",
    responses=_MUTATION_RESPONSES,
)
async def post_character_reorder(
    project_id: UUID,
    payload: CharacterReorderRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> CharacterListResponse:
    data = await reorder_characters(session, owner_id=context.user.id, project_id=project_id, payload=payload)
    return CharacterListResponse(code=0, msg="SUCCESS", data=data)


@router.patch(
    "/characters/{character_id}",
    operation_id="updateProjectCharacter",
    responses=_MUTATION_RESPONSES,
)
async def patch_character(
    project_id: UUID,
    character_id: UUID,
    payload: CharacterUpdateRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> CharacterResponse:
    data = await update_character(
        session,
        owner_id=context.user.id,
        project_id=project_id,
        character_id=character_id,
        payload=payload,
    )
    return CharacterResponse(code=0, msg="SUCCESS", data=data)


@router.delete(
    "/characters/{character_id}",
    operation_id="deleteProjectCharacter",
    responses=_MUTATION_RESPONSES,
)
async def delete_character_endpoint(
    project_id: UUID,
    character_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> ResourceDeleteResponse:
    data = await delete_character(
        session,
        owner_id=context.user.id,
        project_id=project_id,
        character_id=character_id,
    )
    return ResourceDeleteResponse(code=0, msg="SUCCESS", data=data)


@router.get(
    "/world-entries",
    operation_id="listProjectWorldEntries",
    responses=_AUTH_RESPONSES | {404: {"model": NotFoundErrorResponse}, 422: {"model": ValidationErrorResponse}},
)
async def get_world_entries(
    project_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> WorldEntryListResponse:
    data = await list_world_entries(session, owner_id=context.user.id, project_id=project_id)
    return WorldEntryListResponse(code=0, msg="SUCCESS", data=data)


@router.post(
    "/world-entries",
    operation_id="createProjectWorldEntry",
    status_code=status.HTTP_201_CREATED,
    responses=_MUTATION_RESPONSES,
)
async def post_world_entry(
    project_id: UUID,
    payload: WorldEntryCreateRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> WorldEntryResponse:
    data = await create_world_entry(session, owner_id=context.user.id, project_id=project_id, payload=payload)
    return WorldEntryResponse(code=0, msg="SUCCESS", data=data)


@router.post(
    "/world-entries/reorder",
    operation_id="reorderProjectWorldEntries",
    responses=_MUTATION_RESPONSES,
)
async def post_world_entry_reorder(
    project_id: UUID,
    payload: WorldEntryReorderRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> WorldEntryListResponse:
    data = await reorder_world_entries(session, owner_id=context.user.id, project_id=project_id, payload=payload)
    return WorldEntryListResponse(code=0, msg="SUCCESS", data=data)


@router.patch(
    "/world-entries/{entry_id}",
    operation_id="updateProjectWorldEntry",
    responses=_MUTATION_RESPONSES,
)
async def patch_world_entry(
    project_id: UUID,
    entry_id: UUID,
    payload: WorldEntryUpdateRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> WorldEntryResponse:
    data = await update_world_entry(
        session,
        owner_id=context.user.id,
        project_id=project_id,
        entry_id=entry_id,
        payload=payload,
    )
    return WorldEntryResponse(code=0, msg="SUCCESS", data=data)


@router.delete(
    "/world-entries/{entry_id}",
    operation_id="deleteProjectWorldEntry",
    responses=_MUTATION_RESPONSES,
)
async def delete_world_entry_endpoint(
    project_id: UUID,
    entry_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> ResourceDeleteResponse:
    data = await delete_world_entry(
        session,
        owner_id=context.user.id,
        project_id=project_id,
        entry_id=entry_id,
    )
    return ResourceDeleteResponse(code=0, msg="SUCCESS", data=data)


@router.get(
    "/documents/{document_id}/references",
    operation_id="getProjectDocumentReferences",
    responses=_AUTH_RESPONSES | {404: {"model": NotFoundErrorResponse}, 422: {"model": ValidationErrorResponse}},
)
async def get_references(
    project_id: UUID,
    document_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> DocumentReferencesResponse:
    data = await get_document_references(
        session,
        owner_id=context.user.id,
        project_id=project_id,
        document_id=document_id,
    )
    return DocumentReferencesResponse(code=0, msg="SUCCESS", data=data)


@router.put(
    "/documents/{document_id}/references",
    operation_id="updateProjectDocumentReferences",
    responses=_MUTATION_RESPONSES,
)
async def put_references(
    project_id: UUID,
    document_id: UUID,
    payload: DocumentReferencesUpdateRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> DocumentReferencesResponse:
    data = await update_document_references(
        session,
        owner_id=context.user.id,
        project_id=project_id,
        document_id=document_id,
        payload=payload,
    )
    return DocumentReferencesResponse(code=0, msg="SUCCESS", data=data)


@router.get(
    "/export",
    operation_id="exportProject",
    response_class=Response,
    responses=_AUTH_RESPONSES
    | {
        200: {
            "content": {
                "text/markdown": {"schema": {"type": "string"}},
                "text/plain": {"schema": {"type": "string"}},
            },
            "description": "UTF-8 作品正文导出文件",
        },
        404: {"model": NotFoundErrorResponse},
        422: {"model": ValidationErrorResponse},
    },
)
async def get_export(
    project_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    export_format: ExportFormat = _EXPORT_FORMAT_QUERY,
) -> Response:
    exported = await export_project(
        session,
        owner_id=context.user.id,
        project_id=project_id,
        export_format=export_format,
    )
    encoded_name = quote(exported.filename)
    return Response(
        content=exported.content.encode(),
        media_type=exported.media_type,
        headers={
            "Content-Disposition": f"attachment; filename=xnovel-export; filename*=UTF-8''{encoded_name}",
            "X-Content-Type-Options": "nosniff",
        },
    )
