"""AI 历史列表只返回必要摘要，完整候选按需读取。"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class TaskHistoryItem(BaseModel):
    id: UUID
    project_id: UUID | None
    document_id: UUID | None
    task_type: str
    provider: str
    model: str
    status: str
    input_tokens: int | None
    output_tokens: int | None
    created_at: datetime
    error_code: str | None


class ResultHistoryItem(BaseModel):
    id: UUID
    task_id: UUID
    project_id: UUID
    document_id: UUID | None
    task_type: str
    status: str
    purpose: str
    pinned: bool
    excerpt: str
    created_at: datetime


class PinRequest(BaseModel):
    pinned: bool
