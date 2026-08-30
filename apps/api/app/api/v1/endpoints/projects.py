"""作品列表、创建与详情端点。"""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, File, Query, UploadFile, status

from app.api.deps import SessionDep
from app.core.config import get_settings
from app.core.security import PasswordChangeCompletedContextDep
from app.schemas.common import (
    BEARER_AUTH_RESPONSE_HEADERS,
    AuthenticationErrorResponse,
    ConflictErrorResponse,
    MediaTooLargeErrorResponse,
    MediaValidationErrorResponse,
    NotFoundErrorResponse,
    ServiceUnavailableErrorResponse,
    ValidationErrorResponse,
)
from app.schemas.projects import (
    DocumentContentResponse,
    DocumentContentUpdateRequest,
    DocumentCreateRequest,
    DocumentDeleteResponse,
    DocumentListResponse,
    DocumentMutationResponse,
    DocumentReorderRequest,
    DocumentTreeStatus,
    DocumentUpdateRequest,
    ProjectCoverResponse,
    ProjectCreateRequest,
    ProjectCreateResponse,
    ProjectDeleteResponse,
    ProjectDetailResponse,
    ProjectListResponse,
    ProjectMutationResponse,
    ProjectUpdateRequest,
    ProjectUpdateStatus,
    ProjectView,
)
from app.services.media import MAX_COVER_FILE_BYTES, read_validated_image
from app.services.projects import (
    clear_project_cover,
    create_document,
    create_project,
    delete_document,
    delete_project,
    get_document_content,
    get_project,
    list_documents,
    list_projects,
    reorder_documents,
    restore_project,
    save_document_content,
    set_project_cover,
    update_document,
    update_project,
)

router = APIRouter(prefix="/projects")
_DOCUMENT_STATUS_QUERY = Query(default="active", alias="status")
_PROJECT_VIEW_QUERY = Query(default="active")
_PROJECT_UPDATE_STATUS_QUERY = Query(default=None)

_AUTH_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": AuthenticationErrorResponse, "headers": BEARER_AUTH_RESPONSE_HEADERS},
    503: {"model": ServiceUnavailableErrorResponse},
}


@router.get(
    "",
    operation_id="listProjects",
    responses=_AUTH_RESPONSES | {422: {"model": ValidationErrorResponse}},
)
async def get_projects(
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    q: str | None = Query(default=None, max_length=200),
    view: ProjectView = _PROJECT_VIEW_QUERY,
    update_status: ProjectUpdateStatus | None = _PROJECT_UPDATE_STATUS_QUERY,
) -> ProjectListResponse:
    data = await list_projects(
        session,
        owner_id=context.user.id,
        page=page,
        page_size=page_size,
        query=q,
        view=view,
        update_status=update_status,
    )
    return ProjectListResponse(code=0, msg="SUCCESS", data=data)


