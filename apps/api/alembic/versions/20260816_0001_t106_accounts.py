"""建立 T-106 账户、站点设置、审计和限流表。

Revision ID: 20260816_0001
Revises:
Create Date: 2026-08-16
"""

from collections.abc import Sequence
from datetime import datetime

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260816_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamp_columns() -> tuple[sa.Column[datetime], sa.Column[datetime]]:
    return (
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("username", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("phone_e164", sa.Text(), nullable=True),
        sa.Column("phone_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("nickname", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), server_default=sa.text("'user'"), nullable=False),
        sa.Column("avatar_source", sa.Text(), server_default=sa.text("'none'"), nullable=False),
        sa.Column("avatar_storage_key", sa.Text(), nullable=True),
        sa.Column("avatar_mime_type", sa.Text(), nullable=True),
        sa.Column("avatar_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("avatar_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("birthday", sa.Date(), nullable=True),
        sa.Column("status", sa.Text(), server_default=sa.text("'active'"), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamp_columns(),
        sa.CheckConstraint("length(username) BETWEEN 3 AND 32", name="ck_users_username_length"),
        sa.CheckConstraint("length(nickname) BETWEEN 1 AND 100", name="ck_users_nickname_length"),
        sa.CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),
        sa.CheckConstraint("status IN ('active', 'disabled')", name="ck_users_status"),
        sa.CheckConstraint("avatar_source IN ('none', 'upload', 'url')", name="ck_users_avatar_source"),
        sa.CheckConstraint(
            "(avatar_source = 'none' AND avatar_storage_key IS NULL AND avatar_mime_type IS NULL "
            "AND avatar_size_bytes IS NULL AND avatar_url IS NULL AND avatar_updated_at IS NULL) OR "
            "(avatar_source = 'upload' AND avatar_storage_key IS NOT NULL AND avatar_mime_type IS NOT NULL "
            "AND avatar_size_bytes IS NOT NULL AND avatar_url IS NULL AND avatar_updated_at IS NOT NULL) OR "
            "(avatar_source = 'url' AND avatar_storage_key IS NULL AND avatar_mime_type IS NULL "
            "AND avatar_size_bytes IS NULL AND avatar_url IS NOT NULL AND avatar_updated_at IS NOT NULL)",
            name="ck_users_avatar_fields",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
    )
    op.create_index("uq_users_username", "users", ["username"], unique=True)
    op.create_index("uq_users_email", "users", ["email"], unique=True)
    op.create_index(
        "uq_users_phone_e164",
        "users",
        ["phone_e164"],
        unique=True,
        postgresql_where=sa.text("phone_e164 IS NOT NULL"),
        sqlite_where=sa.text("phone_e164 IS NOT NULL"),
    )

    op.create_table(
        "user_preferences",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("locale", sa.Text(), server_default=sa.text("'zh-CN'"), nullable=False),
        sa.Column(
            "theme_palette",
            sa.Text(),
            server_default=sa.text("'manuscript-brown'"),
            nullable=False,
        ),
        sa.Column("theme_mode", sa.Text(), server_default=sa.text("'system'"), nullable=False),
        *_timestamp_columns(),
        sa.CheckConstraint("locale IN ('zh-CN', 'zh-TW', 'en-US')", name="ck_user_preferences_locale"),
        sa.CheckConstraint(
            "theme_palette IN ('manuscript-brown', 'pine-green', 'harbor-blue', 'grape-purple', 'graphite')",
            name="ck_user_preferences_theme_palette",
        ),
        sa.CheckConstraint("theme_mode IN ('system', 'light', 'dark')", name="ck_user_preferences_theme_mode"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_user_preferences_user_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", name="pk_user_preferences"),
    )

    op.create_table(
        "site_settings",
        sa.Column("id", sa.SmallInteger(), server_default=sa.text("1"), nullable=False),
        sa.Column("registration_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("logo_storage_key", sa.Text(), nullable=True),
        sa.Column("logo_mime_type", sa.Text(), nullable=True),
        sa.Column("logo_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        *_timestamp_columns(),
        sa.CheckConstraint("id = 1", name="ck_site_settings_singleton"),
        sa.CheckConstraint(
            "(logo_storage_key IS NULL AND logo_mime_type IS NULL AND logo_size_bytes IS NULL) OR "
            "(logo_storage_key IS NOT NULL AND logo_mime_type IS NOT NULL AND logo_size_bytes IS NOT NULL)",
            name="ck_site_settings_logo_fields",
        ),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], name="fk_site_settings_updated_by", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_site_settings"),
    )
    op.create_index("ix_site_settings_updated_by", "site_settings", ["updated_by"], unique=False)

    op.create_table(
        "admin_audit_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("actor_type", sa.Text(), nullable=False),
        sa.Column("admin_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("target_type", sa.Text(), nullable=False),
        sa.Column("target_id", sa.Text(), nullable=True),
        sa.Column(
            "change_summary",
            sa.JSON().with_variant(postgresql.JSONB(), "postgresql"),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        *_timestamp_columns(),
        sa.CheckConstraint("actor_type IN ('admin', 'system')", name="ck_admin_audit_events_actor_type"),
        sa.CheckConstraint(
            "(actor_type = 'admin' AND admin_id IS NOT NULL) OR "
            "(actor_type = 'system' AND admin_id IS NULL)",
            name="ck_admin_audit_events_actor",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_admin_audit_events"),
    )
    op.create_index(
        "ix_admin_audit_events_admin_created",
        "admin_audit_events",
        ["admin_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_admin_audit_events_target_created",
        "admin_audit_events",
        ["target_type", "target_id", "created_at"],
        unique=False,
    )

    op.create_table(
        "auth_rate_limit_buckets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("scope", sa.Text(), nullable=False),
        sa.Column("key_hash", sa.LargeBinary(length=32), nullable=False),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("window_seconds", sa.Integer(), server_default=sa.text("600"), nullable=False),
        sa.Column("attempt_count", sa.Integer(), server_default=sa.text("1"), nullable=False),
        *_timestamp_columns(),
        sa.CheckConstraint(
            "scope IN ('registration_source', 'registration_source_identity')",
            name="ck_auth_rate_limit_buckets_scope",
        ),
        sa.CheckConstraint("window_seconds > 0", name="ck_auth_rate_limit_buckets_window_seconds"),
        sa.CheckConstraint("attempt_count > 0", name="ck_auth_rate_limit_buckets_attempt_count"),
        sa.PrimaryKeyConstraint("id", name="pk_auth_rate_limit_buckets"),
        sa.UniqueConstraint(
            "scope",
            "key_hash",
            "window_started_at",
            name="uq_auth_rate_limit_buckets_window",
        ),
    )
    op.create_index(
        "ix_auth_rate_limit_buckets_expiry",
        "auth_rate_limit_buckets",
        ["window_started_at", "window_seconds"],
        unique=False,
    )

    site_settings = sa.table(
        "site_settings",
        sa.column("id", sa.SmallInteger()),
        sa.column("registration_enabled", sa.Boolean()),
    )
    op.bulk_insert(site_settings, [{"id": 1, "registration_enabled": False}])


def downgrade() -> None:
    op.drop_index("ix_auth_rate_limit_buckets_expiry", table_name="auth_rate_limit_buckets")
    op.drop_table("auth_rate_limit_buckets")
    op.drop_index("ix_admin_audit_events_target_created", table_name="admin_audit_events")
    op.drop_index("ix_admin_audit_events_admin_created", table_name="admin_audit_events")
    op.drop_table("admin_audit_events")
    op.drop_index("ix_site_settings_updated_by", table_name="site_settings")
    op.drop_table("site_settings")
    op.drop_table("user_preferences")
    op.drop_index("uq_users_phone_e164", table_name="users")
    op.drop_index("uq_users_email", table_name="users")
    op.drop_index("uq_users_username", table_name="users")
    op.drop_table("users")
