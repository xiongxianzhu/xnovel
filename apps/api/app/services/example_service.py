"""示例业务服务。"""

from __future__ import annotations

from sqlmodel.ext.asyncio.session import AsyncSession


class ExampleService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def ping(self) -> str:
        return "pong"