@router.post(
    "",
    operation_id="createProject",
    status_code=status.HTTP_201_CREATED,
    responses=_AUTH_RESPONSES | {422: {"model": ValidationErrorResponse}},
)
async def post_project(
    payload: ProjectCreateRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> ProjectCreateResponse:
    data = await create_project(session, owner_id=context.user.id, payload=payload)
    return ProjectCreateResponse(code=0, msg="SUCCESS", data=data)


@router.get(
    "/{project_id}",
    operation_id="getProject",
    responses=_AUTH_RESPONSES
    | {
        404: {"model": NotFoundErrorResponse},
        422: {"model": ValidationErrorResponse},
    },
)
async def get_project_detail(
    project_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> ProjectDetailResponse:
    data = await get_project(session, owner_id=context.user.id, project_id=project_id)
    return ProjectDetailResponse(code=0, msg="SUCCESS", data=data)


@router.patch(
    "/{project_id}",
    operation_id="updateProject",
    responses=_AUTH_RESPONSES
    | {
        404: {"model": NotFoundErrorResponse},
        422: {"model": ValidationErrorResponse},
    },
)
async def patch_project(
    project_id: UUID,
    payload: ProjectUpdateRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> ProjectMutationResponse:
    data = await update_project(
        session,
        owner_id=context.user.id,
        project_id=project_id,
        payload=payload,
    )
    return ProjectMutationResponse(code=0, msg="SUCCESS", data=data)


@router.delete(
    "/{project_id}",
    operation_id="deleteProject",
    responses=_AUTH_RESPONSES | {404: {"model": NotFoundErrorResponse}},
)
async def remove_project(
    project_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> ProjectDeleteResponse:
    data = await delete_project(
        session,
        owner_id=context.user.id,
        project_id=project_id,
    )
    return ProjectDeleteResponse(code=0, msg="SUCCESS", data=data)


@router.post(
    "/{project_id}/restore",
    operation_id="restoreProject",
    responses=_AUTH_RESPONSES | {404: {"model": NotFoundErrorResponse}},
)
async def post_restore_project(
    project_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> ProjectMutationResponse:
    data = await restore_project(
        session,
        owner_id=context.user.id,
        project_id=project_id,
    )
    return ProjectMutationResponse(code=0, msg="SUCCESS", data=data)


@router.post(
    "/{project_id}/cover",
    operation_id="uploadProjectCover",
    responses=_AUTH_RESPONSES
    | {
        404: {"model": NotFoundErrorResponse},
        413: {"model": MediaTooLargeErrorResponse},
        422: {"model": MediaValidationErrorResponse},
    },
)
async def upload_project_cover(
    project_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    file: Annotated[UploadFile, File()],
) -> ProjectCoverResponse:
    image = await read_validated_image(
        file,
        max_file_bytes=MAX_COVER_FILE_BYTES,
        max_width=4096,
        max_height=4096,
        max_pixels=16_777_216,
    )
    data = await set_project_cover(
        session,
        owner_id=context.user.id,
        project_id=project_id,
        media_root=get_settings().media_root,
        image=image,
    )
    return ProjectCoverResponse(code=0, msg="SUCCESS", data=data)


@router.delete(
    "/{project_id}/cover",
    operation_id="deleteProjectCover",
    responses=_AUTH_RESPONSES | {404: {"model": NotFoundErrorResponse}},
)
async def remove_project_cover(
    project_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> ProjectCoverResponse:
    data = await clear_project_cover(
        session,
        owner_id=context.user.id,
        project_id=project_id,
        media_root=get_settings().media_root,
    )
    return ProjectCoverResponse(code=0, msg="SUCCESS", data=data)


@router.get(
    "/{project_id}/documents",
    operation_id="listProjectDocuments",
    responses=_AUTH_RESPONSES
    | {
        404: {"model": NotFoundErrorResponse},
        422: {"model": ValidationErrorResponse},
    },
)
async def get_project_documents(
    project_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
    document_status: DocumentTreeStatus = _DOCUMENT_STATUS_QUERY,
) -> DocumentListResponse:
    data = await list_documents(
        session,
        owner_id=context.user.id,
        project_id=project_id,
        tree_status=document_status,
    )
    return DocumentListResponse(code=0, msg="SUCCESS", data=data)


@router.post(
    "/{project_id}/documents",
    operation_id="createProjectDocument",
    status_code=status.HTTP_201_CREATED,
    responses=_AUTH_RESPONSES
    | {
        404: {"model": NotFoundErrorResponse},
        409: {"model": ConflictErrorResponse},
        422: {"model": ValidationErrorResponse},
    },
)
async def post_project_document(
    project_id: UUID,
    payload: DocumentCreateRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> DocumentMutationResponse:
    data = await create_document(
        session,
        owner_id=context.user.id,
        project_id=project_id,
        payload=payload,
    )
    return DocumentMutationResponse(code=0, msg="SUCCESS", data=data)


@router.post(
    "/{project_id}/documents/reorder",
    operation_id="reorderProjectDocuments",
    responses=_AUTH_RESPONSES
    | {
        404: {"model": NotFoundErrorResponse},
        409: {"model": ConflictErrorResponse},
        422: {"model": ValidationErrorResponse},
    },
)
async def post_project_documents_reorder(
    project_id: UUID,
    payload: DocumentReorderRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> DocumentListResponse:
    data = await reorder_documents(
        session,
        owner_id=context.user.id,
        project_id=project_id,
        payload=payload,
    )
    return DocumentListResponse(code=0, msg="SUCCESS", data=data)


@router.get(
    "/{project_id}/documents/{document_id}/content",
    operation_id="getProjectDocumentContent",
    responses=_AUTH_RESPONSES
    | {
        404: {"model": NotFoundErrorResponse},
        422: {"model": ValidationErrorResponse},
    },
)
async def get_project_document_content(
    project_id: UUID,
    document_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> DocumentContentResponse:
    data = await get_document_content(
        session,
        owner_id=context.user.id,
        project_id=project_id,
        document_id=document_id,
    )
    return DocumentContentResponse(code=0, msg="SUCCESS", data=data)


@router.put(
    "/{project_id}/documents/{document_id}/content",
    operation_id="saveProjectDocumentContent",
    responses=_AUTH_RESPONSES
    | {
        404: {"model": NotFoundErrorResponse},
        409: {"model": ConflictErrorResponse},
        422: {"model": ValidationErrorResponse},
    },
)
async def put_project_document_content(
    project_id: UUID,
    document_id: UUID,
    payload: DocumentContentUpdateRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> DocumentContentResponse:
    data = await save_document_content(
        session,
        owner_id=context.user.id,
        project_id=project_id,
        document_id=document_id,
        payload=payload,
    )
    return DocumentContentResponse(code=0, msg="SUCCESS", data=data)


@router.patch(
    "/{project_id}/documents/{document_id}",
    operation_id="updateProjectDocument",
    responses=_AUTH_RESPONSES
    | {
        404: {"model": NotFoundErrorResponse},
        409: {"model": ConflictErrorResponse},
        422: {"model": ValidationErrorResponse},
    },
)
async def patch_project_document(
    project_id: UUID,
    document_id: UUID,
    payload: DocumentUpdateRequest,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> DocumentMutationResponse:
    data = await update_document(
        session,
        owner_id=context.user.id,
        project_id=project_id,
        document_id=document_id,
        payload=payload,
    )
    return DocumentMutationResponse(code=0, msg="SUCCESS", data=data)


@router.delete(
    "/{project_id}/documents/{document_id}",
    operation_id="deleteProjectDocument",
    responses=_AUTH_RESPONSES
    | {
        404: {"model": NotFoundErrorResponse},
        409: {"model": ConflictErrorResponse},
        422: {"model": ValidationErrorResponse},
    },
)
async def delete_project_document(
    project_id: UUID,
    document_id: UUID,
    context: PasswordChangeCompletedContextDep,
    session: SessionDep,
) -> DocumentDeleteResponse:
    data = await delete_document(
        session,
        owner_id=context.user.id,
        project_id=project_id,
        document_id=document_id,
    )
    return DocumentDeleteResponse(code=0, msg="SUCCESS", data=data)
