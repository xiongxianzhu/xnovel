"""作品创建、列表与详情 Schema。"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import APIResponse

ProjectStructureMode = Literal["single_document", "tree"]
ProjectStatus = Literal["active", "archived"]
DocumentKind = Literal["folder", "manuscript", "outline", "note"]
DocumentStatus = Literal["active", "archived"]


class ProjectCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("title must not be empty")
        return normalized


class DocumentSummary(BaseModel):
    id: UUID
    title: str
    kind: DocumentKind
    parent_id: UUID | None
    position: int
    status: DocumentStatus
    created_at: datetime
    updated_at: datetime


class ProjectSummary(BaseModel):
    id: UUID
    title: str
    structure_mode: ProjectStructureMode
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime


class ProjectListData(BaseModel):
    page: int
    page_size: int
    total: int
    pages: int
    items: list[ProjectSummary]


class ProjectDetailData(ProjectSummary):
    initial_document: DocumentSummary


class ProjectListResponse(APIResponse[ProjectListData]):
    pass


class ProjectCreateResponse(APIResponse[ProjectDetailData]):
    pass


class ProjectDetailResponse(APIResponse[ProjectDetailData]):
    pass
