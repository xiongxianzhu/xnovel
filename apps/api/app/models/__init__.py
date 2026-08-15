"""SQLModel 表模型；导入以确保 Alembic 侦测 metadata。"""

from sqlmodel import SQLModel

from app.models.account import User, UserPreference
from app.models.base import ImmutableTimestampMixin, TimestampMixin
from app.models.site import AdminAuditEvent, AuthRateLimitBucket, SiteSetting

__all__ = [
    "AdminAuditEvent",
    "AuthRateLimitBucket",
    "ImmutableTimestampMixin",
    "SQLModel",
    "SiteSetting",
    "TimestampMixin",
    "User",
    "UserPreference",
]
