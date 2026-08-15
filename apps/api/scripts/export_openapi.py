"""确定性导出 FastAPI OpenAPI Schema。"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

_OPENAPI_ENV = {
    "APP_ENV": "openapi",
    "APP_NAME": "api",
    "DATABASE_URL": "sqlite+aiosqlite:///:memory:",
    "SECRET_KEY": "openapi-export-placeholder",
}


@contextmanager
def isolated_openapi_settings() -> Iterator[None]:
    """固定会影响 Schema 的设置，并在导出后恢复调用方环境。"""
    previous = {key: os.environ.get(key) for key in _OPENAPI_ENV}
    os.environ.update(_OPENAPI_ENV)

    from app.core.config import get_settings

    get_settings.cache_clear()
    try:
        yield
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        get_settings.cache_clear()


def export_openapi_json() -> str:
    """返回适合版本控制的确定性 OpenAPI JSON。"""
    with isolated_openapi_settings():
        from app.main import create_app

        schema: dict[str, Any] = create_app().openapi()
    return json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def sync_openapi(target: Path, *, check: bool) -> bool:
    """写入 Schema，或检查目标内容是否已经同步。"""
    expected = export_openapi_json()

    if check:
        return target.is_file() and target.read_text(encoding="utf-8") == expected

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(expected, encoding="utf-8", newline="\n")
    return True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", type=Path, help="OpenAPI JSON 输出路径")
    parser.add_argument("--check", action="store_true", help="仅检查目标文件是否为最新")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if sync_openapi(args.target, check=args.check):
        return 0

    print(f"OpenAPI Schema 已过期：{args.target}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
