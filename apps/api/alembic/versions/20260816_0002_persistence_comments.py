"""为现有持久化表和字段增加简体中文注释。

Revision ID: 20260816_0002
Revises: 20260816_0001
Create Date: 2026-08-16
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260816_0002"
down_revision: str | None = "20260816_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLE_COMMENTS: dict[str, str] = {
    "users": "Web 用户账户、认证标识与个人资料",
    "user_preferences": "Web 用户的语言与主题偏好",
    "site_settings": "Web 站点全局设置单例",
    "admin_audit_events": "管理员敏感操作的不可变追加审计事件",
    "auth_rate_limit_buckets": "认证入口的持久化固定窗口限流桶",
}

_TIMESTAMP_COMMENTS = {
    "created_at": "创建时间（UTC）",
    "updated_at": "最后更新时间（UTC）",
}

COLUMN_COMMENTS: dict[str, dict[str, str]] = {
    "users": {
        "id": "用户唯一标识",
        "username": "规范化后的唯一用户名",
        "email": "去除首尾空格并转为小写的唯一邮箱",
        "email_verified_at": "邮箱验证时间（UTC），未验证时为空",
        "phone_e164": "E.164 格式的唯一手机号，未填写时为空",
        "phone_verified_at": "手机号验证时间（UTC），未验证时为空",
        "password_hash": "Argon2id 密码哈希，不保存或返回明文",
        "nickname": "面向用户展示的名称",
        "role": "账户角色：user 或 admin",
        "avatar_source": "头像来源：none、upload 或 url",
        "avatar_storage_key": "上传头像的存储对象键",
        "avatar_mime_type": "上传头像解码后的真实 MIME 类型",
        "avatar_size_bytes": "上传头像的文件大小（字节）",
        "avatar_url": "外部头像的绝对 URL，不由服务端抓取",
        "avatar_updated_at": "头像最后更新时间（UTC）",
        "address": "用户现住址，属于私密资料",
        "birthday": "用户生日，属于私密资料",
        "status": "账户状态：active 或 disabled",
        "last_login_at": "最近一次成功登录时间（UTC）",
        **_TIMESTAMP_COMMENTS,
    },
    "user_preferences": {
        "user_id": "用户唯一标识，同时作为本表主键",
        "locale": "界面语言：zh-CN、zh-TW 或 en-US",
        "theme_palette": "主题色方案标识",
        "theme_mode": "主题明暗模式：system、light 或 dark",
        **_TIMESTAMP_COMMENTS,
    },
    "site_settings": {
        "id": "固定为 1 的站点设置单例主键",
        "registration_enabled": "是否允许访客公开注册",
        "logo_storage_key": "Web 全局 Logo 的存储对象键",
        "logo_mime_type": "Web 全局 Logo 解码后的真实 MIME 类型",
        "logo_size_bytes": "Web 全局 Logo 的文件大小（字节）",
        "updated_by": "最近修改设置的管理员用户标识",
        **_TIMESTAMP_COMMENTS,
    },
    "admin_audit_events": {
        "id": "审计事件唯一标识",
        "actor_type": "操作主体类型：admin 或 system",
        "admin_id": "管理员用户标识；系统事件为空",
        "action": "稳定的审计动作标识",
        "target_type": "操作目标类型",
        "target_id": "操作目标的稳定标识",
        "change_summary": "不含密钥和完整私密数据的最小变更摘要",
        **_TIMESTAMP_COMMENTS,
    },
    "auth_rate_limit_buckets": {
        "id": "限流桶唯一标识",
        "scope": "限流范围：来源或来源与注册标识组合",
        "key_hash": "限流键的 HMAC-SHA-256 摘要，不保存原始标识",
        "window_started_at": "固定窗口起始时间（UTC）",
        "window_seconds": "固定窗口长度（秒）",
        "attempt_count": "当前窗口累计尝试次数",
        **_TIMESTAMP_COMMENTS,
    },
}


def _quote_identifier(value: str) -> str:
    escaped = value.replace('"', '""')
    return f'"{escaped}"'


def _quote_comment(value: str) -> str:
    escaped = value.replace("'", "''")
    return f"'{escaped}'"


def _uses_postgresql() -> bool:
    return op.get_context().dialect.name == "postgresql"


def upgrade() -> None:
    if not _uses_postgresql():
        return

    for table_name, comment in TABLE_COMMENTS.items():
        op.execute(f"COMMENT ON TABLE {_quote_identifier(table_name)} IS {_quote_comment(comment)}")
    for table_name, columns in COLUMN_COMMENTS.items():
        for column_name, comment in columns.items():
            op.execute(
                f"COMMENT ON COLUMN {_quote_identifier(table_name)}.{_quote_identifier(column_name)} "
                f"IS {_quote_comment(comment)}"
            )


def downgrade() -> None:
    if not _uses_postgresql():
        return

    for table_name, columns in reversed(COLUMN_COMMENTS.items()):
        for column_name in reversed(columns):
            op.execute(f"COMMENT ON COLUMN {_quote_identifier(table_name)}.{_quote_identifier(column_name)} IS NULL")
    for table_name in reversed(TABLE_COMMENTS):
        op.execute(f"COMMENT ON TABLE {_quote_identifier(table_name)} IS NULL")
