"""全文检索、导入预览和交稿配置。"""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class SearchHit(BaseModel):
    id: UUID
    kind: Literal["document", "character", "world"]
    title: str
    excerpt: str
    document_version: int | None = None
    match_start: int | None = None


class ImportChapter(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(max_length=1000000)

    @field_validator("title")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("title must not be blank")
        return value.strip()


class ImportPreview(BaseModel):
    title: str
    encoding: str
    chapters: list[ImportChapter]
    duplicate_titles: list[str]


class ImportCommit(BaseModel):
    request_id: UUID
    project_id: UUID | None = None
    title: str = Field(min_length=1, max_length=100)
    chapters: list[ImportChapter] = Field(min_length=1, max_length=1000)
    duplicate_policy: Literal["keep", "skip"] = "keep"

    @field_validator("title")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("title must not be blank")
        return value.strip()


class ImportResult(BaseModel):
    project_id: UUID
    imported: int
    skipped: int


class ExportSelection(BaseModel):
    document_ids: list[UUID] = Field(default_factory=list, max_length=1000)
    format: Literal["markdown", "plain_text"] = "markdown"
    include_titles: bool = True
    separator: str = Field(default="\n\n", max_length=100)


class ExportWarning(BaseModel):
    document_id: UUID | None = None
    kind: str
    title: str


class ExportDocument(BaseModel):
    document_id: UUID
    title: str
    version: int
    word_count: int


class ExportPreview(BaseModel):
    documents: list[ExportDocument]
    warnings: list[ExportWarning]
    filename: str
    content: str


class ImpactHit(BaseModel):
    document_id: UUID
    title: str
    evidence: str
    explicit_reference: bool
