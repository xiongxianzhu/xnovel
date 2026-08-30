"""管理员 Web 全局 Logo 端点。"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, UploadFile

from app.api.deps import SessionDep
from app.core.config import get_settings
from app.core.security import AdminContextDep
from app.schemas.common import (
    BEARER_AUTH_RESPONSE_HEADERS,
    AuthenticationErrorResponse,
    ForbiddenErrorResponse,
    MediaTooLargeErrorResponse,
    MediaValidationErrorResponse,
    ServiceUnavailableErrorResponse,
)
from app.schemas.media import LogoData, LogoResponse
from app.services.media import MAX_LOGO_FILE_BYTES, clear_site_logo, read_validated_image, set_site_logo

router = APIRouter(prefix="/site-settings")


@router.post(
    "/logo",
    operation_id="uploadSiteLogo",
    responses={
        401: {"model": AuthenticationErrorResponse, "headers": BEARER_AUTH_RESPONSE_HEADERS},
        403: {"model": ForbiddenErrorResponse},
        413: {"model": MediaTooLargeErrorResponse},
        422: {"model": MediaValidationErrorResponse},
        503: {"model": ServiceUnavailableErrorResponse},
    },
)
async def upload_logo(
    context: AdminContextDep,
    session: SessionDep,
    file: Annotated[UploadFile, File()],
) -> LogoResponse:
    image = await read_validated_image(
        file,
        max_file_bytes=MAX_LOGO_FILE_BYTES,
        max_width=4096,
        max_height=4096,
        max_pixels=16_777_216,
    )
    url = await set_site_logo(
        session,
        context=context,
        media_root=get_settings().media_root,
        image=image,
        original_name=file.filename or "",
    )
    return LogoResponse(code=0, msg="SUCCESS", data=LogoData(url=url))


@router.delete(
    "/logo",
    operation_id="deleteSiteLogo",
    responses={
        401: {"model": AuthenticationErrorResponse, "headers": BEARER_AUTH_RESPONSE_HEADERS},
        403: {"model": ForbiddenErrorResponse},
        503: {"model": ServiceUnavailableErrorResponse},
    },
)
async def delete_logo(context: AdminContextDep, session: SessionDep) -> LogoResponse:
    await clear_site_logo(session, context=context, media_root=get_settings().media_root)
    return LogoResponse(code=0, msg="SUCCESS", data=LogoData(url=None))
