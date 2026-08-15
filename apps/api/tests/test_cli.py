"""管理 CLI 参数和密码输入测试。"""

from __future__ import annotations

from typing import Any

import pytest

from app import cli


class _SessionContext:
    async def __aenter__(self) -> object:
        return object()

    async def __aexit__(self, *_: object) -> None:
        return None


def test_create_admin_parser_rejects_password_argument_without_echoing_it(capsys: pytest.CaptureFixture[str]) -> None:
    password = "must-not-be-echoed"
    with pytest.raises(SystemExit) as error:
        cli._parser().parse_args(
            [
                "create-admin",
                "--username",
                "admin",
                "--email",
                "admin@example.com",
                "--nickname",
                "管理员",
                "--password",
                password,
            ]
        )
    assert error.value.code == 2
    assert password not in capsys.readouterr().err


@pytest.mark.anyio
async def test_create_admin_reads_matching_hidden_password_twice(monkeypatch: pytest.MonkeyPatch) -> None:
    passwords = iter(["correct horse battery staple", "correct horse battery staple"])
    captured: dict[str, Any] = {}

    async def fake_create_first_admin(_: object, **kwargs: Any) -> None:
        captured.update(kwargs)

    monkeypatch.setattr(cli, "async_session_factory", lambda: _SessionContext())
    monkeypatch.setattr(cli.getpass, "getpass", lambda _: next(passwords))
    monkeypatch.setattr(cli, "create_first_admin", fake_create_first_admin)
    args = cli._parser().parse_args(
        [
            "create-admin",
            "--username",
            "admin",
            "--email",
            "admin@example.com",
            "--nickname",
            "管理员",
        ]
    )

    message = await cli._run(args)

    assert message == "Administrator created."
    assert captured["password_input"] == "correct horse battery staple"


@pytest.mark.anyio
async def test_create_admin_rejects_mismatched_password_before_database(monkeypatch: pytest.MonkeyPatch) -> None:
    passwords = iter(["correct horse battery staple", "different password"])
    monkeypatch.setattr(cli, "async_session_factory", lambda: _SessionContext())
    monkeypatch.setattr(cli.getpass, "getpass", lambda _: next(passwords))
    args = cli._parser().parse_args(
        [
            "create-admin",
            "--username",
            "admin",
            "--email",
            "admin@example.com",
            "--nickname",
            "管理员",
        ]
    )

    with pytest.raises(cli.AdministrationError) as error:
        await cli._run(args)
    assert error.value.exit_code == 2
