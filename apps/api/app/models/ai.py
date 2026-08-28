"""Web AI Provider、任务、候选和私有 Skill 模型。"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid7

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    LargeBinary,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from app.models.base import ImmutableTimestampMixin, TimestampMixin

JSON_VALUE = JSON().with_variant(JSONB(), "postgresql")


class Skill(TimestampMixin, table=True):
    """用户私有 Skill 当前投影。"""

    __tablename__ = "skills"
    __table_args__ = (
        CheckConstraint("length(name) BETWEEN 1 AND 100", name="ck_skills_name_length"),
        CheckConstraint("status IN ('ready', 'quarantined', 'deleting')", name="ck_skills_status"),
        CheckConstraint("enabled = false OR status = 'ready'", name="ck_skills_enabled_status"),
        ForeignKeyConstraint(
            ["id", "current_version_id"],
            ["skill_versions.skill_id", "skill_versions.id"],
            name="fk_skills_current_version",
            deferrable=True,
            initially="DEFERRED",
        ),
        UniqueConstraint("id", "current_version_id", name="uq_skills_id_current_version_id"),
        Index("ix_skills_owner_id", "owner_id"),
        Index(
            "uq_skills_owner_name_active",
            "owner_id",
            "name_normalized",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
            sqlite_where=text("deleted_at IS NULL"),
        ),
        {"comment": "用户私有 Skill 当前状态与版本指针"},
    )

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "Skill 唯一标识"})
    owner_id: UUID = Field(
        foreign_key="users.id",
        nullable=False,
        ondelete="CASCADE",
        sa_column_kwargs={"comment": "Skill 所属用户标识"},
    )
    name: str = Field(sa_column=Column(Text, nullable=False, comment="当前 Skill 展示名称"))
    name_normalized: str = Field(sa_column=Column(Text, nullable=False, comment="NFKC 与大小写规范化名称"))
    description: str = Field(
        default="",
        sa_column=Column(Text, nullable=False, server_default=text("''"), comment="当前版本 frontmatter 描述"),
    )
    current_version_id: UUID | None = Field(default=None, sa_column_kwargs={"comment": "当前有效 Skill 版本标识"})
    enabled: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default=text("false"), comment="是否允许新 AI 任务选择"),
    )
    status: str = Field(
        default="ready",
        sa_column=Column(
            Text,
            nullable=False,
            server_default=text("'ready'"),
            comment="Skill 状态：ready、quarantined 或 deleting",
        ),
    )
    deleted_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, comment="Skill 删除流程开始时间（UTC）"),
    )


class SkillVersion(ImmutableTimestampMixin, table=True):
    """不可变 Skill 版本。"""

    __tablename__ = "skill_versions"
    __table_args__ = (
        CheckConstraint("version_number > 0", name="ck_skill_versions_number"),
        CheckConstraint("source_kind IN ('upload', 'editor')", name="ck_skill_versions_source_kind"),
        CheckConstraint("file_count BETWEEN 1 AND 500", name="ck_skill_versions_file_count"),
        CheckConstraint("uncompressed_size BETWEEN 0 AND 52428800", name="ck_skill_versions_uncompressed_size"),
        CheckConstraint("normalized_package_size >= 0", name="ck_skill_versions_package_size"),
        CheckConstraint("length(content_sha256) = 64", name="ck_skill_versions_sha256"),
        CheckConstraint(
            "(source_kind = 'upload' AND source_archive_storage_key IS NOT NULL "
            "AND source_compressed_size IS NOT NULL) OR "
            "(source_kind = 'editor' AND source_archive_storage_key IS NULL "
            "AND source_compressed_size IS NULL)",
            name="ck_skill_versions_source_fields",
        ),
        UniqueConstraint("skill_id", "version_number", name="uq_skill_versions_number"),
        UniqueConstraint("skill_id", "id", name="uq_skill_versions_skill_id_id"),
        Index("ix_skill_versions_skill_id", "skill_id"),
        {"comment": "用户私有 Skill 的不可变校验版本"},
    )

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "Skill 版本唯一标识"})
    skill_id: UUID = Field(
        foreign_key="skills.id",
        nullable=False,
        ondelete="CASCADE",
        sa_column_kwargs={"comment": "所属 Skill 标识"},
    )
    version_number: int = Field(sa_column=Column(Integer, nullable=False, comment="Skill 内递增版本号"))
    skill_md_text: str = Field(sa_column=Column(Text, nullable=False, comment="当前版本 SKILL.md 文本"))
    source_kind: str = Field(sa_column=Column(Text, nullable=False, comment="版本来源：upload 或 editor"))
    source_archive_storage_key: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True, comment="原始上传归档存储键"),
    )
    normalized_package_storage_key: str = Field(
        sa_column=Column(Text, nullable=False, comment="确定性规范化 Skill 包存储键")
    )
    content_storage_key: str = Field(sa_column=Column(Text, nullable=False, comment="校验后不可变内容目录存储键"))
    content_sha256: str = Field(sa_column=Column(Text, nullable=False, comment="规范清单内容 SHA-256"))
    source_compressed_size: int | None = Field(
        default=None,
        sa_column=Column(BigInteger, nullable=True, comment="原始上传包大小（字节）"),
    )
    normalized_package_size: int = Field(sa_column=Column(BigInteger, nullable=False, comment="规范化包大小（字节）"))
    uncompressed_size: int = Field(sa_column=Column(BigInteger, nullable=False, comment="解压累计大小（字节）"))
    file_count: int = Field(sa_column=Column(Integer, nullable=False, comment="版本文件数量"))
    validation_summary: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON_VALUE, nullable=False, server_default=text("'{}'"), comment="不含完整内容的校验摘要"),
    )


class AICredential(TimestampMixin, table=True):
    """用户 Provider API Key 密文。"""

    __tablename__ = "ai_credentials"
    __table_args__ = (
        CheckConstraint("algorithm = 'AES-256-GCM'", name="ck_ai_credentials_algorithm"),
        CheckConstraint("length(nonce) = 12", name="ck_ai_credentials_nonce"),
        CheckConstraint("length(master_key_version) > 0", name="ck_ai_credentials_key_version"),
        UniqueConstraint("owner_id", "id", name="uq_ai_credentials_owner_id_id"),
        Index("ix_ai_credentials_owner_updated", "owner_id", "updated_at", "id"),
        {"comment": "Web 用户 Provider API Key 的 AES-GCM 密文"},
    )

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "AI 凭据唯一标识"})
    owner_id: UUID = Field(
        foreign_key="users.id",
        nullable=False,
        ondelete="CASCADE",
        sa_column_kwargs={"comment": "凭据所属用户标识"},
    )
    ciphertext: bytes = Field(sa_column=Column(LargeBinary, nullable=False, comment="AES-GCM 密文及认证标签"))
    nonce: bytes = Field(sa_column=Column(LargeBinary, nullable=False, comment="96 位随机 nonce"))
    algorithm: str = Field(
        default="AES-256-GCM",
        sa_column=Column(Text, nullable=False, server_default=text("'AES-256-GCM'"), comment="加密算法标识"),
    )
    master_key_version: str = Field(sa_column=Column(Text, nullable=False, comment="解密主密钥版本"))
    key_hint: str = Field(sa_column=Column(Text, nullable=False, comment="供用户确认的脱敏密钥尾号"))


class AIProviderConfig(TimestampMixin, table=True):
    """用户 Provider 连接配置。"""

    __tablename__ = "ai_provider_configs"
    __table_args__ = (
        CheckConstraint("source IN ('builtin', 'custom')", name="ck_ai_provider_configs_source"),
        CheckConstraint(
            "protocol IN ('openai_chat', 'openai_responses', 'anthropic', 'google')",
            name="ck_ai_provider_configs_protocol",
        ),
        CheckConstraint("length(provider_id) BETWEEN 2 AND 63", name="ck_ai_provider_configs_provider_id"),
        CheckConstraint("source <> 'custom' OR base_url IS NOT NULL", name="ck_ai_provider_configs_custom_url"),
        UniqueConstraint("owner_id", "provider_id", name="uq_ai_provider_configs_owner_provider"),
        UniqueConstraint("owner_id", "id", name="uq_ai_provider_configs_owner_id_id"),
        ForeignKeyConstraint(
            ["owner_id", "credential_id"],
            ["ai_credentials.owner_id", "ai_credentials.id"],
            name="fk_ai_provider_configs_credential",
            ondelete="NO ACTION",
            deferrable=True,
            initially="DEFERRED",
        ),
        ForeignKeyConstraint(
            ["id", "default_model_id"],
            ["ai_provider_models.provider_config_id", "ai_provider_models.id"],
            name="fk_ai_provider_configs_default_model",
            ondelete="NO ACTION",
            deferrable=True,
            initially="DEFERRED",
        ),
        Index("ix_ai_provider_configs_owner_enabled", "owner_id", "enabled"),
        Index(
            "uq_ai_provider_configs_owner_credential",
            "owner_id",
            "credential_id",
            unique=True,
            postgresql_where=text("credential_id IS NOT NULL"),
            sqlite_where=text("credential_id IS NOT NULL"),
        ),
        Index("ix_ai_provider_configs_credential_id", "credential_id"),
        Index("ix_ai_provider_configs_default_model_id", "default_model_id"),
        {"comment": "用户 Provider 连接、协议、凭据与默认模型"},
    )

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "Provider 配置唯一标识"})
    owner_id: UUID = Field(
        foreign_key="users.id",
        nullable=False,
        ondelete="CASCADE",
        sa_column_kwargs={"comment": "Provider 配置所属用户标识"},
    )
    source: str = Field(sa_column=Column(Text, nullable=False, comment="配置来源：builtin 或 custom"))
    provider_id: str = Field(sa_column=Column(Text, nullable=False, comment="用户范围内唯一 Provider ID"))
    display_name: str = Field(sa_column=Column(Text, nullable=False, comment="Provider 显示名称"))
    protocol: str = Field(sa_column=Column(Text, nullable=False, comment="Provider 固定协议"))
    base_url: str | None = Field(default=None, sa_column=Column(Text, nullable=True, comment="规范化 Base URL 覆盖"))
    credential_id: UUID | None = Field(default=None, sa_column_kwargs={"comment": "同所有者加密凭据标识"})
    default_model_id: UUID = Field(sa_column_kwargs={"comment": "同配置默认模型标识"})
    enabled: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False, server_default=text("true"), comment="是否允许用于新任务"),
    )


class AIProviderModel(TimestampMixin, table=True):
    """Provider 下手工登记的模型。"""

    __tablename__ = "ai_provider_models"
    __table_args__ = (
        CheckConstraint("length(model_id) > 0", name="ck_ai_provider_models_model_id"),
        CheckConstraint("length(display_name) > 0", name="ck_ai_provider_models_display_name"),
        CheckConstraint("context_window > 0", name="ck_ai_provider_models_context_window"),
        CheckConstraint(
            "max_output_tokens > 0 AND max_output_tokens <= context_window",
            name="ck_ai_provider_models_output_tokens",
        ),
        UniqueConstraint("provider_config_id", "model_id", name="uq_ai_provider_models_model_id"),
        UniqueConstraint("provider_config_id", "id", name="uq_ai_provider_models_config_id_id"),
        Index("ix_ai_provider_models_config_enabled", "provider_config_id", "enabled"),
        {"comment": "Provider 配置下的模型与能力边界"},
    )

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "Provider 模型唯一标识"})
    provider_config_id: UUID = Field(
        foreign_key="ai_provider_configs.id",
        nullable=False,
        ondelete="CASCADE",
        sa_column_kwargs={"comment": "所属 Provider 配置标识"},
    )
    model_id: str = Field(sa_column=Column(Text, nullable=False, comment="发送给 Provider 的模型标识"))
    display_name: str = Field(sa_column=Column(Text, nullable=False, comment="模型选择器显示名称"))
    context_window: int = Field(sa_column=Column(Integer, nullable=False, comment="用户确认的上下文窗口"))
    max_output_tokens: int = Field(sa_column=Column(Integer, nullable=False, comment="模型最大输出 Token"))
    supports_streaming: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False, server_default=text("true"), comment="是否支持流式文本"),
    )
    enabled: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False, server_default=text("true"), comment="是否允许用于新任务"),
    )


class AITask(TimestampMixin, table=True):
    """AI 调度、上下文摘要、状态与实际用量。"""

    __tablename__ = "ai_tasks"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')",
            name="ck_ai_tasks_status",
        ),
        CheckConstraint(
            "input_tokens IS NULL OR input_tokens >= 0",
            name="ck_ai_tasks_input_tokens",
        ),
        CheckConstraint(
            "output_tokens IS NULL OR output_tokens >= 0",
            name="ck_ai_tasks_output_tokens",
        ),
        ForeignKeyConstraint(
            ["owner_id", "project_id"],
            ["projects.owner_id", "projects.id"],
            name="fk_ai_tasks_owner_project",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["project_id", "document_id"],
            ["documents.project_id", "documents.id"],
            name="fk_ai_tasks_project_document",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["owner_id", "provider_config_id"],
            ["ai_provider_configs.owner_id", "ai_provider_configs.id"],
            name="fk_ai_tasks_owner_provider",
            ondelete="RESTRICT",
        ),
        UniqueConstraint("project_id", "id", name="uq_ai_tasks_project_id_id"),
        Index("ix_ai_tasks_owner_created", "owner_id", "created_at", "id"),
        Index("ix_ai_tasks_project_status_created", "project_id", "status", "created_at", "id"),
        Index("ix_ai_tasks_status_created", "status", "created_at"),
        Index("ix_ai_tasks_document_id", "document_id"),
        Index("ix_ai_tasks_provider_config_id", "provider_config_id"),
        {"comment": "AI 请求状态、最小上下文清单与实际用量"},
    )

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "AI 任务唯一标识"})
    owner_id: UUID = Field(
        foreign_key="users.id",
        nullable=False,
        ondelete="RESTRICT",
        sa_column_kwargs={"comment": "任务所属用户标识"},
    )
    project_id: UUID | None = Field(
        default=None, foreign_key="projects.id", sa_column_kwargs={"comment": "正式任务所属作品标识"}
    )
    document_id: UUID | None = Field(
        default=None, foreign_key="documents.id", sa_column_kwargs={"comment": "可选上下文文档标识"}
    )
    provider_config_id: UUID | None = Field(
        default=None,
        foreign_key="ai_provider_configs.id",
        ondelete="RESTRICT",
        sa_column_kwargs={"comment": "任务使用的 Provider 配置标识"},
    )
    task_type: str = Field(sa_column=Column(Text, nullable=False, comment="AI 任务类型"))
    provider: str = Field(sa_column=Column(Text, nullable=False, comment="实际 Provider ID 快照"))
    model: str = Field(sa_column=Column(Text, nullable=False, comment="实际模型 ID 快照"))
    instruction: str = Field(sa_column=Column(Text, nullable=False, comment="用户明确提交的任务指令"))
    context_manifest: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(
            JSON_VALUE, nullable=False, server_default=text("'{}'"), comment="不含完整正文的上下文标量摘要"
        ),
    )
    status: str = Field(
        default="queued",
        sa_column=Column(Text, nullable=False, server_default=text("'queued'"), comment="任务调度状态"),
    )
    error_code: str | None = Field(default=None, sa_column=Column(Text, nullable=True, comment="稳定 AI 错误标识"))
    error_message: str | None = Field(default=None, sa_column=Column(Text, nullable=True, comment="脱敏错误说明"))
    input_tokens: int | None = Field(
        default=None, sa_column=Column(Integer, nullable=True, comment="Provider 实际输入 Token")
    )
    output_tokens: int | None = Field(
        default=None, sa_column=Column(Integer, nullable=True, comment="Provider 实际输出 Token")
    )
    cache_read_tokens: int | None = Field(
        default=None, sa_column=Column(Integer, nullable=True, comment="Provider 实际缓存读取 Token")
    )
    reasoning_tokens: int | None = Field(
        default=None, sa_column=Column(Integer, nullable=True, comment="Provider 实际推理 Token")
    )
    cancel_requested_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, comment="用户请求取消时间（UTC）"),
    )
    started_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True, comment="任务开始时间（UTC）")
    )
    finished_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True, comment="任务终止时间（UTC）")
    )


class AIResult(TimestampMixin, table=True):
    """与作者正文分离的 AI 候选。"""

    __tablename__ = "ai_results"
    __table_args__ = (
        CheckConstraint("sequence >= 0", name="ck_ai_results_sequence"),
        CheckConstraint("status IN ('candidate', 'applied', 'rejected')", name="ck_ai_results_status"),
        CheckConstraint(
            "(status = 'candidate' AND applied_document_id IS NULL AND decided_at IS NULL) OR "
            "(status = 'applied' AND applied_document_id IS NOT NULL AND decided_at IS NOT NULL) OR "
            "(status = 'rejected' AND applied_document_id IS NULL AND decided_at IS NOT NULL)",
            name="ck_ai_results_state_fields",
        ),
        UniqueConstraint("task_id", "sequence", name="uq_ai_results_task_sequence"),
        ForeignKeyConstraint(
            ["project_id", "task_id"],
            ["ai_tasks.project_id", "ai_tasks.id"],
            name="fk_ai_results_project_task",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["project_id", "applied_document_id"],
            ["documents.project_id", "documents.id"],
            name="fk_ai_results_project_document",
            ondelete="RESTRICT",
        ),
        Index("ix_ai_results_task_status", "task_id", "status"),
        Index("ix_ai_results_project_created", "project_id", "created_at", "id"),
        Index("ix_ai_results_applied_document_id", "applied_document_id"),
        {"comment": "AI 候选内容及作者显式决策"},
    )

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "AI 候选唯一标识"})
    project_id: UUID = Field(
        foreign_key="projects.id",
        nullable=False,
        ondelete="CASCADE",
        sa_column_kwargs={"comment": "候选所属作品标识"},
    )
    task_id: UUID = Field(
        foreign_key="ai_tasks.id",
        nullable=False,
        ondelete="CASCADE",
        sa_column_kwargs={"comment": "生成候选的 AI 任务标识"},
    )
    sequence: int = Field(
        default=0,
        sa_column=Column(Integer, nullable=False, server_default=text("0"), comment="任务内候选顺序"),
    )
    content: str = Field(sa_column=Column(Text, nullable=False, comment="模型生成的候选内容"))
    status: str = Field(
        default="candidate",
        sa_column=Column(Text, nullable=False, server_default=text("'candidate'"), comment="候选决策状态"),
    )
    applied_document_id: UUID | None = Field(
        default=None,
        foreign_key="documents.id",
        sa_column_kwargs={"comment": "候选应用到的正文文档标识"},
    )
    decided_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True, comment="作者决策时间（UTC）")
    )
