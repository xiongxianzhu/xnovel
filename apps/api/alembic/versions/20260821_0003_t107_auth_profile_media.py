"""建立 T-107 登录会话、令牌历史与 Logo 元数据。

Revision ID: 20260821_0003
Revises: 20260816_0002
Create Date: 2026-08-21
"""

from collections.abc import Sequence
from datetime import datetime

import sqlalchemy as sa
from alembic import op

revision: str = "20260821_0003"
down_revision: str | None = "20260816_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLE_COMMENTS: dict[str, str] = {
    "user_sessions": "Web 用户的独立登录会话",
    "user_session_tokens": "Refresh Token 的哈希与轮换历史",
}

_TIMESTAMP_COMMENTS = {
    "created_at": "创建时间（UTC）",
    "updated_at": "最后更新时间（UTC）",
}

COLUMN_COMMENTS: dict[str, dict[str, str]] = {
    "user_sessions": {
        "id": "登录会话唯一标识",
        "user_id": "会话所属用户标识",
        "expires_at": "会话绝对过期时间（UTC）",
        "last_used_at": "会话最后使用时间（UTC）",
        "revoked_at": "会话撤销时间（UTC），未撤销时为空",
        "revoke_reason": "不含敏感信息的会话撤销原因",
        "created_ip": "创建会话时的规范化客户端 IP",
        "last_ip": "会话最近使用时的规范化客户端 IP",
        "user_agent": "创建会话时截断保存的 User-Agent",
        **_TIMESTAMP_COMMENTS,
    },
    "user_session_tokens": {
        "id": "会话令牌记录唯一标识",
        "session_id": "令牌所属登录会话标识",
        "token_hash": "Refresh Token 的 HMAC-SHA-256 摘要",
        "expires_at": "Refresh Token 过期时间（UTC）",
        "used_at": "令牌完成轮换的使用时间（UTC）",
        "revoked_at": "令牌撤销时间（UTC），未撤销时为空",
        "replaced_by_id": "轮换后替代本令牌的新令牌记录标识",
        **_TIMESTAMP_COMMENTS,
    },
}


def _timestamp_columns() -> tuple[sa.Column[datetime], sa.Column[datetime]]:
    return (
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            comment="创建时间（UTC）",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            comment="最后更新时间（UTC）",
        ),
    )


def upgrade() -> None:
    with op.batch_alter_table("site_settings") as batch_op:
        batch_op.drop_constraint("ck_site_settings_logo_fields", type_="check")
        batch_op.add_column(
            sa.Column("logo_original_name", sa.Text(), nullable=True, comment="Web 全局 Logo 清理后的原始文件名")
        )
        batch_op.create_check_constraint(
            "ck_site_settings_logo_fields",
            "(logo_storage_key IS NULL AND logo_original_name IS NULL AND logo_mime_type IS NULL "
            "AND logo_size_bytes IS NULL) OR "
            "(logo_storage_key IS NOT NULL AND logo_original_name IS NOT NULL AND logo_mime_type IS NOT NULL "
            "AND logo_size_bytes IS NOT NULL)",
        )

    with op.batch_alter_table("auth_rate_limit_buckets") as batch_op:
        batch_op.drop_constraint("ck_auth_rate_limit_buckets_scope", type_="check")
        batch_op.create_check_constraint(
            "ck_auth_rate_limit_buckets_scope",
            "scope IN ('registration_source', 'registration_source_identity', "
            "'login_source', 'login_source_identity')",
        )

    op.create_table(
        "user_sessions",
        sa.Column("id", sa.Uuid(), nullable=False, comment="登录会话唯一标识"),
        sa.Column("user_id", sa.Uuid(), nullable=False, comment="会话所属用户标识"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False, comment="会话绝对过期时间（UTC）"),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False, comment="会话最后使用时间（UTC）"),
        sa.Column(
            "revoked_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="会话撤销时间（UTC），未撤销时为空",
        ),
        sa.Column("revoke_reason", sa.Text(), nullable=True, comment="不含敏感信息的会话撤销原因"),
        sa.Column("created_ip", sa.Text(), nullable=False, comment="创建会话时的规范化客户端 IP"),
        sa.Column("last_ip", sa.Text(), nullable=False, comment="会话最近使用时的规范化客户端 IP"),
        sa.Column("user_agent", sa.Text(), nullable=False, comment="创建会话时截断保存的 User-Agent"),
        *_timestamp_columns(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_user_sessions_user_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_user_sessions"),
        comment=TABLE_COMMENTS["user_sessions"],
    )
    op.create_index(
        "ix_user_sessions_user_active",
        "user_sessions",
        ["user_id", "revoked_at", "expires_at"],
        unique=False,
    )

    op.create_table(
        "user_session_tokens",
        sa.Column("id", sa.Uuid(), nullable=False, comment="会话令牌记录唯一标识"),
        sa.Column("session_id", sa.Uuid(), nullable=False, comment="令牌所属登录会话标识"),
        sa.Column("token_hash", sa.LargeBinary(length=32), nullable=False, comment="Refresh Token 的 HMAC-SHA-256 摘要"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False, comment="Refresh Token 过期时间（UTC）"),
        sa.Column(
            "used_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="令牌完成轮换的使用时间（UTC）",
        ),
        sa.Column(
            "revoked_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="令牌撤销时间（UTC），未撤销时为空",
        ),
        sa.Column(
            "replaced_by_id",
            sa.Uuid(),
            nullable=True,
            comment="轮换后替代本令牌的新令牌记录标识",
        ),
        *_timestamp_columns(),
        sa.CheckConstraint("length(token_hash) = 32", name="ck_user_session_tokens_hash_length"),
        sa.ForeignKeyConstraint(
            ["replaced_by_id"],
            ["user_session_tokens.id"],
            name="fk_user_session_tokens_replaced_by_id",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["user_sessions.id"],
            name="fk_user_session_tokens_session_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_user_session_tokens"),
        comment=TABLE_COMMENTS["user_session_tokens"],
    )
    op.create_index(
        "ix_user_session_tokens_session_expiry",
        "user_session_tokens",
        ["session_id", "expires_at"],
        unique=False,
    )
    op.create_index(
        "uq_user_session_tokens_hash",
        "user_session_tokens",
        ["token_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_user_session_tokens_hash", table_name="user_session_tokens")
    op.drop_index("ix_user_session_tokens_session_expiry", table_name="user_session_tokens")
    op.drop_table("user_session_tokens")
    op.drop_index("ix_user_sessions_user_active", table_name="user_sessions")
    op.drop_table("user_sessions")

    with op.batch_alter_table("auth_rate_limit_buckets") as batch_op:
        batch_op.drop_constraint("ck_auth_rate_limit_buckets_scope", type_="check")
        batch_op.create_check_constraint(
            "ck_auth_rate_limit_buckets_scope",
            "scope IN ('registration_source', 'registration_source_identity')",
        )

    with op.batch_alter_table("site_settings") as batch_op:
        batch_op.drop_constraint("ck_site_settings_logo_fields", type_="check")
        batch_op.drop_column("logo_original_name")
        batch_op.create_check_constraint(
            "ck_site_settings_logo_fields",
            "(logo_storage_key IS NULL AND logo_mime_type IS NULL AND logo_size_bytes IS NULL) OR "
            "(logo_storage_key IS NOT NULL AND logo_mime_type IS NOT NULL AND logo_size_bytes IS NOT NULL)",
        )
