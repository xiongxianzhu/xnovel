"""Web 私有 Skill 安全、版本和管理员隔离测试。"""

from __future__ import annotations

import io
import stat
import zipfile
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_db
from app.core.config import get_settings
from app.core.exceptions import APIException
from app.main import app
from app.models.account import User, UserPreference
from app.models.site import AdminAuditEvent, SiteSetting
from app.services.identity import hash_password
from app.services.skill_packages import content_manifest_sha256, prepare_skill_archive

PASSWORD = "correct horse battery staple"


@pytest.fixture
async def client(
    session_factory: async_sessionmaker[AsyncSession],
    tmp_path: Path,
    monkeypatch,
) -> AsyncIterator[AsyncClient]:
    monkeypatch.setenv("SKILL_STORAGE_ROOT", str(tmp_path / "skills"))
    get_settings.cache_clear()

    async def override_get_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as test_client:
        yield test_client
    app.dependency_overrides.clear()
    get_settings.cache_clear()


async def _user(
    session_factory: async_sessionmaker[AsyncSession],
    suffix: str,
    role: str = "user",
) -> User:
    async with session_factory() as session:
        user = User(
            username=f"skill-{suffix}",
            email=f"skill-{suffix}@example.com",
            password_hash=hash_password(PASSWORD),
            nickname="作者",
            role=role,
        )
        session.add(user)
        await session.flush()
        session.add(UserPreference(user_id=user.id))
        if await session.get(SiteSetting, 1) is None:
            session.add(SiteSetting(id=1))
        await session.commit()
        return user


async def _headers(client: AsyncClient, user: User) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"identifier": user.username, "password": PASSWORD},
    )
    return {"Authorization": f"Bearer {response.json()['data']['access_token']}"}


def _archive(files: dict[str, bytes]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return output.getvalue()


def _valid_archive(name: str = "story-helper") -> bytes:
    return _archive(
        {
            "SKILL.md": (
                f"---\nname: {name}\ndescription: 帮助检查故事结构\n---\n"
                "请参考 [规则](references/rules.md)，只提供候选建议。\n"
            ).encode(),
            "references/rules.md": "保持作者控制权。".encode(),
        }
    )


def test_manifest_hash_is_order_independent_and_content_sensitive() -> None:
    first = {"SKILL.md": b"---\nname: x\n---\n", "a.txt": b"a"}
    second = {"a.txt": b"a", "SKILL.md": b"---\nname: x\n---\n"}
    changed = {"a.txt": b"b", "SKILL.md": b"---\nname: x\n---\n"}
    assert content_manifest_sha256(first) == content_manifest_sha256(second)
    assert content_manifest_sha256(first) != content_manifest_sha256(changed)


def test_archive_rejects_traversal_symlink_and_unicode_casefold_collision() -> None:
    with pytest.raises(APIException):
        prepare_skill_archive("bad.zip", _archive({"../SKILL.md": b"x"}))

    symlink = io.BytesIO()
    with zipfile.ZipFile(symlink, "w") as archive:
        archive.writestr("SKILL.md", "---\nname: bad\n---\n")
        info = zipfile.ZipInfo("link.txt")
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive.writestr(info, "target")
    with pytest.raises(APIException):
        prepare_skill_archive("bad.skill", symlink.getvalue())

    with pytest.raises(APIException):
        prepare_skill_archive(
            "collision.zip",
            _archive(
                {
                    "SKILL.md": b"---\nname: collision\n---\n",
                    "Straße.txt": b"one",
                    "STRASSE.txt": b"two",
                }
            ),
        )


@pytest.mark.anyio
async def test_skill_upload_edit_preview_enable_and_owner_boundary(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner = await _user(session_factory, "owner")
    other = await _user(session_factory, "other")
    headers = await _headers(client, owner)
    other_headers = await _headers(client, other)
    uploaded = await client.post(
        "/api/v1/skills",
        headers=headers,
        files={"file": ("story.skill", _valid_archive(), "application/zip")},
    )
    assert uploaded.status_code == 201, uploaded.text
    skill = uploaded.json()["data"]
    assert skill["name"] == "story-helper"
    assert skill["enabled"] is False
    assert "skill_md_text" not in skill["current_version"]

    enabled = await client.patch(
        f"/api/v1/skills/{skill['id']}/enabled",
        headers=headers,
        json={"enabled": True},
    )
    preview = await client.get(
        f"/api/v1/skills/{skill['id']}/resource",
        headers=headers,
        params={"path": "references/rules.md"},
    )
    forbidden = await client.get(f"/api/v1/skills/{skill['id']}", headers=other_headers)
    updated = await client.put(
        f"/api/v1/skills/{skill['id']}/skill-md",
        headers=headers,
        json={
            "current_version_id": skill["current_version"]["id"],
            "skill_md_text": "---\nname: story-helper\ndescription: 新说明\n---\n只输出候选。",
        },
    )
    stale = await client.put(
        f"/api/v1/skills/{skill['id']}/skill-md",
        headers=headers,
        json={
            "current_version_id": skill["current_version"]["id"],
            "skill_md_text": "---\nname: story-helper\n---\n过期编辑",
        },
    )

    assert enabled.json()["data"]["enabled"] is True
    assert preview.json()["data"]["content"] == "保持作者控制权。"
    assert forbidden.status_code == 404
    assert updated.status_code == 200
    assert updated.json()["data"]["current_version"]["version_number"] == 2
    assert updated.json()["data"]["enabled"] is False
    assert stale.status_code == 409
    assert stale.json()["data"]["reason"] == "skill_version_conflict"


@pytest.mark.anyio
async def test_admin_skill_metadata_never_returns_content_and_quarantine_is_audited(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    owner = await _user(session_factory, "admin-target")
    admin = await _user(session_factory, "admin", role="admin")
    owner_headers = await _headers(client, owner)
    admin_headers = await _headers(client, admin)
    uploaded = await client.post(
        "/api/v1/skills",
        headers=owner_headers,
        files={"file": ("story.zip", _valid_archive("admin-visible"), "application/zip")},
    )
    skill_id = uploaded.json()["data"]["id"]
    listed = await client.get("/api/admin/v1/skills", headers=admin_headers)
    quarantined = await client.post(
        f"/api/admin/v1/skills/{skill_id}/quarantine",
        headers=admin_headers,
        json={"reason_code": "SUSPICIOUS_CONTENT", "note": "manual review"},
    )
    released = await client.post(
        f"/api/admin/v1/skills/{skill_id}/release",
        headers=admin_headers,
        json={"reason_code": "REVIEW_PASSED"},
    )

    serialized = listed.text
    assert listed.status_code == 200
    assert "skill_md_text" not in serialized
    assert "保持作者控制权" not in serialized
    assert quarantined.json()["data"]["status"] == "quarantined"
    assert quarantined.json()["data"]["enabled"] is False
    assert released.json()["data"]["status"] == "ready"
    assert released.json()["data"]["enabled"] is False
    async with session_factory() as session:
        actions = [item.action for item in (await session.exec(select(AdminAuditEvent))).all()]
        assert actions == ["skill.quarantine", "skill.release_quarantine"]
