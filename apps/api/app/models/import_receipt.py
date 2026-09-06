"""导入幂等回执，不保存完整导入正文。"""

from uuid import UUID

from sqlmodel import Field

from app.models.base import ImmutableTimestampMixin


class ImportReceipt(ImmutableTimestampMixin, table=True):
    __tablename__ = "import_receipts"
    __table_args__ = ({"comment": "导入原子提交的幂等回执"},)
    id: UUID = Field(primary_key=True, sa_column_kwargs={"comment": "客户端导入请求标识"})
    owner_id: UUID = Field(foreign_key="users.id", ondelete="CASCADE", sa_column_kwargs={"comment": "发起导入的作者"})
    project_id: UUID = Field(
        foreign_key="projects.id", ondelete="CASCADE", sa_column_kwargs={"comment": "导入目标作品"}
    )
    payload_hash: str = Field(sa_column_kwargs={"comment": "导入参数摘要，识别同请求不同内容"})
    imported: int = Field(sa_column_kwargs={"comment": "实际新增章节数量"})
    skipped: int = Field(sa_column_kwargs={"comment": "作者选择跳过的同名章节数量"})
