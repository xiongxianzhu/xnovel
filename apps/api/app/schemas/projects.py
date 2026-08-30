"""作品创建、列表与详情 Schema。"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import APIResponse

ProjectStructureMode = Literal["single_document", "tree"]
ProjectStatus = Literal["active", "archived"]
ProjectUpdateStatus = Literal["not_started", "serializing", "completed"]
ProjectView = Literal["active", "archived", "deleted"]
DocumentKind = Literal["folder", "manuscript", "outline", "note"]
DocumentStatus = Literal["active", "archived"]
DocumentTreeStatus = Literal["active", "archived", "all"]
CreatableDocumentKind = Literal["folder", "manuscript", "outline"]


class ProjectCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    author: str = Field(default="", max_length=100)
    description: str = Field(default="", max_length=2000)
    structure_mode: ProjectStructureMode = "tree"
    update_status: ProjectUpdateStatus = "not_started"

    @field_validator("author", mode="before")
    @classmethod
    def normalize_author(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("title must not be empty")
        return normalized


class ProjectUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    author: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    update_status: ProjectUpdateStatus | None = None
    status: ProjectStatus | None = None

    @field_validator("author", mode="before")
    @classmethod
    def normalize_author(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("title")
    @classmethod
    def normalize_optional_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("title must not be empty")
        return normalized

    @model_validator(mode="after")
    def require_change(self) -> ProjectUpdateRequest:
        if not self.model_fields_set:
            raise ValueError("at least one field must be provided")
        return self


class DocumentSummary(BaseModel):
    id: UUID
    title: str
    kind: DocumentKind
    parent_id: UUID | None
    position: int
    status: DocumentStatus
    created_at: datetime
    updated_at: datetime


class DocumentListData(BaseModel):
    items: list[DocumentSummary]


class DocumentCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    kind: CreatableDocumentKind
    parent_id: UUID | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("title must not be empty")
        return normalized


class DocumentUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    status: DocumentStatus | None = None

    @field_validator("title")
    @classmethod
    def normalize_optional_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("title must not be empty")
        return normalized

    @model_validator(mode="after")
    def require_change(self) -> DocumentUpdateRequest:
        if self.title is None and self.status is None:
            raise ValueError("at least one field must be provided")
        return self


class DocumentReorderItem(BaseModel):
    id: UUID
    updated_at: datetime


class DocumentReorderGroup(BaseModel):
    parent_id: UUID | None
    items: list[DocumentReorderItem]


class DocumentReorderRequest(BaseModel):
    document_id: UUID
    target_parent_id: UUID | None
    groups: list[DocumentReorderGroup] = Field(min_length=1, max_length=2)


class DocumentDeleteData(BaseModel):
    id: UUID
    deleted: Literal[True]


class DocumentContentData(BaseModel):
    document_id: UUID
    content: str
    content_format: Literal["plain_text"]
    version: int
    word_count: int
    checksum: str
    created_at: datetime
    updated_at: datetime


class DocumentContentUpdateRequest(BaseModel):
    content: str
    content_format: Literal["plain_text"]
    version: int = Field(ge=1)


class ProjectSummary(BaseModel):
    id: UUID
    book_number: UUID
    title: str
    author: str
    description: str
    cover_url: str | None
    chapter_count: int
    word_count: int
    structure_mode: ProjectStructureMode
    status: ProjectStatus
    update_status: ProjectUpdateStatus
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


class ProjectDeleteData(BaseModel):
    id: UUID
    deleted: Literal[True]


class ProjectCoverData(BaseModel):
    url: str | None


class ProjectListResponse(APIResponse[ProjectListData]):
    pass


class ProjectCreateResponse(APIResponse[ProjectDetailData]):
    pass


class ProjectDetailResponse(APIResponse[ProjectDetailData]):
    pass


class ProjectMutationResponse(APIResponse[ProjectDetailData]):
    pass


class ProjectDeleteResponse(APIResponse[ProjectDeleteData]):
    pass


class ProjectCoverResponse(APIResponse[ProjectCoverData]):
    pass


class DocumentListResponse(APIResponse[DocumentListData]):
    pass


class DocumentMutationResponse(APIResponse[DocumentSummary]):
    pass


class DocumentDeleteResponse(APIResponse[DocumentDeleteData]):
    pass


class DocumentContentResponse(APIResponse[DocumentContentData]):
    pass
