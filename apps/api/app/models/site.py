"""站点设置、管理员审计与认证限流表。"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid7

from sqlalchemy import (
    JSON,
    BigInteger,
    CheckConstraint,
    Column,
    DateTime,
    Index,
    Integer,
    LargeBinary,
    SmallInteger,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from app.models.base import ImmutableTimestampMixin, TimestampMixin

JSON_DATA = JSON().with_variant(JSONB(), "postgresql")


class SiteSetting(TimestampMixin, table=True):
    """固定主键的全局站点设置。"""

    __tablename__ = "site_settings"
    __table_args__ = (
        CheckConstraint("id = 1", name="ck_site_settings_singleton"),
        CheckConstraint(
            "(logo_storage_key IS NULL AND logo_original_name IS NULL AND logo_mime_type IS NULL "
            "AND logo_size_bytes IS NULL) OR "
            "(logo_storage_key IS NOT NULL AND logo_original_name IS NOT NULL AND logo_mime_type IS NOT NULL "
            "AND logo_size_bytes IS NOT NULL)",
            name="ck_site_settings_logo_fields",
        ),
        Index("ix_site_settings_updated_by", "updated_by"),
        {"comment": "Web 站点全局设置单例"},
    )

    id: int = Field(
        default=1,
        sa_column=Column(
            SmallInteger,
            primary_key=True,
            nullable=False,
            server_default=text("1"),
            comment="固定为 1 的站点设置单例主键",
        ),
    )
    registration_enabled: bool = Field(
        default=False,
        nullable=False,
        sa_column_kwargs={"server_default": text("false"), "comment": "是否允许访客公开注册"},
    )
    logo_storage_key: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True, comment="Web 全局 Logo 的存储对象键"),
    )
    logo_original_name: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True, comment="Web 全局 Logo 清理后的原始文件名"),
    )
    logo_mime_type: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True, comment="Web 全局 Logo 解码后的真实 MIME 类型"),
    )
    logo_size_bytes: int | None = Field(
        default=None,
        sa_column=Column(BigInteger, nullable=True, comment="Web 全局 Logo 的文件大小（字节）"),
    )
    updated_by: UUID | None = Field(
        default=None,
        foreign_key="users.id",
        ondelete="SET NULL",
        sa_column_kwargs={"comment": "最近修改设置的管理员用户标识"},
    )


class AdminAuditEvent(ImmutableTimestampMixin, table=True):
    """只追加的管理员敏感操作审计。"""

    __tablename__ = "admin_audit_events"
    __table_args__ = (
        CheckConstraint("actor_type IN ('admin', 'system')", name="ck_admin_audit_events_actor_type"),
        CheckConstraint(
            "(actor_type = 'admin' AND admin_id IS NOT NULL) OR (actor_type = 'system' AND admin_id IS NULL)",
            name="ck_admin_audit_events_actor",
        ),
        Index("ix_admin_audit_events_admin_created", "admin_id", "created_at"),
        Index("ix_admin_audit_events_target_created", "target_type", "target_id", "created_at"),
        {"comment": "管理员敏感操作的不可变追加审计事件"},
    )

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "审计事件唯一标识"})
    actor_type: str = Field(sa_column=Column(Text, nullable=False, comment="操作主体类型：admin 或 system"))
    admin_id: UUID | None = Field(
        default=None,
        nullable=True,
        sa_column_kwargs={"comment": "管理员用户标识；系统事件为空"},
    )
    action: str = Field(sa_column=Column(Text, nullable=False, comment="稳定的审计动作标识"))
    target_type: str = Field(sa_column=Column(Text, nullable=False, comment="操作目标类型"))
    target_id: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True, comment="操作目标的稳定标识"),
    )
    change_summary: dict[str, object] = Field(
        default_factory=dict,
        sa_column=Column(
            JSON_DATA,
            nullable=False,
            server_default=text("'{}'"),
            comment="不含密钥和完整私密数据的最小变更摘要",
        ),
    )


class AuthRateLimitBucket(TimestampMixin, table=True):
    """认证入口固定窗口限流桶。"""

    __tablename__ = "auth_rate_limit_buckets"
    __table_args__ = (
        CheckConstraint(
            "scope IN ('registration_source', 'registration_source_identity', 'login_source', 'login_source_identity')",
            name="ck_auth_rate_limit_buckets_scope",
        ),
        CheckConstraint("window_seconds > 0", name="ck_auth_rate_limit_buckets_window_seconds"),
        CheckConstraint("attempt_count > 0", name="ck_auth_rate_limit_buckets_attempt_count"),
        UniqueConstraint(
            "scope",
            "key_hash",
            "window_started_at",
            name="uq_auth_rate_limit_buckets_window",
        ),
        Index("ix_auth_rate_limit_buckets_expiry", "window_started_at", "window_seconds"),
        {"comment": "认证入口的持久化固定窗口限流桶"},
    )

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "限流桶唯一标识"})
    scope: str = Field(sa_column=Column(Text, nullable=False, comment="限流范围：来源或来源与注册标识组合"))
    key_hash: bytes = Field(
        sa_column=Column(LargeBinary(32), nullable=False, comment="限流键的 HMAC-SHA-256 摘要，不保存原始标识")
    )
    window_started_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, comment="固定窗口起始时间（UTC）")
    )
    window_seconds: int = Field(
        default=600,
        sa_column=Column(Integer, nullable=False, server_default=text("600"), comment="固定窗口长度（秒）"),
    )
    attempt_count: int = Field(
        default=1,
        sa_column=Column(Integer, nullable=False, server_default=text("1"), comment="当前窗口累计尝试次数"),
    )
