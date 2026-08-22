"""Web 登录会话与 Refresh Token 历史。"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid7

from sqlalchemy import CheckConstraint, Column, DateTime, Index, LargeBinary, Text
from sqlmodel import Field

from app.models.base import TimestampMixin


class UserSession(TimestampMixin, table=True):
    """一个浏览器或设备对应的独立登录会话。"""

    __tablename__ = "user_sessions"
    __table_args__ = (
        Index("ix_user_sessions_user_active", "user_id", "revoked_at", "expires_at"),
        {"comment": "Web 用户的独立登录会话"},
    )

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "登录会话唯一标识"})
    user_id: UUID = Field(
        foreign_key="users.id",
        ondelete="CASCADE",
        nullable=False,
        sa_column_kwargs={"comment": "会话所属用户标识"},
    )
    expires_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, comment="会话绝对过期时间（UTC）")
    )
    last_used_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, comment="会话最后使用时间（UTC）")
    )
    revoked_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, comment="会话撤销时间（UTC），未撤销时为空"),
    )
    revoke_reason: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True, comment="不含敏感信息的会话撤销原因"),
    )
    created_ip: str = Field(sa_column=Column(Text, nullable=False, comment="创建会话时的规范化客户端 IP"))
    last_ip: str = Field(sa_column=Column(Text, nullable=False, comment="会话最近使用时的规范化客户端 IP"))
    user_agent: str = Field(sa_column=Column(Text, nullable=False, comment="创建会话时截断保存的 User-Agent"))


class UserSessionToken(TimestampMixin, table=True):
    """只保存哈希的 Refresh Token 轮换历史。"""

    __tablename__ = "user_session_tokens"
    __table_args__ = (
        CheckConstraint("length(token_hash) = 32", name="ck_user_session_tokens_hash_length"),
        Index("uq_user_session_tokens_hash", "token_hash", unique=True),
        Index("ix_user_session_tokens_session_expiry", "session_id", "expires_at"),
        {"comment": "Refresh Token 的哈希与轮换历史"},
    )

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "会话令牌记录唯一标识"})
    session_id: UUID = Field(
        foreign_key="user_sessions.id",
        ondelete="CASCADE",
        nullable=False,
        sa_column_kwargs={"comment": "令牌所属登录会话标识"},
    )
    token_hash: bytes = Field(
        sa_column=Column(LargeBinary(32), nullable=False, comment="Refresh Token 的 HMAC-SHA-256 摘要")
    )
    expires_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, comment="Refresh Token 过期时间（UTC）")
    )
    used_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, comment="令牌完成轮换的使用时间（UTC）"),
    )
    revoked_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, comment="令牌撤销时间（UTC），未撤销时为空"),
    )
    replaced_by_id: UUID | None = Field(
        default=None,
        foreign_key="user_session_tokens.id",
        ondelete="SET NULL",
        nullable=True,
        sa_column_kwargs={"comment": "轮换后替代本令牌的新令牌记录标识"},
    )
