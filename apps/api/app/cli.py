"""xnovel API 管理命令。"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys
from collections.abc import Sequence

from app.db.session import async_session_factory, engine
from app.services.administration import (
    AdministrationError,
    create_first_admin,
    set_registration_enabled,
)


class _RejectPasswordArgument(argparse.Action):
    def __call__(
        self,
        parser: argparse.ArgumentParser,
        namespace: argparse.Namespace,
        values: object,
        option_string: str | None = None,
    ) -> None:
        parser.error("passwords must be entered interactively")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    subparsers = parser.add_subparsers(dest="command", required=True)

    create_admin = subparsers.add_parser("create-admin", help="创建首个管理员")
    create_admin.add_argument("--username", required=True)
    create_admin.add_argument("--email", required=True)
    create_admin.add_argument("--nickname", required=True)
    create_admin.add_argument("--password", action=_RejectPasswordArgument, help=argparse.SUPPRESS)

    set_registration = subparsers.add_parser("set-registration", help="修改公开注册开关")
    set_registration.add_argument("--admin-username", required=True)
    set_registration.add_argument("--password", action=_RejectPasswordArgument, help=argparse.SUPPRESS)
    state = set_registration.add_mutually_exclusive_group(required=True)
    state.add_argument("--enabled", action="store_true")
    state.add_argument("--disabled", action="store_true")
    return parser


async def _run(args: argparse.Namespace) -> str:
    async with async_session_factory() as session:
        if args.command == "create-admin":
            password = getpass.getpass("Password: ")
            confirmation = getpass.getpass("Confirm password: ")
            if password != confirmation:
                raise AdministrationError(2, "password confirmation does not match")
            await create_first_admin(
                session,
                username_input=args.username,
                email_input=args.email,
                nickname_input=args.nickname,
                password_input=password,
            )
            return "Administrator created."

        password = getpass.getpass("Administrator password: ")
        changed = await set_registration_enabled(
            session,
            admin_username_input=args.admin_username,
            password_input=password,
            enabled=bool(args.enabled),
        )
        return "Registration setting updated." if changed else "Registration setting already applied."


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        message = asyncio.run(_run_and_dispose(args))
    except AdministrationError as exc:
        print(exc.message, file=sys.stderr)
        return exc.exit_code
    except Exception:
        print("Unexpected infrastructure error.", file=sys.stderr)
        return 5
    print(message)
    return 0


async def _run_and_dispose(args: argparse.Namespace) -> str:
    try:
        return await _run(args)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
