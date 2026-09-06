"""可恢复的作者主动批量任务；不保存完整上下文。"""

from uuid import UUID, uuid7

from sqlalchemy import CheckConstraint, Index, Text, UniqueConstraint
from sqlmodel import Field

from app.models.base import TimestampMixin


class AIBatch(TimestampMixin, table=True):
    __tablename__ = "ai_batches"
    __table_args__ = (
        UniqueConstraint("owner_id", "request_id", name="uq_ai_batches_owner_request"),
        CheckConstraint("status IN ('queued','running','paused','completed','cancelled')", name="ck_ai_batches_status"),
        Index("ix_ai_batches_owner_status", "owner_id", "status"),
        {"comment": "作者主动发起的逐章批量摘要或一致性检查"},
    )
    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "批次唯一标识"})
    owner_id: UUID = Field(foreign_key="users.id", ondelete="CASCADE", sa_column_kwargs={"comment": "发起作者标识"})
    project_id: UUID = Field(
        foreign_key="projects.id", ondelete="CASCADE", sa_column_kwargs={"comment": "所属作品标识"}
    )
    request_id: UUID = Field(sa_column_kwargs={"comment": "客户端幂等请求标识"})
    request_hash: str = Field(sa_column_kwargs={"comment": "任务参数摘要，防止幂等键被复用为其他请求"})
    provider_config_id: UUID = Field(sa_column_kwargs={"comment": "作者选择的 Provider 配置标识快照"})
    model_id: UUID | None = Field(default=None, sa_column_kwargs={"comment": "作者选择的模型标识快照"})
    task_type: str = Field(default="summary", sa_column_kwargs={"comment": "summary 或 consistency"})
    instruction: str = Field(default="", sa_type=Text, sa_column_kwargs={"comment": "作者为本批次提交的任务要求"})
    use_recall: bool = Field(default=False, sa_column_kwargs={"comment": "作者明确选择所选范围内的前两章原文作为参考"})
    status: str = Field(default="queued", sa_column_kwargs={"comment": "批次调度状态，重启后暂停"})


class AIBatchItem(TimestampMixin, table=True):
    __tablename__ = "ai_batch_items"
    __table_args__ = (
        UniqueConstraint("batch_id", "document_id", name="uq_ai_batch_items_document"),
        Index("ix_ai_batch_items_batch_position", "batch_id", "position"),
        {"comment": "批量任务逐章进度与生成时来源版本"},
    )
    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "批次章节项唯一标识"})
    batch_id: UUID = Field(
        foreign_key="ai_batches.id", ondelete="CASCADE", sa_column_kwargs={"comment": "所属批次标识"}
    )
    document_id: UUID = Field(sa_column_kwargs={"comment": "来源章节标识快照"})
    document_version: int = Field(sa_column_kwargs={"comment": "提交批次时的正文版本"})
    source_order: str = Field(sa_column_kwargs={"comment": "来源章节之前的叙述顺序摘要"})
    position: int = Field(sa_column_kwargs={"comment": "作者选择的执行顺序"})
    status: str = Field(
        default="queued", sa_column_kwargs={"comment": "queued、running、succeeded、failed、cancelled 或 stale"}
    )
    task_id: UUID | None = Field(default=None, sa_column_kwargs={"comment": "最近一次关联 AI 任务标识快照"})
    error_code: str | None = Field(default=None, sa_column_kwargs={"comment": "脱敏失败原因码"})
    result_id: UUID | None = Field(default=None, sa_column_kwargs={"comment": "生成的摘要或分析结果标识"})
