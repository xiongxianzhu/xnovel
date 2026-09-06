"""正文版本列表、命名检查点与显式恢复请求。"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class RevisionSummary(BaseModel):
    id: UUID
    document_id: UUID
    version: int
    word_count: int
    checkpoint_name: str | None
    created_at: datetime
    updated_at: datetime


class RevisionDetail(RevisionSummary):
    content: str
    content_format: str


class RevisionPage(BaseModel):
    items: list[RevisionSummary]
    page: int
    page_size: int
    total: int
    pages: int


class CheckpointRequest(BaseModel):
    version: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("checkpoint name must not be blank")
        return value.strip()


class RestoreRevisionRequest(BaseModel):
    version: int = Field(ge=1)
