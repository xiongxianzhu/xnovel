"""公共 FastAPI 依赖。"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_db

SessionDep = Annotated[AsyncSession, Depends(get_db)]

__all__ = ["SessionDep", "get_db"]
