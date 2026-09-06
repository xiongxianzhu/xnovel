"""长篇创作资料：各业务独立持久化，来源快照可识别失效。"""

from uuid import UUID, uuid7

from sqlalchemy import CheckConstraint, Index, Text
from sqlmodel import Field

from app.models.base import ImmutableTimestampMixin, TimestampMixin


class SourceRecord(TimestampMixin):
    """摘要、事实和线索实际复用的版本化来源字段。"""

    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "资料唯一标识"})
    project_id: UUID = Field(
        foreign_key="projects.id", ondelete="CASCADE", nullable=False, sa_column_kwargs={"comment": "所属作品标识"}
    )
    title: str = Field(default="", sa_type=Text, sa_column_kwargs={"comment": "资料标题"})
    body: str = Field(default="", sa_type=Text, sa_column_kwargs={"comment": "作者填写或确认的资料正文"})
    source_document_id: UUID | None = Field(
        default=None, sa_column_kwargs={"comment": "来源文档标识快照，删除来源后保留以标记失效"}
    )
    source_version: int | None = Field(default=None, sa_column_kwargs={"comment": "来源正文版本快照"})
    source_order: str | None = Field(default=None, sa_column_kwargs={"comment": "来源作品文档顺序摘要，重排后识别过期"})
    version: int = Field(default=1, sa_column_kwargs={"comment": "资料乐观锁版本"})


class ChapterSummary(SourceRecord, table=True):
    __tablename__ = "chapter_summaries"
    __table_args__ = (
        CheckConstraint(
            "source_document_id IS NOT NULL AND source_version IS NOT NULL", name="ck_chapter_summaries_source"
        ),
        CheckConstraint("status IN ('candidate','confirmed','rejected')", name="ck_chapter_summaries_status"),
        Index("ix_chapter_summaries_project_source", "project_id", "source_document_id"),
        {"comment": "章节摘要候选与作者确认记录"},
    )
    status: str = Field(default="candidate", sa_column_kwargs={"comment": "摘要审核状态"})
    ai_task_id: UUID | None = Field(
        default=None, sa_column_kwargs={"comment": "生成任务标识快照，不阻止普通任务历史清理"}
    )


class StoryFact(SourceRecord, table=True):
    __tablename__ = "story_facts"
    __table_args__ = (
        CheckConstraint("kind IN ('fact','plan','inference')", name="ck_story_facts_kind"),
        Index("ix_story_facts_project_character", "project_id", "character_id"),
        {"comment": "作者确认事实、人物状态、创作计划及推断的分离记录"},
    )
    kind: str = Field(default="fact", sa_column_kwargs={"comment": "事实、计划或推断分类"})
    character_id: UUID | None = Field(default=None, sa_column_kwargs={"comment": "关联的同作品人物标识"})
    story_order: int | None = Field(default=None, sa_column_kwargs={"comment": "适用故事事件顺序，为空表示未知"})


class PlotThread(SourceRecord, table=True):
    __tablename__ = "plot_threads"
    __table_args__ = (
        CheckConstraint("status IN ('open','progressing','resolved','abandoned')", name="ck_plot_threads_status"),
        Index("ix_plot_threads_project_status", "project_id", "status"),
        {"comment": "未完成线索、写作接续点与伏笔生命周期"},
    )
    status: str = Field(default="open", sa_column_kwargs={"comment": "待处理、推进中、已回收或放弃"})
    target_document_id: UUID | None = Field(default=None, sa_column_kwargs={"comment": "可选的目标回收章节"})


class StoryEvent(SourceRecord, table=True):
    __tablename__ = "story_events"
    __table_args__ = (
        Index("ix_story_events_project_order", "project_id", "story_order"),
        {"comment": "独立于叙述章节顺序的故事事件"},
    )
    story_order: int | None = Field(default=None, sa_column_kwargs={"comment": "相对事件顺序，为空表示未知"})
    time_label: str = Field(default="", sa_column_kwargs={"comment": "作者使用的时间描述，不强制公历"})
    location: str = Field(default="", sa_column_kwargs={"comment": "事件发生地点"})
    participants: str = Field(default="", sa_type=Text, sa_column_kwargs={"comment": "参与人物说明"})


class CharacterKnowledge(SourceRecord, table=True):
    __tablename__ = "character_knowledge"
    __table_args__ = (
        Index("ix_character_knowledge_project_character", "project_id", "character_id"),
        {"comment": "人物获知信息、读者揭示与有意隐瞒的记录"},
    )
    character_id: UUID = Field(sa_column_kwargs={"comment": "获知信息的同作品人物标识"})
    story_order: int | None = Field(default=None, sa_column_kwargs={"comment": "获知信息的故事事件顺序"})
    audience: str = Field(default="character", sa_column_kwargs={"comment": "信息视角：character、reader 或 author"})


