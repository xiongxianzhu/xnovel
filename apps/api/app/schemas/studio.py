"""长篇工作台的类型化表单和来源状态。"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class SourceInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=20000)
    source_document_id: UUID | None = None
    source_version: int | None = Field(default=None, ge=1)
    version: int = Field(default=1, ge=1)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("title must not be blank")
        return value.strip()


class SourceData(BaseModel):
    id: UUID
    project_id: UUID
    created_at: datetime
    updated_at: datetime
    source_stale: bool = False
    source_missing: bool = False
    source_title: str | None = None


class SummaryInput(SourceInput):
    source_document_id: UUID
    body: str = Field(min_length=1, max_length=20000)
    status: Literal["candidate", "confirmed", "rejected"] = "confirmed"

    @field_validator("body")
    @classmethod
    def meaningful_summary(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("summary must not be blank")
        return value


class SummaryData(SummaryInput, SourceData):
    ai_task_id: UUID | None = None


class FactInput(SourceInput):
    kind: Literal["fact", "plan", "inference"] = "fact"
    character_id: UUID | None = None
    story_order: int | None = Field(default=None, ge=0)


class FactData(FactInput, SourceData):
    pass


class ThreadInput(SourceInput):
    status: Literal["open", "progressing", "resolved", "abandoned"] = "open"
    target_document_id: UUID | None = None


class ThreadData(ThreadInput, SourceData):
    overdue: bool = False


class EventInput(SourceInput):
    story_order: int | None = Field(default=None, ge=0)
    time_label: str = Field(default="", max_length=200)
    location: str = Field(default="", max_length=200)
    participants: str = Field(default="", max_length=2000)


class EventData(EventInput, SourceData):
    pass


class KnowledgeInput(SourceInput):
    character_id: UUID
    story_order: int | None = Field(default=None, ge=0)
    audience: Literal["character", "reader", "author"] = "character"


class KnowledgeData(KnowledgeInput, SourceData):
    pass


class IssueInput(SourceInput):
    status: Literal["open", "resolved", "ignored"] = "open"
    other_document_id: UUID | None = None
    other_version: int | None = Field(default=None, ge=1)
    evidence: str = Field(default="", max_length=1000)
    other_evidence: str = Field(default="", max_length=1000)
    resolution: str = Field(default="", max_length=2000)


class IssueData(IssueInput, SourceData):
    pass


class PlanInput(SourceInput):
    position: int = Field(default=0, ge=0)
    pov: str = Field(default="", max_length=200)
    conflict: str = Field(default="", max_length=2000)
    turning_point: str = Field(default="", max_length=2000)
    hook: str = Field(default="", max_length=2000)
    arc: str = Field(default="", max_length=200)
    delivery_status: Literal["draft", "revising", "ready", "published"] = "draft"


class PlanData(PlanInput, SourceData):
    pass


class NoteInput(SourceInput):
    status: Literal["open", "resolved", "ignored"] = "open"
    quote: str = Field(default="", max_length=1000)


class NoteData(NoteInput, SourceData):
    pass


class RuleInput(SourceInput):
    kind: Literal["term", "pov", "tense", "expression"] = "term"
    preferred: str = Field(default="", max_length=2000)


class RuleData(RuleInput, SourceData):
    pass


class StudioPage[ItemT](BaseModel):
    items: list[ItemT]
    total: int
    page: int
    page_size: int
    pages: int


class RecallData(BaseModel):
    summaries: list[SummaryData]
    facts: list[FactData]
    threads: list[ThreadData]
    stale_count: int
    boundary_document_id: UUID


class DeletedData(BaseModel):
    deleted: Literal[True] = True


class ScheduleInput(BaseModel):
    chapters_per_week: int = Field(ge=1, le=100)
    note: str = Field(default="", max_length=2000)


class ScheduleData(BaseModel):
    chapters_per_week: int | None
    note: str
    ready_chapters: int
    estimated_days: int | None


class ThreadUpdateData(BaseModel):
    id: UUID
    thread_id: UUID
    status: str
    note: str
    document_id: UUID | None
    created_at: datetime
