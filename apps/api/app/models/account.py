"""Web 本地账户与默认偏好表。"""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID, uuid7

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Column, Date, DateTime, Index, Text, text
from sqlmodel import Field

from app.models.base import TimestampMixin


class User(TimestampMixin, table=True):
    """Web 本地账户。"""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("length(username) BETWEEN 3 AND 32", name="ck_users_username_length"),
        CheckConstraint("length(nickname) BETWEEN 1 AND 100", name="ck_users_nickname_length"),
        CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),
        CheckConstraint("status IN ('active', 'disabled')", name="ck_users_status"),
        CheckConstraint("avatar_source IN ('none', 'upload', 'url')", name="ck_users_avatar_source"),
        CheckConstraint(
            "(avatar_source = 'none' AND avatar_storage_key IS NULL AND avatar_mime_type IS NULL "
            "AND avatar_size_bytes IS NULL AND avatar_url IS NULL AND avatar_updated_at IS NULL) OR "
            "(avatar_source = 'upload' AND avatar_storage_key IS NOT NULL AND avatar_mime_type IS NOT NULL "
            "AND avatar_size_bytes IS NOT NULL AND avatar_url IS NULL AND avatar_updated_at IS NOT NULL) OR "
            "(avatar_source = 'url' AND avatar_storage_key IS NULL AND avatar_mime_type IS NULL "
            "AND avatar_size_bytes IS NULL AND avatar_url IS NOT NULL AND avatar_updated_at IS NOT NULL)",
            name="ck_users_avatar_fields",
        ),
        Index("uq_users_username", "username", unique=True),
        Index("uq_users_email", "email", unique=True),
        Index(
            "uq_users_phone_e164",
            "phone_e164",
            unique=True,
            postgresql_where=text("phone_e164 IS NOT NULL"),
            sqlite_where=text("phone_e164 IS NOT NULL"),
        ),
        {"comment": "Web 用户账户、认证标识与个人资料"},
    )

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "用户唯一标识"})
    username: str = Field(sa_column=Column(Text, nullable=False, comment="规范化后的唯一用户名"))
    email: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True, comment="去除首尾空格并转为小写的可选唯一邮箱"),
    )
    email_verified_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, comment="邮箱验证时间（UTC），未验证时为空"),
    )
    phone_e164: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True, comment="E.164 格式的唯一手机号，未填写时为空"),
    )
    phone_verified_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, comment="手机号验证时间（UTC），未验证时为空"),
    )
    password_hash: str = Field(sa_column=Column(Text, nullable=False, comment="Argon2id 密码哈希，不保存或返回明文"))
    nickname: str = Field(sa_column=Column(Text, nullable=False, comment="面向用户展示的名称"))
    must_change_password: bool = Field(
        default=False,
        sa_column=Column(
            Boolean,
            nullable=False,
            server_default=text("false"),
            comment="是否必须完成首次密码修改",
        ),
    )
    role: str = Field(
        default="user",
        sa_column=Column(Text, nullable=False, server_default=text("'user'"), comment="账户角色：user 或 admin"),
    )
    avatar_source: str = Field(
        default="none",
        sa_column=Column(
            Text,
            nullable=False,
            server_default=text("'none'"),
            comment="头像来源：none、upload 或 url",
        ),
    )
    avatar_storage_key: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True, comment="上传头像的存储对象键"),
    )
    avatar_mime_type: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True, comment="上传头像解码后的真实 MIME 类型"),
    )
    avatar_size_bytes: int | None = Field(
        default=None,
        sa_column=Column(BigInteger, nullable=True, comment="上传头像的文件大小（字节）"),
    )
    avatar_url: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True, comment="外部头像的绝对 URL，不由服务端抓取"),
    )
    avatar_updated_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, comment="头像最后更新时间（UTC）"),
    )
    address: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True, comment="用户现住址，属于私密资料"),
    )
    birthday: date | None = Field(
        default=None,
        sa_column=Column(Date, nullable=True, comment="用户生日，属于私密资料"),
    )
    status: str = Field(
        default="active",
        sa_column=Column(
            Text,
            nullable=False,
            server_default=text("'active'"),
            comment="账户状态：active 或 disabled",
        ),
    )
    last_login_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, comment="最近一次成功登录时间（UTC）"),
    )


class UserPreference(TimestampMixin, table=True):
    """用户语言与主题偏好。"""

    __tablename__ = "user_preferences"
    __table_args__ = (
        CheckConstraint("locale IN ('zh-CN', 'zh-TW', 'en-US')", name="ck_user_preferences_locale"),
        CheckConstraint(
            "theme_palette IN ('manuscript-brown', 'pine-green', 'harbor-blue', 'grape-purple', 'graphite')",
            name="ck_user_preferences_theme_palette",
        ),
        CheckConstraint("theme_mode IN ('system', 'light', 'dark')", name="ck_user_preferences_theme_mode"),
        {"comment": "Web 用户的语言与主题偏好"},
    )

    user_id: UUID = Field(
        primary_key=True,
        foreign_key="users.id",
        ondelete="CASCADE",
        sa_column_kwargs={"comment": "用户唯一标识，同时作为本表主键"},
    )
    locale: str = Field(
        default="zh-CN",
        sa_column=Column(
            Text,
            nullable=False,
            server_default=text("'zh-CN'"),
            comment="界面语言：zh-CN、zh-TW 或 en-US",
        ),
    )
    theme_palette: str = Field(
        default="manuscript-brown",
        sa_column=Column(
            Text,
            nullable=False,
            server_default=text("'manuscript-brown'"),
            comment="主题色方案标识",
        ),
    )
    theme_mode: str = Field(
        default="system",
        sa_column=Column(
            Text,
            nullable=False,
            server_default=text("'system'"),
            comment="主题明暗模式：system、light 或 dark",
        ),
    )