class ContinuityIssue(SourceRecord, table=True):
    __tablename__ = "continuity_issues"
    __table_args__ = (
        Index("ix_continuity_issues_project_status", "project_id", "status"),
        {"comment": "可核对证据的一致性疑点与作者处理记录"},
    )
    status: str = Field(default="open", sa_column_kwargs={"comment": "待处理、已解决或忽略"})
    other_document_id: UUID | None = Field(default=None, sa_column_kwargs={"comment": "第二处证据文档标识快照"})
    other_version: int | None = Field(default=None, sa_column_kwargs={"comment": "第二处证据正文版本"})
    evidence: str = Field(default="", sa_type=Text, sa_column_kwargs={"comment": "与来源正文逐字校验的必要证据摘录"})
    other_evidence: str = Field(default="", sa_type=Text, sa_column_kwargs={"comment": "第二处经校验的证据摘录"})
    resolution: str = Field(default="", sa_type=Text, sa_column_kwargs={"comment": "作者解决或忽略的理由"})


class ChapterPlan(SourceRecord, table=True):
    __tablename__ = "chapter_plans"
    __table_args__ = (
        Index("ix_chapter_plans_project_position", "project_id", "position"),
        {"comment": "独立于正文顺序的章节目标与交付状态"},
    )
    position: int = Field(default=0, sa_column_kwargs={"comment": "规划卡片顺序，不隐式调整正文"})
    pov: str = Field(default="", sa_column_kwargs={"comment": "章节叙述视角"})
    conflict: str = Field(default="", sa_type=Text, sa_column_kwargs={"comment": "章节冲突"})
    turning_point: str = Field(default="", sa_type=Text, sa_column_kwargs={"comment": "章节转折"})
    hook: str = Field(default="", sa_type=Text, sa_column_kwargs={"comment": "结尾悬念"})
    arc: str = Field(default="", sa_column_kwargs={"comment": "所属故事线"})
    delivery_status: str = Field(default="draft", sa_column_kwargs={"comment": "草稿、待修、可交付或作者标记已发布"})


class RevisionNote(SourceRecord, table=True):
    __tablename__ = "revision_notes"
    __table_args__ = (
        Index("ix_revision_notes_project_status", "project_id", "status"),
        {"comment": "正文修订待办与定位来源"},
    )
    status: str = Field(default="open", sa_column_kwargs={"comment": "待处理、已完成或忽略"})
    quote: str = Field(default="", sa_type=Text, sa_column_kwargs={"comment": "用于定位的原文摘录"})


class StyleRule(SourceRecord, table=True):
    __tablename__ = "style_rules"
    __table_args__ = ({"comment": "作品术语和文风约定；检查只产生建议"},)
    kind: str = Field(default="term", sa_column_kwargs={"comment": "术语、视角、时态或表达约定"})
    preferred: str = Field(default="", sa_type=Text, sa_column_kwargs={"comment": "建议采用的写法"})


class ReleaseSchedule(TimestampMixin, table=True):
    __tablename__ = "release_schedules"
    __table_args__ = (
        CheckConstraint("chapters_per_week BETWEEN 1 AND 100", name="ck_release_schedule_frequency"),
        {"comment": "作者手动设置的连载更新安排"},
    )
    project_id: UUID = Field(
        primary_key=True, foreign_key="projects.id", ondelete="CASCADE", sa_column_kwargs={"comment": "所属作品标识"}
    )
    chapters_per_week: int = Field(sa_column_kwargs={"comment": "作者计划每周交付的章节数"})
    note: str = Field(default="", sa_type=Text, sa_column_kwargs={"comment": "作者补充的更新安排说明"})


class PlotThreadUpdate(ImmutableTimestampMixin, table=True):
    __tablename__ = "plot_thread_updates"
    __table_args__ = ({"comment": "伏笔埋设、推进及回收的追加历史"},)
    id: UUID = Field(default_factory=uuid7, primary_key=True, sa_column_kwargs={"comment": "线索进展标识"})
    thread_id: UUID = Field(
        foreign_key="plot_threads.id", ondelete="CASCADE", sa_column_kwargs={"comment": "所属线索标识"}
    )
    status: str = Field(sa_column_kwargs={"comment": "本次操作后的状态"})
    note: str = Field(default="", sa_type=Text, sa_column_kwargs={"comment": "作者本次进展说明"})
    document_id: UUID | None = Field(default=None, sa_column_kwargs={"comment": "本次进展关联章节的标识快照"})
