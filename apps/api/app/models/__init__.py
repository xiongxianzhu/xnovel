"""SQLModel 表模型；导入以确保 Alembic 侦测 metadata。"""

from sqlmodel import SQLModel

from app.models.account import User, UserPreference
from app.models.ai import AICredential, AIProviderConfig, AIProviderModel, AIResult, AITask, Skill, SkillVersion
from app.models.ai_batch import AIBatch, AIBatchItem
from app.models.base import ImmutableTimestampMixin, TimestampMixin
from app.models.document import Document
from app.models.document_content import DocumentContent
from app.models.document_revision import DocumentRevision
from app.models.import_receipt import ImportReceipt
from app.models.planning import Character, DocumentCharacterLink, DocumentWorldEntryLink, WorldEntry
from app.models.project import Project
from app.models.session import UserSession, UserSessionToken
from app.models.site import AdminAuditEvent, AuthRateLimitBucket, SiteSetting
from app.models.studio import (
    ChapterPlan,
    ChapterSummary,
    CharacterKnowledge,
    ContinuityIssue,
    PlotThread,
    PlotThreadUpdate,
    ReleaseSchedule,
    RevisionNote,
    StoryEvent,
    StoryFact,
    StyleRule,
)

__all__ = [
    "AIBatch",
    "AIBatchItem",
    "ImportReceipt",
    "ChapterSummary",
    "StoryFact",
    "PlotThread",
    "StoryEvent",
    "CharacterKnowledge",
    "ContinuityIssue",
    "ChapterPlan",
    "RevisionNote",
    "StyleRule",
    "ReleaseSchedule",
    "PlotThreadUpdate",

    "AdminAuditEvent",
    "AICredential",
    "AIProviderConfig",
    "AIProviderModel",
    "AIResult",
    "AITask",
    "AuthRateLimitBucket",
    "Document",
    "DocumentContent",
    "DocumentRevision",
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
