"""SQLModel 表模型；导入以确保 Alembic 侦测 metadata。"""

from sqlmodel import SQLModel

from app.models.account import User, UserPreference
from app.models.ai import AICredential, AIProviderConfig, AIProviderModel, AIResult, AITask, Skill, SkillVersion
from app.models.base import ImmutableTimestampMixin, TimestampMixin
from app.models.document import Document
from app.models.document_content import DocumentContent
from app.models.planning import Character, DocumentCharacterLink, DocumentWorldEntryLink, WorldEntry
from app.models.project import Project
from app.models.session import UserSession, UserSessionToken
from app.models.site import AdminAuditEvent, AuthRateLimitBucket, SiteSetting

__all__ = [
    "AdminAuditEvent",
    "AICredential",
    "AIProviderConfig",
    "AIProviderModel",
    "AIResult",
    "AITask",
    "AuthRateLimitBucket",
    "Document",
    "DocumentContent",
    "DocumentCharacterLink",
    "DocumentWorldEntryLink",
    "ImmutableTimestampMixin",
    "Project",
    "Character",
    "SQLModel",
    "SiteSetting",
    "Skill",
    "SkillVersion",
    "TimestampMixin",
    "User",
    "UserPreference",
    "UserSession",
    "UserSessionToken",
    "WorldEntry",
]
