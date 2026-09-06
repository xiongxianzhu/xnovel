"""长篇创作资料、来源状态与连载安排。"""

import sqlalchemy as sa
from sqlmodel.sql.sqltypes import AutoString

from alembic import op

revision = "20260906_0013"
down_revision = "20260906_0012"
branch_labels = None
depends_on = None


TABLE_COMMENTS = {
    "chapter_plans": "独立于正文顺序的章节目标与交付状态",
    "chapter_summaries": "章节摘要候选与作者确认记录",
    "character_knowledge": "人物获知信息、读者揭示与有意隐瞒的记录",
    "continuity_issues": "可核对证据的一致性疑点与作者处理记录",
    "plot_thread_updates": "伏笔埋设、推进及回收的追加历史",
    "plot_threads": "未完成线索、写作接续点与伏笔生命周期",
    "release_schedules": "作者手动设置的连载更新安排",
    "revision_notes": "正文修订待办与定位来源",
    "story_events": "独立于叙述章节顺序的故事事件",
    "story_facts": "作者确认事实、人物状态、创作计划及推断的分离记录",
    "style_rules": "作品术语和文风约定；检查只产生建议",
}

COLUMN_COMMENTS = {
    "chapter_plans": {
        "arc": "所属故事线",
        "body": "作者填写或确认的资料正文",
        "conflict": "章节冲突",
        "created_at": "创建时间（UTC）",
        "delivery_status": "草稿、待修、可交付或作者标记已发布",
        "hook": "结尾悬念",
        "id": "资料唯一标识",
        "position": "规划卡片顺序，不隐式调整正文",
        "pov": "章节叙述视角",
        "project_id": "所属作品标识",
        "source_document_id": "来源文档标识快照，删除来源后保留以标记失效",
        "source_order": "来源作品文档顺序摘要，重排后识别过期",
        "source_version": "来源正文版本快照",
        "title": "资料标题",
        "turning_point": "章节转折",
        "updated_at": "最后更新时间（UTC）",
        "version": "资料乐观锁版本",
    },
    "chapter_summaries": {
        "ai_task_id": "生成任务标识快照，不阻止普通任务历史清理",
        "body": "作者填写或确认的资料正文",
        "created_at": "创建时间（UTC）",
        "id": "资料唯一标识",
        "project_id": "所属作品标识",
        "source_document_id": "来源文档标识快照，删除来源后保留以标记失效",
        "source_order": "来源作品文档顺序摘要，重排后识别过期",
        "source_version": "来源正文版本快照",
        "status": "摘要审核状态",
        "title": "资料标题",
        "updated_at": "最后更新时间（UTC）",
        "version": "资料乐观锁版本",
    },
    "character_knowledge": {
        "audience": "信息视角：character、reader 或 author",
        "body": "作者填写或确认的资料正文",
        "character_id": "获知信息的同作品人物标识",
        "created_at": "创建时间（UTC）",
        "id": "资料唯一标识",
        "project_id": "所属作品标识",
        "source_document_id": "来源文档标识快照，删除来源后保留以标记失效",
        "source_order": "来源作品文档顺序摘要，重排后识别过期",
        "source_version": "来源正文版本快照",
        "story_order": "获知信息的故事事件顺序",
        "title": "资料标题",
        "updated_at": "最后更新时间（UTC）",
        "version": "资料乐观锁版本",
    },
    "continuity_issues": {
        "body": "作者填写或确认的资料正文",
        "created_at": "创建时间（UTC）",
        "evidence": "与来源正文逐字校验的必要证据摘录",
        "id": "资料唯一标识",
        "other_document_id": "第二处证据文档标识快照",
        "other_evidence": "第二处经校验的证据摘录",
        "other_version": "第二处证据正文版本",
        "project_id": "所属作品标识",
        "resolution": "作者解决或忽略的理由",
        "source_document_id": "来源文档标识快照，删除来源后保留以标记失效",
        "source_order": "来源作品文档顺序摘要，重排后识别过期",
        "source_version": "来源正文版本快照",
        "status": "待处理、已解决或忽略",
        "title": "资料标题",
        "updated_at": "最后更新时间（UTC）",
        "version": "资料乐观锁版本",
    },
    "plot_thread_updates": {
        "created_at": "创建时间（UTC）",
        "document_id": "本次进展关联章节的标识快照",
        "id": "线索进展标识",
        "note": "作者本次进展说明",
        "status": "本次操作后的状态",
        "thread_id": "所属线索标识",
        "updated_at": "最后更新时间（UTC）",
    },
    "plot_threads": {
        "body": "作者填写或确认的资料正文",
        "created_at": "创建时间（UTC）",
        "id": "资料唯一标识",
        "project_id": "所属作品标识",
        "source_document_id": "来源文档标识快照，删除来源后保留以标记失效",
        "source_order": "来源作品文档顺序摘要，重排后识别过期",
        "source_version": "来源正文版本快照",
        "status": "待处理、推进中、已回收或放弃",
        "target_document_id": "可选的目标回收章节",
        "title": "资料标题",
        "updated_at": "最后更新时间（UTC）",
        "version": "资料乐观锁版本",
    },
    "release_schedules": {
        "chapters_per_week": "作者计划每周交付的章节数",
        "created_at": "创建时间（UTC）",
        "note": "作者补充的更新安排说明",
        "project_id": "所属作品标识",
        "updated_at": "最后更新时间（UTC）",
    },
    "revision_notes": {
        "body": "作者填写或确认的资料正文",
        "created_at": "创建时间（UTC）",
        "id": "资料唯一标识",
        "project_id": "所属作品标识",
        "quote": "用于定位的原文摘录",
        "source_document_id": "来源文档标识快照，删除来源后保留以标记失效",
        "source_order": "来源作品文档顺序摘要，重排后识别过期",
        "source_version": "来源正文版本快照",
        "status": "待处理、已完成或忽略",
        "title": "资料标题",
        "updated_at": "最后更新时间（UTC）",
        "version": "资料乐观锁版本",
    },
    "story_events": {
        "body": "作者填写或确认的资料正文",
        "created_at": "创建时间（UTC）",
        "id": "资料唯一标识",
        "location": "事件发生地点",
        "participants": "参与人物说明",
        "project_id": "所属作品标识",
        "source_document_id": "来源文档标识快照，删除来源后保留以标记失效",
        "source_order": "来源作品文档顺序摘要，重排后识别过期",
        "source_version": "来源正文版本快照",
        "story_order": "相对事件顺序，为空表示未知",
        "time_label": "作者使用的时间描述，不强制公历",
        "title": "资料标题",
        "updated_at": "最后更新时间（UTC）",
        "version": "资料乐观锁版本",
    },
    "story_facts": {
        "body": "作者填写或确认的资料正文",
        "character_id": "关联的同作品人物标识",
        "created_at": "创建时间（UTC）",
        "id": "资料唯一标识",
        "kind": "事实、计划或推断分类",
        "project_id": "所属作品标识",
        "source_document_id": "来源文档标识快照，删除来源后保留以标记失效",
        "source_order": "来源作品文档顺序摘要，重排后识别过期",
        "source_version": "来源正文版本快照",
        "story_order": "适用故事事件顺序，为空表示未知",
        "title": "资料标题",
        "updated_at": "最后更新时间（UTC）",
        "version": "资料乐观锁版本",
    },
    "style_rules": {
        "body": "作者填写或确认的资料正文",
        "created_at": "创建时间（UTC）",
        "id": "资料唯一标识",
        "kind": "术语、视角、时态或表达约定",
        "preferred": "建议采用的写法",
        "project_id": "所属作品标识",
        "source_document_id": "来源文档标识快照，删除来源后保留以标记失效",
        "source_order": "来源作品文档顺序摘要，重排后识别过期",
        "source_version": "来源正文版本快照",
        "title": "资料标题",
        "updated_at": "最后更新时间（UTC）",
        "version": "资料乐观锁版本",
    },
}


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        "chapter_plans",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="创建时间（UTC）",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="最后更新时间（UTC）",
        ),
        sa.Column("id", sa.Uuid(), nullable=False, comment="资料唯一标识"),
        sa.Column("project_id", sa.Uuid(), nullable=False, comment="所属作品标识"),
        sa.Column("title", sa.Text(), nullable=False, comment="资料标题"),
        sa.Column("body", sa.Text(), nullable=False, comment="作者填写或确认的资料正文"),
        sa.Column("source_document_id", sa.Uuid(), nullable=True, comment="来源文档标识快照，删除来源后保留以标记失效"),
        sa.Column("source_version", sa.Integer(), nullable=True, comment="来源正文版本快照"),
        sa.Column(
            "source_order",
            AutoString(),
            nullable=True,
            comment="来源作品文档顺序摘要，重排后识别过期",
        ),
        sa.Column("version", sa.Integer(), nullable=False, comment="资料乐观锁版本"),
        sa.Column("position", sa.Integer(), nullable=False, comment="规划卡片顺序，不隐式调整正文"),
        sa.Column("pov", AutoString(), nullable=False, comment="章节叙述视角"),
        sa.Column("conflict", sa.Text(), nullable=False, comment="章节冲突"),
        sa.Column("turning_point", sa.Text(), nullable=False, comment="章节转折"),
        sa.Column("hook", sa.Text(), nullable=False, comment="结尾悬念"),
        sa.Column("arc", AutoString(), nullable=False, comment="所属故事线"),
        sa.Column(
            "delivery_status",
            AutoString(),
            nullable=False,
            comment="草稿、待修、可交付或作者标记已发布",
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        comment="独立于正文顺序的章节目标与交付状态",
    )
    op.create_index("ix_chapter_plans_project_position", "chapter_plans", ["project_id", "position"], unique=False)
    op.create_table(
        "chapter_summaries",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="创建时间（UTC）",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="最后更新时间（UTC）",
        ),
        sa.Column("id", sa.Uuid(), nullable=False, comment="资料唯一标识"),
        sa.Column("project_id", sa.Uuid(), nullable=False, comment="所属作品标识"),
        sa.Column("title", sa.Text(), nullable=False, comment="资料标题"),
        sa.Column("body", sa.Text(), nullable=False, comment="作者填写或确认的资料正文"),
        sa.Column("source_document_id", sa.Uuid(), nullable=True, comment="来源文档标识快照，删除来源后保留以标记失效"),
        sa.Column("source_version", sa.Integer(), nullable=True, comment="来源正文版本快照"),
        sa.Column(
            "source_order",
            AutoString(),
            nullable=True,
            comment="来源作品文档顺序摘要，重排后识别过期",
        ),
        sa.Column("version", sa.Integer(), nullable=False, comment="资料乐观锁版本"),
        sa.Column("status", AutoString(), nullable=False, comment="摘要审核状态"),
        sa.Column("ai_task_id", sa.Uuid(), nullable=True, comment="生成任务标识快照，不阻止普通任务历史清理"),
        sa.CheckConstraint("status IN ('candidate','confirmed','rejected')", name="ck_chapter_summaries_status"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        comment="章节摘要候选与作者确认记录",
    )
    op.create_index(
        "ix_chapter_summaries_project_source", "chapter_summaries", ["project_id", "source_document_id"], unique=False
    )
    op.create_table(
        "character_knowledge",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="创建时间（UTC）",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="最后更新时间（UTC）",
        ),
        sa.Column("id", sa.Uuid(), nullable=False, comment="资料唯一标识"),
        sa.Column("project_id", sa.Uuid(), nullable=False, comment="所属作品标识"),
        sa.Column("title", sa.Text(), nullable=False, comment="资料标题"),
        sa.Column("body", sa.Text(), nullable=False, comment="作者填写或确认的资料正文"),
        sa.Column("source_document_id", sa.Uuid(), nullable=True, comment="来源文档标识快照，删除来源后保留以标记失效"),
        sa.Column("source_version", sa.Integer(), nullable=True, comment="来源正文版本快照"),
        sa.Column(
            "source_order",
            AutoString(),
            nullable=True,
            comment="来源作品文档顺序摘要，重排后识别过期",
        ),
        sa.Column("version", sa.Integer(), nullable=False, comment="资料乐观锁版本"),
        sa.Column("character_id", sa.Uuid(), nullable=False, comment="获知信息的同作品人物标识"),
        sa.Column("story_order", sa.Integer(), nullable=True, comment="获知信息的故事事件顺序"),
        sa.Column(
            "audience",
            AutoString(),
            nullable=False,
            comment="信息视角：character、reader 或 author",
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        comment="人物获知信息、读者揭示与有意隐瞒的记录",
    )
    op.create_index(
        "ix_character_knowledge_project_character", "character_knowledge", ["project_id", "character_id"], unique=False
    )
    op.create_table(
        "continuity_issues",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="创建时间（UTC）",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="最后更新时间（UTC）",
        ),
        sa.Column("id", sa.Uuid(), nullable=False, comment="资料唯一标识"),
        sa.Column("project_id", sa.Uuid(), nullable=False, comment="所属作品标识"),
        sa.Column("title", sa.Text(), nullable=False, comment="资料标题"),
        sa.Column("body", sa.Text(), nullable=False, comment="作者填写或确认的资料正文"),
        sa.Column("source_document_id", sa.Uuid(), nullable=True, comment="来源文档标识快照，删除来源后保留以标记失效"),
        sa.Column("source_version", sa.Integer(), nullable=True, comment="来源正文版本快照"),
        sa.Column(
            "source_order",
            AutoString(),
            nullable=True,
            comment="来源作品文档顺序摘要，重排后识别过期",
        ),
        sa.Column("version", sa.Integer(), nullable=False, comment="资料乐观锁版本"),
        sa.Column("status", AutoString(), nullable=False, comment="待处理、已解决或忽略"),
        sa.Column("other_document_id", sa.Uuid(), nullable=True, comment="第二处证据文档标识快照"),
        sa.Column("other_version", sa.Integer(), nullable=True, comment="第二处证据正文版本"),
        sa.Column("evidence", sa.Text(), nullable=False, comment="与来源正文逐字校验的必要证据摘录"),
        sa.Column("other_evidence", sa.Text(), nullable=False, comment="第二处经校验的证据摘录"),
        sa.Column("resolution", sa.Text(), nullable=False, comment="作者解决或忽略的理由"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        comment="可核对证据的一致性疑点与作者处理记录",
    )
    op.create_index("ix_continuity_issues_project_status", "continuity_issues", ["project_id", "status"], unique=False)
    op.create_table(
        "plot_threads",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="创建时间（UTC）",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="最后更新时间（UTC）",
        ),
        sa.Column("id", sa.Uuid(), nullable=False, comment="资料唯一标识"),
        sa.Column("project_id", sa.Uuid(), nullable=False, comment="所属作品标识"),
        sa.Column("title", sa.Text(), nullable=False, comment="资料标题"),
        sa.Column("body", sa.Text(), nullable=False, comment="作者填写或确认的资料正文"),
        sa.Column("source_document_id", sa.Uuid(), nullable=True, comment="来源文档标识快照，删除来源后保留以标记失效"),
        sa.Column("source_version", sa.Integer(), nullable=True, comment="来源正文版本快照"),
        sa.Column(
            "source_order",
            AutoString(),
            nullable=True,
            comment="来源作品文档顺序摘要，重排后识别过期",
        ),
        sa.Column("version", sa.Integer(), nullable=False, comment="资料乐观锁版本"),
        sa.Column("status", AutoString(), nullable=False, comment="待处理、推进中、已回收或放弃"),
        sa.Column("target_document_id", sa.Uuid(), nullable=True, comment="可选的目标回收章节"),
        sa.CheckConstraint("status IN ('open','progressing','resolved','abandoned')", name="ck_plot_threads_status"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        comment="未完成线索、写作接续点与伏笔生命周期",
    )
    op.create_index("ix_plot_threads_project_status", "plot_threads", ["project_id", "status"], unique=False)
    op.create_table(
        "release_schedules",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="创建时间（UTC）",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="最后更新时间（UTC）",
        ),
        sa.Column("project_id", sa.Uuid(), nullable=False, comment="所属作品标识"),
        sa.Column("chapters_per_week", sa.Integer(), nullable=False, comment="作者计划每周交付的章节数"),
        sa.Column("note", sa.Text(), nullable=False, comment="作者补充的更新安排说明"),
        sa.CheckConstraint("chapters_per_week BETWEEN 1 AND 100", name="ck_release_schedule_frequency"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("project_id"),
        comment="作者手动设置的连载更新安排",
    )
    op.create_table(
        "revision_notes",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="创建时间（UTC）",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="最后更新时间（UTC）",
        ),
        sa.Column("id", sa.Uuid(), nullable=False, comment="资料唯一标识"),
        sa.Column("project_id", sa.Uuid(), nullable=False, comment="所属作品标识"),
        sa.Column("title", sa.Text(), nullable=False, comment="资料标题"),
        sa.Column("body", sa.Text(), nullable=False, comment="作者填写或确认的资料正文"),
        sa.Column("source_document_id", sa.Uuid(), nullable=True, comment="来源文档标识快照，删除来源后保留以标记失效"),
        sa.Column("source_version", sa.Integer(), nullable=True, comment="来源正文版本快照"),
        sa.Column(
            "source_order",
            AutoString(),
            nullable=True,
            comment="来源作品文档顺序摘要，重排后识别过期",
        ),
        sa.Column("version", sa.Integer(), nullable=False, comment="资料乐观锁版本"),
        sa.Column("status", AutoString(), nullable=False, comment="待处理、已完成或忽略"),
        sa.Column("quote", sa.Text(), nullable=False, comment="用于定位的原文摘录"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        comment="正文修订待办与定位来源",
    )
    op.create_index("ix_revision_notes_project_status", "revision_notes", ["project_id", "status"], unique=False)
    op.create_table(
        "story_events",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="创建时间（UTC）",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="最后更新时间（UTC）",
        ),
        sa.Column("id", sa.Uuid(), nullable=False, comment="资料唯一标识"),
        sa.Column("project_id", sa.Uuid(), nullable=False, comment="所属作品标识"),
        sa.Column("title", sa.Text(), nullable=False, comment="资料标题"),
        sa.Column("body", sa.Text(), nullable=False, comment="作者填写或确认的资料正文"),
        sa.Column("source_document_id", sa.Uuid(), nullable=True, comment="来源文档标识快照，删除来源后保留以标记失效"),
        sa.Column("source_version", sa.Integer(), nullable=True, comment="来源正文版本快照"),
        sa.Column(
            "source_order",
            AutoString(),
            nullable=True,
            comment="来源作品文档顺序摘要，重排后识别过期",
        ),
        sa.Column("version", sa.Integer(), nullable=False, comment="资料乐观锁版本"),
        sa.Column("story_order", sa.Integer(), nullable=True, comment="相对事件顺序，为空表示未知"),
        sa.Column("time_label", AutoString(), nullable=False, comment="作者使用的时间描述，不强制公历"),
        sa.Column("location", AutoString(), nullable=False, comment="事件发生地点"),
        sa.Column("participants", sa.Text(), nullable=False, comment="参与人物说明"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        comment="独立于叙述章节顺序的故事事件",
    )
    op.create_index("ix_story_events_project_order", "story_events", ["project_id", "story_order"], unique=False)
    op.create_table(
        "story_facts",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="创建时间（UTC）",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="最后更新时间（UTC）",
        ),
        sa.Column("id", sa.Uuid(), nullable=False, comment="资料唯一标识"),
        sa.Column("project_id", sa.Uuid(), nullable=False, comment="所属作品标识"),
        sa.Column("title", sa.Text(), nullable=False, comment="资料标题"),
        sa.Column("body", sa.Text(), nullable=False, comment="作者填写或确认的资料正文"),
        sa.Column("source_document_id", sa.Uuid(), nullable=True, comment="来源文档标识快照，删除来源后保留以标记失效"),
        sa.Column("source_version", sa.Integer(), nullable=True, comment="来源正文版本快照"),
        sa.Column(
            "source_order",
            AutoString(),
            nullable=True,
            comment="来源作品文档顺序摘要，重排后识别过期",
        ),
        sa.Column("version", sa.Integer(), nullable=False, comment="资料乐观锁版本"),
        sa.Column("kind", AutoString(), nullable=False, comment="事实、计划或推断分类"),
        sa.Column("character_id", sa.Uuid(), nullable=True, comment="关联的同作品人物标识"),
        sa.Column("story_order", sa.Integer(), nullable=True, comment="适用故事事件顺序，为空表示未知"),
        sa.CheckConstraint("kind IN ('fact','plan','inference')", name="ck_story_facts_kind"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        comment="作者确认事实、人物状态、创作计划及推断的分离记录",
    )
    op.create_index("ix_story_facts_project_character", "story_facts", ["project_id", "character_id"], unique=False)
    op.create_table(
        "style_rules",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="创建时间（UTC）",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="最后更新时间（UTC）",
        ),
        sa.Column("id", sa.Uuid(), nullable=False, comment="资料唯一标识"),
        sa.Column("project_id", sa.Uuid(), nullable=False, comment="所属作品标识"),
        sa.Column("title", sa.Text(), nullable=False, comment="资料标题"),
        sa.Column("body", sa.Text(), nullable=False, comment="作者填写或确认的资料正文"),
        sa.Column("source_document_id", sa.Uuid(), nullable=True, comment="来源文档标识快照，删除来源后保留以标记失效"),
        sa.Column("source_version", sa.Integer(), nullable=True, comment="来源正文版本快照"),
        sa.Column(
            "source_order",
            AutoString(),
            nullable=True,
            comment="来源作品文档顺序摘要，重排后识别过期",
        ),
        sa.Column("version", sa.Integer(), nullable=False, comment="资料乐观锁版本"),
        sa.Column("kind", AutoString(), nullable=False, comment="术语、视角、时态或表达约定"),
        sa.Column("preferred", sa.Text(), nullable=False, comment="建议采用的写法"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        comment="作品术语和文风约定；检查只产生建议",
    )
    op.create_table(
        "plot_thread_updates",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="创建时间（UTC）",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="最后更新时间（UTC）",
        ),
        sa.Column("id", sa.Uuid(), nullable=False, comment="线索进展标识"),
        sa.Column("thread_id", sa.Uuid(), nullable=False, comment="所属线索标识"),
        sa.Column("status", AutoString(), nullable=False, comment="本次操作后的状态"),
        sa.Column("note", sa.Text(), nullable=False, comment="作者本次进展说明"),
        sa.Column("document_id", sa.Uuid(), nullable=True, comment="本次进展关联章节的标识快照"),
        sa.ForeignKeyConstraint(["thread_id"], ["plot_threads.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        comment="伏笔埋设、推进及回收的追加历史",
    )
    # ### end Alembic commands ###

    with op.batch_alter_table("chapter_summaries") as batch:
        batch.create_check_constraint(
            "ck_chapter_summaries_source", "source_document_id IS NOT NULL AND source_version IS NOT NULL"
        )


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table("plot_thread_updates")
    op.drop_table("style_rules")
    op.drop_index("ix_story_facts_project_character", table_name="story_facts")
    op.drop_table("story_facts")
    op.drop_index("ix_story_events_project_order", table_name="story_events")
    op.drop_table("story_events")
    op.drop_index("ix_revision_notes_project_status", table_name="revision_notes")
    op.drop_table("revision_notes")
    op.drop_table("release_schedules")
    op.drop_index("ix_plot_threads_project_status", table_name="plot_threads")
    op.drop_table("plot_threads")
    op.drop_index("ix_continuity_issues_project_status", table_name="continuity_issues")
    op.drop_table("continuity_issues")
    op.drop_index("ix_character_knowledge_project_character", table_name="character_knowledge")
    op.drop_table("character_knowledge")
    op.drop_index("ix_chapter_summaries_project_source", table_name="chapter_summaries")
    op.drop_table("chapter_summaries")
    op.drop_index("ix_chapter_plans_project_position", table_name="chapter_plans")
    op.drop_table("chapter_plans")
    # ### end Alembic commands ###
