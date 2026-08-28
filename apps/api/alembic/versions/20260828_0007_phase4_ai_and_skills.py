"""建立 Phase 4 AI Provider、任务、候选与私有 Skill 表。

Revision ID: 20260828_0007
Revises: 20260828_0006
Create Date: 2026-08-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260828_0007"
down_revision: str | None = "20260828_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
JSON_VALUE = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")

TABLE_COMMENTS = {
    "skills": "用户私有 Skill 当前状态与版本指针",
    "skill_versions": "用户私有 Skill 的不可变校验版本",
    "ai_credentials": "Web 用户 Provider API Key 的 AES-GCM 密文",
    "ai_provider_configs": "用户 Provider 连接、协议、凭据与默认模型",
    "ai_provider_models": "Provider 配置下的模型与能力边界",
    "ai_tasks": "AI 请求状态、最小上下文清单与实际用量",
    "ai_results": "AI 候选内容及作者显式决策",
}
_TIME = {"created_at": "创建时间（UTC）", "updated_at": "最后更新时间（UTC）"}
COLUMN_COMMENTS = {
    "skills": {
        "id": "Skill 唯一标识",
        "owner_id": "Skill 所属用户标识",
        "name": "当前 Skill 展示名称",
        "name_normalized": "NFKC 与大小写规范化名称",
        "description": "当前版本 frontmatter 描述",
        "current_version_id": "当前有效 Skill 版本标识",
        "enabled": "是否允许新 AI 任务选择",
        "status": "Skill 状态：ready、quarantined 或 deleting",
        "deleted_at": "Skill 删除流程开始时间（UTC）",
        **_TIME,
    },
    "skill_versions": {
        "id": "Skill 版本唯一标识",
        "skill_id": "所属 Skill 标识",
        "version_number": "Skill 内递增版本号",
        "skill_md_text": "当前版本 SKILL.md 文本",
        "source_kind": "版本来源：upload 或 editor",
        "source_archive_storage_key": "原始上传归档存储键",
        "normalized_package_storage_key": "确定性规范化 Skill 包存储键",
        "content_storage_key": "校验后不可变内容目录存储键",
        "content_sha256": "规范清单内容 SHA-256",
        "source_compressed_size": "原始上传包大小（字节）",
        "normalized_package_size": "规范化包大小（字节）",
        "uncompressed_size": "解压累计大小（字节）",
        "file_count": "版本文件数量",
        "validation_summary": "不含完整内容的校验摘要",
        **_TIME,
    },
    "ai_credentials": {
        "id": "AI 凭据唯一标识",
        "owner_id": "凭据所属用户标识",
        "ciphertext": "AES-GCM 密文及认证标签",
        "nonce": "96 位随机 nonce",
        "algorithm": "加密算法标识",
        "master_key_version": "解密主密钥版本",
        "key_hint": "供用户确认的脱敏密钥尾号",
        **_TIME,
    },
    "ai_provider_configs": {
        "id": "Provider 配置唯一标识",
        "owner_id": "Provider 配置所属用户标识",
        "source": "配置来源：builtin 或 custom",
        "provider_id": "用户范围内唯一 Provider ID",
        "display_name": "Provider 显示名称",
        "protocol": "Provider 固定协议",
        "base_url": "规范化 Base URL 覆盖",
        "credential_id": "同所有者加密凭据标识",
        "default_model_id": "同配置默认模型标识",
        "enabled": "是否允许用于新任务",
        **_TIME,
    },
    "ai_provider_models": {
        "id": "Provider 模型唯一标识",
        "provider_config_id": "所属 Provider 配置标识",
        "model_id": "发送给 Provider 的模型标识",
        "display_name": "模型选择器显示名称",
        "context_window": "用户确认的上下文窗口",
        "max_output_tokens": "模型最大输出 Token",
        "supports_streaming": "是否支持流式文本",
        "enabled": "是否允许用于新任务",
        **_TIME,
    },
    "ai_tasks": {
        "id": "AI 任务唯一标识",
        "owner_id": "任务所属用户标识",
        "project_id": "正式任务所属作品标识",
        "document_id": "可选上下文文档标识",
        "provider_config_id": "任务使用的 Provider 配置标识",
        "task_type": "AI 任务类型",
        "provider": "实际 Provider ID 快照",
        "model": "实际模型 ID 快照",
        "instruction": "用户明确提交的任务指令",
        "context_manifest": "不含完整正文的上下文标量摘要",
        "status": "任务调度状态",
        "error_code": "稳定 AI 错误标识",
        "error_message": "脱敏错误说明",
        "input_tokens": "Provider 实际输入 Token",
        "output_tokens": "Provider 实际输出 Token",
        "cache_read_tokens": "Provider 实际缓存读取 Token",
        "reasoning_tokens": "Provider 实际推理 Token",
        "cancel_requested_at": "用户请求取消时间（UTC）",
        "started_at": "任务开始时间（UTC）",
        "finished_at": "任务终止时间（UTC）",
        **_TIME,
    },
    "ai_results": {
        "id": "AI 候选唯一标识",
        "project_id": "候选所属作品标识",
        "task_id": "生成候选的 AI 任务标识",
        "sequence": "任务内候选顺序",
        "content": "模型生成的候选内容",
        "status": "候选决策状态",
        "applied_document_id": "候选应用到的正文文档标识",
        "decided_at": "作者决策时间（UTC）",
        **_TIME,
    },
}


def _timestamps() -> tuple[sa.Column, sa.Column]:
    return (
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), comment="创建时间（UTC）"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), comment="最后更新时间（UTC）"),
    )


def upgrade() -> None:
    op.create_table(
        "skills",
        sa.Column("id", sa.Uuid(), nullable=False, comment="Skill 唯一标识"),
        sa.Column("owner_id", sa.Uuid(), nullable=False, comment="Skill 所属用户标识"),
        sa.Column("name", sa.Text(), nullable=False, comment="当前 Skill 展示名称"),
        sa.Column("name_normalized", sa.Text(), nullable=False, comment="NFKC 与大小写规范化名称"),
        sa.Column("description", sa.Text(), nullable=False, server_default=sa.text("''"), comment="当前版本 frontmatter 描述"),
        sa.Column("current_version_id", sa.Uuid(), nullable=True, comment="当前有效 Skill 版本标识"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("false"), comment="是否允许新 AI 任务选择"),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'ready'"), comment="Skill 状态：ready、quarantined 或 deleting"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True, comment="Skill 删除流程开始时间（UTC）"),
        *_timestamps(),
        sa.CheckConstraint("length(name) BETWEEN 1 AND 100", name="ck_skills_name_length"),
        sa.CheckConstraint("status IN ('ready', 'quarantined', 'deleting')", name="ck_skills_status"),
        sa.CheckConstraint("enabled = false OR status = 'ready'", name="ck_skills_enabled_status"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "current_version_id", name="uq_skills_id_current_version_id"),
        comment=TABLE_COMMENTS["skills"],
    )
    op.create_index("ix_skills_owner_id", "skills", ["owner_id"])
    op.create_index(
        "uq_skills_owner_name_active",
        "skills",
        ["owner_id", "name_normalized"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
        sqlite_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "skill_versions",
        sa.Column("id", sa.Uuid(), nullable=False, comment="Skill 版本唯一标识"),
        sa.Column("skill_id", sa.Uuid(), nullable=False, comment="所属 Skill 标识"),
        sa.Column("version_number", sa.Integer(), nullable=False, comment="Skill 内递增版本号"),
        sa.Column("skill_md_text", sa.Text(), nullable=False, comment="当前版本 SKILL.md 文本"),
        sa.Column("source_kind", sa.Text(), nullable=False, comment="版本来源：upload 或 editor"),
        sa.Column("source_archive_storage_key", sa.Text(), nullable=True, comment="原始上传归档存储键"),
        sa.Column("normalized_package_storage_key", sa.Text(), nullable=False, comment="确定性规范化 Skill 包存储键"),
        sa.Column("content_storage_key", sa.Text(), nullable=False, comment="校验后不可变内容目录存储键"),
        sa.Column("content_sha256", sa.Text(), nullable=False, comment="规范清单内容 SHA-256"),
        sa.Column("source_compressed_size", sa.BigInteger(), nullable=True, comment="原始上传包大小（字节）"),
        sa.Column("normalized_package_size", sa.BigInteger(), nullable=False, comment="规范化包大小（字节）"),
        sa.Column("uncompressed_size", sa.BigInteger(), nullable=False, comment="解压累计大小（字节）"),
        sa.Column("file_count", sa.Integer(), nullable=False, comment="版本文件数量"),
        sa.Column("validation_summary", JSON_VALUE, nullable=False, server_default=sa.text("'{}'"), comment="不含完整内容的校验摘要"),
        *_timestamps(),
        sa.CheckConstraint("version_number > 0", name="ck_skill_versions_number"),
        sa.CheckConstraint("source_kind IN ('upload', 'editor')", name="ck_skill_versions_source_kind"),
        sa.CheckConstraint("file_count BETWEEN 1 AND 500", name="ck_skill_versions_file_count"),
        sa.CheckConstraint("uncompressed_size BETWEEN 0 AND 52428800", name="ck_skill_versions_uncompressed_size"),
        sa.CheckConstraint("normalized_package_size >= 0", name="ck_skill_versions_package_size"),
        sa.CheckConstraint("length(content_sha256) = 64", name="ck_skill_versions_sha256"),
        sa.CheckConstraint(
            "(source_kind = 'upload' AND source_archive_storage_key IS NOT NULL "
            "AND source_compressed_size IS NOT NULL) OR "
            "(source_kind = 'editor' AND source_archive_storage_key IS NULL "
            "AND source_compressed_size IS NULL)",
            name="ck_skill_versions_source_fields",
        ),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("skill_id", "version_number", name="uq_skill_versions_number"),
        sa.UniqueConstraint("skill_id", "id", name="uq_skill_versions_skill_id_id"),
        comment=TABLE_COMMENTS["skill_versions"],
    )
    op.create_index("ix_skill_versions_skill_id", "skill_versions", ["skill_id"])

    op.create_table(
        "ai_credentials",
        sa.Column("id", sa.Uuid(), nullable=False, comment="AI 凭据唯一标识"),
        sa.Column("owner_id", sa.Uuid(), nullable=False, comment="凭据所属用户标识"),
        sa.Column("ciphertext", sa.LargeBinary(), nullable=False, comment="AES-GCM 密文及认证标签"),
        sa.Column("nonce", sa.LargeBinary(), nullable=False, comment="96 位随机 nonce"),
        sa.Column("algorithm", sa.Text(), nullable=False, server_default=sa.text("'AES-256-GCM'"), comment="加密算法标识"),
        sa.Column("master_key_version", sa.Text(), nullable=False, comment="解密主密钥版本"),
        sa.Column("key_hint", sa.Text(), nullable=False, comment="供用户确认的脱敏密钥尾号"),
        *_timestamps(),
        sa.CheckConstraint("algorithm = 'AES-256-GCM'", name="ck_ai_credentials_algorithm"),
        sa.CheckConstraint("length(nonce) = 12", name="ck_ai_credentials_nonce"),
        sa.CheckConstraint("length(master_key_version) > 0", name="ck_ai_credentials_key_version"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_id", "id", name="uq_ai_credentials_owner_id_id"),
        comment=TABLE_COMMENTS["ai_credentials"],
    )
    op.create_index("ix_ai_credentials_owner_updated", "ai_credentials", ["owner_id", "updated_at", "id"])

    op.create_table(
        "ai_provider_configs",
        sa.Column("id", sa.Uuid(), nullable=False, comment="Provider 配置唯一标识"),
        sa.Column("owner_id", sa.Uuid(), nullable=False, comment="Provider 配置所属用户标识"),
        sa.Column("source", sa.Text(), nullable=False, comment="配置来源：builtin 或 custom"),
        sa.Column("provider_id", sa.Text(), nullable=False, comment="用户范围内唯一 Provider ID"),
        sa.Column("display_name", sa.Text(), nullable=False, comment="Provider 显示名称"),
        sa.Column("protocol", sa.Text(), nullable=False, comment="Provider 固定协议"),
        sa.Column("base_url", sa.Text(), nullable=True, comment="规范化 Base URL 覆盖"),
        sa.Column("credential_id", sa.Uuid(), nullable=True, comment="同所有者加密凭据标识"),
        sa.Column("default_model_id", sa.Uuid(), nullable=False, comment="同配置默认模型标识"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true"), comment="是否允许用于新任务"),
        *_timestamps(),
        sa.CheckConstraint("source IN ('builtin', 'custom')", name="ck_ai_provider_configs_source"),
        sa.CheckConstraint("protocol IN ('openai_chat', 'openai_responses', 'anthropic', 'google')", name="ck_ai_provider_configs_protocol"),
        sa.CheckConstraint("length(provider_id) BETWEEN 2 AND 63", name="ck_ai_provider_configs_provider_id"),
        sa.CheckConstraint("source <> 'custom' OR base_url IS NOT NULL", name="ck_ai_provider_configs_custom_url"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["owner_id", "credential_id"],
            ["ai_credentials.owner_id", "ai_credentials.id"],
            name="fk_ai_provider_configs_credential",
            ondelete="NO ACTION",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_id", "provider_id", name="uq_ai_provider_configs_owner_provider"),
        sa.UniqueConstraint("owner_id", "id", name="uq_ai_provider_configs_owner_id_id"),
        comment=TABLE_COMMENTS["ai_provider_configs"],
    )
    op.create_index("ix_ai_provider_configs_owner_enabled", "ai_provider_configs", ["owner_id", "enabled"])
    op.create_index("ix_ai_provider_configs_credential_id", "ai_provider_configs", ["credential_id"])
    op.create_index("ix_ai_provider_configs_default_model_id", "ai_provider_configs", ["default_model_id"])
    op.create_index(
        "uq_ai_provider_configs_owner_credential",
        "ai_provider_configs",
        ["owner_id", "credential_id"],
        unique=True,
        postgresql_where=sa.text("credential_id IS NOT NULL"),
        sqlite_where=sa.text("credential_id IS NOT NULL"),
    )

    op.create_table(
        "ai_provider_models",
        sa.Column("id", sa.Uuid(), nullable=False, comment="Provider 模型唯一标识"),
        sa.Column("provider_config_id", sa.Uuid(), nullable=False, comment="所属 Provider 配置标识"),
        sa.Column("model_id", sa.Text(), nullable=False, comment="发送给 Provider 的模型标识"),
        sa.Column("display_name", sa.Text(), nullable=False, comment="模型选择器显示名称"),
        sa.Column("context_window", sa.Integer(), nullable=False, comment="用户确认的上下文窗口"),
        sa.Column("max_output_tokens", sa.Integer(), nullable=False, comment="模型最大输出 Token"),
        sa.Column("supports_streaming", sa.Boolean(), nullable=False, server_default=sa.text("true"), comment="是否支持流式文本"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true"), comment="是否允许用于新任务"),
        *_timestamps(),
        sa.CheckConstraint("length(model_id) > 0", name="ck_ai_provider_models_model_id"),
        sa.CheckConstraint("length(display_name) > 0", name="ck_ai_provider_models_display_name"),
        sa.CheckConstraint("context_window > 0", name="ck_ai_provider_models_context_window"),
        sa.CheckConstraint("max_output_tokens > 0 AND max_output_tokens <= context_window", name="ck_ai_provider_models_output_tokens"),
        sa.ForeignKeyConstraint(["provider_config_id"], ["ai_provider_configs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider_config_id", "model_id", name="uq_ai_provider_models_model_id"),
        sa.UniqueConstraint("provider_config_id", "id", name="uq_ai_provider_models_config_id_id"),
        comment=TABLE_COMMENTS["ai_provider_models"],
    )
    op.create_index("ix_ai_provider_models_config_enabled", "ai_provider_models", ["provider_config_id", "enabled"])

    if op.get_bind().dialect.name == "postgresql":
        op.create_foreign_key(
            "fk_skills_current_version",
            "skills",
            "skill_versions",
            ["id", "current_version_id"],
            ["skill_id", "id"],
            deferrable=True,
            initially="DEFERRED",
        )
        op.create_foreign_key(
            "fk_ai_provider_configs_default_model",
            "ai_provider_configs",
            "ai_provider_models",
            ["id", "default_model_id"],
            ["provider_config_id", "id"],
            ondelete="NO ACTION",
            deferrable=True,
            initially="DEFERRED",
        )

    op.create_table(
        "ai_tasks",
        sa.Column("id", sa.Uuid(), nullable=False, comment="AI 任务唯一标识"),
        sa.Column("owner_id", sa.Uuid(), nullable=False, comment="任务所属用户标识"),
        sa.Column("project_id", sa.Uuid(), nullable=True, comment="正式任务所属作品标识"),
        sa.Column("document_id", sa.Uuid(), nullable=True, comment="可选上下文文档标识"),
        sa.Column("provider_config_id", sa.Uuid(), nullable=True, comment="任务使用的 Provider 配置标识"),
        sa.Column("task_type", sa.Text(), nullable=False, comment="AI 任务类型"),
        sa.Column("provider", sa.Text(), nullable=False, comment="实际 Provider ID 快照"),
        sa.Column("model", sa.Text(), nullable=False, comment="实际模型 ID 快照"),
        sa.Column("instruction", sa.Text(), nullable=False, comment="用户明确提交的任务指令"),
        sa.Column("context_manifest", JSON_VALUE, nullable=False, server_default=sa.text("'{}'"), comment="不含完整正文的上下文标量摘要"),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'queued'"), comment="任务调度状态"),
        sa.Column("error_code", sa.Text(), nullable=True, comment="稳定 AI 错误标识"),
        sa.Column("error_message", sa.Text(), nullable=True, comment="脱敏错误说明"),
        sa.Column("input_tokens", sa.Integer(), nullable=True, comment="Provider 实际输入 Token"),
        sa.Column("output_tokens", sa.Integer(), nullable=True, comment="Provider 实际输出 Token"),
        sa.Column("cache_read_tokens", sa.Integer(), nullable=True, comment="Provider 实际缓存读取 Token"),
        sa.Column("reasoning_tokens", sa.Integer(), nullable=True, comment="Provider 实际推理 Token"),
        sa.Column("cancel_requested_at", sa.DateTime(timezone=True), nullable=True, comment="用户请求取消时间（UTC）"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True, comment="任务开始时间（UTC）"),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True, comment="任务终止时间（UTC）"),
        *_timestamps(),
        sa.CheckConstraint("status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')", name="ck_ai_tasks_status"),
        sa.CheckConstraint("input_tokens IS NULL OR input_tokens >= 0", name="ck_ai_tasks_input_tokens"),
        sa.CheckConstraint("output_tokens IS NULL OR output_tokens >= 0", name="ck_ai_tasks_output_tokens"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"]),
        sa.ForeignKeyConstraint(["provider_config_id"], ["ai_provider_configs.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["owner_id", "project_id"], ["projects.owner_id", "projects.id"], name="fk_ai_tasks_owner_project", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["project_id", "document_id"], ["documents.project_id", "documents.id"], name="fk_ai_tasks_project_document", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["owner_id", "provider_config_id"], ["ai_provider_configs.owner_id", "ai_provider_configs.id"], name="fk_ai_tasks_owner_provider", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "id", name="uq_ai_tasks_project_id_id"),
        comment=TABLE_COMMENTS["ai_tasks"],
    )
    op.create_index("ix_ai_tasks_owner_created", "ai_tasks", ["owner_id", "created_at", "id"])
    op.create_index("ix_ai_tasks_project_status_created", "ai_tasks", ["project_id", "status", "created_at", "id"])
    op.create_index("ix_ai_tasks_status_created", "ai_tasks", ["status", "created_at"])
    op.create_index("ix_ai_tasks_document_id", "ai_tasks", ["document_id"])
    op.create_index("ix_ai_tasks_provider_config_id", "ai_tasks", ["provider_config_id"])

    op.create_table(
        "ai_results",
        sa.Column("id", sa.Uuid(), nullable=False, comment="AI 候选唯一标识"),
        sa.Column("project_id", sa.Uuid(), nullable=False, comment="候选所属作品标识"),
        sa.Column("task_id", sa.Uuid(), nullable=False, comment="生成候选的 AI 任务标识"),
        sa.Column("sequence", sa.Integer(), nullable=False, server_default=sa.text("0"), comment="任务内候选顺序"),
        sa.Column("content", sa.Text(), nullable=False, comment="模型生成的候选内容"),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'candidate'"), comment="候选决策状态"),
        sa.Column("applied_document_id", sa.Uuid(), nullable=True, comment="候选应用到的正文文档标识"),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True, comment="作者决策时间（UTC）"),
        *_timestamps(),
        sa.CheckConstraint("sequence >= 0", name="ck_ai_results_sequence"),
        sa.CheckConstraint("status IN ('candidate', 'applied', 'rejected')", name="ck_ai_results_status"),
        sa.CheckConstraint(
            "(status = 'candidate' AND applied_document_id IS NULL AND decided_at IS NULL) OR "
            "(status = 'applied' AND applied_document_id IS NOT NULL AND decided_at IS NOT NULL) OR "
            "(status = 'rejected' AND applied_document_id IS NULL AND decided_at IS NOT NULL)",
            name="ck_ai_results_state_fields",
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["ai_tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["applied_document_id"], ["documents.id"]),
        sa.ForeignKeyConstraint(["project_id", "task_id"], ["ai_tasks.project_id", "ai_tasks.id"], name="fk_ai_results_project_task", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id", "applied_document_id"], ["documents.project_id", "documents.id"], name="fk_ai_results_project_document", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id", "sequence", name="uq_ai_results_task_sequence"),
        comment=TABLE_COMMENTS["ai_results"],
    )
    op.create_index("ix_ai_results_task_status", "ai_results", ["task_id", "status"])
    op.create_index("ix_ai_results_project_created", "ai_results", ["project_id", "created_at", "id"])
    op.create_index("ix_ai_results_applied_document_id", "ai_results", ["applied_document_id"])


def downgrade() -> None:
    op.drop_index("ix_ai_results_applied_document_id", table_name="ai_results")
    op.drop_index("ix_ai_results_project_created", table_name="ai_results")
    op.drop_index("ix_ai_results_task_status", table_name="ai_results")
    op.drop_table("ai_results")
    op.drop_index("ix_ai_tasks_provider_config_id", table_name="ai_tasks")
    op.drop_index("ix_ai_tasks_document_id", table_name="ai_tasks")
    op.drop_index("ix_ai_tasks_status_created", table_name="ai_tasks")
    op.drop_index("ix_ai_tasks_project_status_created", table_name="ai_tasks")
    op.drop_index("ix_ai_tasks_owner_created", table_name="ai_tasks")
    op.drop_table("ai_tasks")
    if op.get_bind().dialect.name == "postgresql":
        op.drop_constraint("fk_ai_provider_configs_default_model", "ai_provider_configs", type_="foreignkey")
        op.drop_constraint("fk_skills_current_version", "skills", type_="foreignkey")
    op.drop_index("ix_ai_provider_models_config_enabled", table_name="ai_provider_models")
    op.drop_table("ai_provider_models")
    op.drop_index("uq_ai_provider_configs_owner_credential", table_name="ai_provider_configs")
    op.drop_index("ix_ai_provider_configs_default_model_id", table_name="ai_provider_configs")
    op.drop_index("ix_ai_provider_configs_credential_id", table_name="ai_provider_configs")
    op.drop_index("ix_ai_provider_configs_owner_enabled", table_name="ai_provider_configs")
    op.drop_table("ai_provider_configs")
    op.drop_index("ix_ai_credentials_owner_updated", table_name="ai_credentials")
    op.drop_table("ai_credentials")
    op.drop_index("ix_skill_versions_skill_id", table_name="skill_versions")
    op.drop_table("skill_versions")
    op.drop_index("uq_skills_owner_name_active", table_name="skills")
    op.drop_index("ix_skills_owner_id", table_name="skills")
    op.drop_table("skills")
