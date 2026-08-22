"""SQLModel 表模型；导入以确保 Alembic 侦测 metadata。"""

from sqlmodel import SQLModel

from app.models.account import User, UserPreference
from app.models.base import ImmutableTimestampMixin, TimestampMixin
from app.models.document import Document
from app.models.document_content import DocumentContent
from app.models.project import Project
from app.models.session import UserSession, UserSessionToken
from app.models.site import AdminAuditEvent, AuthRateLimitBucket, SiteSetting

__all__ = [
    "AdminAuditEvent",
    "AuthRateLimitBucket",
    "Document",
    "DocumentContent",
    "ImmutableTimestampMixin",
    "Project",
    "SQLModel",
    "SiteSetting",
    "TimestampMixin",
    "User",
    "UserPreference",
    "UserSession",
    "UserSessionToken",
]
