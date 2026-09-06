"""可控批量任务与逐章结果。"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class BatchRequest(BaseModel):
    request_id: UUID
    project_id: UUID
    document_ids: list[UUID] = Field(min_length=1, max_length=1000)
    provider_config_id: UUID
    model_id: UUID | None = None
    task_type: Literal["summary", "consistency"] = "summary"
    instruction: str = Field(default="", max_length=2000)
    use_recall: bool = False

    @field_validator("document_ids")
    @classmethod
    def unique_documents(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("document ids must be unique")
        return value


class BatchItemData(BaseModel):
    id: UUID
    document_id: UUID
    document_version: int
    position: int
    status: str
    task_id: UUID | None
    error_code: str | None
    result_id: UUID | None


class BatchData(BaseModel):
    id: UUID
    project_id: UUID
    task_type: str
    status: str
    use_recall: bool
    created_at: datetime
    items: list[BatchItemData]


class BatchAction(BaseModel):
    action: Literal["cancel", "resume", "retry_failed"]


class BatchSummary(BaseModel):
    id: UUID
    project_id: UUID
    task_type: str
    status: str
    use_recall: bool
    created_at: datetime
    total: int
    counts: dict[str, int]


class BatchPreview(BaseModel):
    document_count: int
    estimated_input_tokens: int
    estimated_cost: None = None
    segmented_documents: int
    source_titles: list[str]


class AnalysisIssue(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    explanation: str = Field(min_length=1, max_length=4000)
    evidence: str = Field(min_length=1, max_length=1000)
    other_document_id: UUID
    other_evidence: str = Field(min_length=1, max_length=1000)


class AnalysisResult(BaseModel):
    issues: list[AnalysisIssue] = Field(default_factory=list, max_length=20)
