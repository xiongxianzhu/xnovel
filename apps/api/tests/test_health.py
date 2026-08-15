"""健康检查冒烟测试。"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient


@pytest.fixture
def client() -> TestClient:
    from app.main import app

    return TestClient(app)


def test_health_ok(client: TestClient) -> None:
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json() == {
        "code": 0,
        "msg": "SUCCESS",
        "data": {"status": "ok"},
    }


def test_admin_health_requires_token(client: TestClient) -> None:
    resp = client.get("/api/admin/v1/health")
    assert resp.status_code == 401
    assert resp.headers["WWW-Authenticate"] == "Bearer"
    assert resp.json() == {"code": 10002, "msg": "UNAUTHORIZED", "data": {}}


def test_admin_health_rejects_non_bearer_scheme(client: TestClient) -> None:
    resp = client.get("/api/admin/v1/health", headers={"Authorization": "Basic test-token"})
    assert resp.status_code == 401


def test_admin_health_rejects_empty_bearer_token(client: TestClient) -> None:
    resp = client.get("/api/admin/v1/health", headers={"Authorization": "Bearer "})
    assert resp.status_code == 401
    assert resp.headers["WWW-Authenticate"] == "Bearer"


def test_admin_health_ok(client: TestClient) -> None:
    resp = client.get("/api/admin/v1/health", headers={"Authorization": "Bearer test-token"})
    assert resp.status_code == 200
    assert resp.json() == {
        "code": 0,
        "msg": "SUCCESS",
        "data": {"status": "ok"},
    }


def test_unknown_route_uses_unified_not_found_response(client: TestClient) -> None:
    resp = client.get("/api/v1/not-a-route")

    assert resp.status_code == 404
    assert resp.json() == {"code": 10004, "msg": "NOT_FOUND", "data": {}}


def test_forbidden_uses_unified_response() -> None:
    from app.main import create_app

    test_app = create_app()

    @test_app.get("/_test/forbidden")
    async def forbidden() -> None:
        raise HTTPException(status_code=403, detail="must not leak")

    with TestClient(test_app) as test_client:
        response = test_client.get("/_test/forbidden")

    assert response.status_code == 403
    assert response.json() == {"code": 10003, "msg": "FORBIDDEN", "data": {}}
    assert "must not leak" not in response.text


def test_unhandled_exception_uses_sanitized_unified_response() -> None:
    from app.main import create_app

    test_app = create_app()

    @test_app.get("/_test/unhandled")
    async def unhandled() -> None:
        raise RuntimeError("database-password-must-not-leak")

    with TestClient(test_app, raise_server_exceptions=False) as test_client:
        response = test_client.get("/_test/unhandled")

    assert response.status_code == 500
    assert response.json() == {"code": -1, "msg": "INTERNAL_ERROR", "data": {}}
    assert "database-password-must-not-leak" not in response.text
