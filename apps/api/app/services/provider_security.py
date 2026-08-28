"""Provider Base URL 规范化与网络目标校验。"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from collections.abc import Iterable
from typing import cast
from urllib.parse import urlsplit, urlunsplit

from app.core.error_codes import ErrorCode, ErrorMessage
from app.core.exceptions import APIException


def normalize_provider_url(value: str) -> str:
    parts = urlsplit(value.strip())
    if (
        parts.scheme not in {"http", "https"}
        or not parts.hostname
        or parts.username
        or parts.password
        or parts.query
        or parts.fragment
    ):
        raise _not_allowed()
    host = parts.hostname.lower().rstrip(".")
    port = parts.port
    default_port = 443 if parts.scheme == "https" else 80
    netloc = host if port in {None, default_port} else f"{host}:{port}"
    path = parts.path.rstrip("/")
    return urlunsplit((parts.scheme, netloc, path, "", ""))


def origin_of(url: str) -> str:
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, "", "", ""))


def _public_address(value: str) -> bool:
    address = ipaddress.ip_address(value)
    return not (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
        or str(address) == "169.254.169.254"
    )


async def validate_provider_target(url: str, allowed_origins: Iterable[str]) -> str:
    normalized = normalize_provider_url(url)
    allowed = {origin_of(normalize_provider_url(item)) for item in allowed_origins}
    origin = origin_of(normalized)
    if origin in allowed:
        return normalized
    parts = urlsplit(normalized)
    if parts.scheme != "https":
        raise _not_allowed()
    host = parts.hostname
    if host is None:
        raise _not_allowed()
    try:
        literal = ipaddress.ip_address(host)
        if not _public_address(str(literal)):
            raise _not_allowed()
        return normalized
    except ValueError:
        pass

    def resolve() -> set[str]:
        return {
            cast(str, item[4][0])
            for item in socket.getaddrinfo(
                host,
                parts.port or 443,
                type=socket.SOCK_STREAM,
            )
        }

    try:
        addresses = await asyncio.to_thread(resolve)
    except OSError as exc:
        raise _not_allowed() from exc
    if not addresses or any(not _public_address(item) for item in addresses):
        raise _not_allowed()
    return normalized


def _not_allowed() -> APIException:
    return APIException(
        status_code=422,
        code=ErrorCode.VALIDATION_ERROR,
        msg=ErrorMessage.VALIDATION_ERROR,
        data={"reason": "provider_address_not_allowed"},
    )
