"""管理员 bootstrap、注册开关与审计测试。"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.account import UserPreference
from app.models.site import AdminAuditEvent, SiteSetting
from app.services.administration import (
    AdministrationError,
    create_first_admin,
    set_registration_enabled,
)


@pytest.mark.anyio
async def test_bootstrap_creates_admin_preference_and_system_audit(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        session.add(SiteSetting(id=1))
        await session.commit()
        admin = await create_first_admin(
            session,
            username_input="Admin",
            email_input=" Admin@Example.COM ",
            nickname_input="管理员",
            password_input="correct horse battery staple",
        )

        preference = await session.get(UserPreference, admin.id)
        audits = (await session.exec(select(AdminAuditEvent))).all()

    assert admin.username == "admin"
    assert admin.email == "admin@example.com"
    assert admin.role == "admin"
    assert preference is not None
    assert len(audits) == 1
    assert audits[0].actor_type == "system"
    assert audits[0].admin_id is None
    assert audits[0].change_summary == {"channel": "cli"}


@pytest.mark.anyio
async def test_bootstrap_refuses_second_admin(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        session.add(SiteSetting(id=1))
        await session.commit()
        await create_first_admin(
            session,
            username_input="admin-one",
            email_input="one@example.com",
            nickname_input="一号管理员",
            password_input="correct horse battery staple",
        )
        with pytest.raises(AdministrationError, match="already exists") as error:
            await create_first_admin(
                session,
                username_input="admin-two",
                email_input="two@example.com",
                nickname_input="二号管理员",
                password_input="correct horse battery staple",
            )
        assert error.value.exit_code == 4


@pytest.mark.anyio
async def test_registration_toggle_requires_admin_and_audits_only_changes(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    password = "correct horse battery staple"
    async with session_factory() as session:
        session.add(SiteSetting(id=1))
        await session.commit()
        admin = await create_first_admin(
            session,
            username_input="admin",
            email_input="admin@example.com",
            nickname_input="管理员",
            password_input=password,
        )

        changed = await set_registration_enabled(
            session,
            admin_username_input="ADMIN",
            password_input=password,
            enabled=True,
        )
        unchanged = await set_registration_enabled(
            session,
            admin_username_input="admin",
            password_input=password,
            enabled=True,
        )
        setting = await session.get(SiteSetting, 1)
        audits = (await session.exec(select(AdminAuditEvent))).all()

    assert changed is True
    assert unchanged is False
    assert setting is not None
    assert setting.registration_enabled is True
    assert setting.updated_by == admin.id
    assert len(audits) == 2
    assert audits[-1].actor_type == "admin"
    assert audits[-1].change_summary == {
        "old_value": False,
        "new_value": True,
        "channel": "cli",
    }


@pytest.mark.anyio
async def test_registration_toggle_rejects_wrong_password(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        session.add(SiteSetting(id=1))
        await session.commit()
        await create_first_admin(
            session,
            username_input="admin",
            email_input="admin@example.com",
            nickname_input="管理员",
            password_input="correct horse battery staple",
        )
        with pytest.raises(AdministrationError) as error:
            await set_registration_enabled(
                session,
                admin_username_input="admin",
                password_input="wrong password",
                enabled=True,
            )
        assert error.value.exit_code == 3
