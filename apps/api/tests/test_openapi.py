"""OpenAPI 契约测试。"""

from __future__ import annotations

import json
from typing import Any

from scripts.export_openapi import export_openapi_json


def load_schema() -> dict[str, Any]:
    return json.loads(export_openapi_json())


def test_openapi_export_is_deterministic(monkeypatch: Any) -> None:
    expected = export_openapi_json()
    monkeypatch.setenv("APP_NAME", "environment-specific-name")

    assert export_openapi_json() == expected
    assert json.loads(expected)["info"]["title"] == "api"


def test_health_operation_ids_are_stable_and_unique() -> None:
    schema = load_schema()
    paths = schema["paths"]

    assert paths["/api/v1/health"]["get"]["operationId"] == "getHealth"
    assert paths["/api/admin/v1/health"]["get"]["operationId"] == "getAdminHealth"
    assert paths["/api/v1/site-config"]["get"]["operationId"] == "getSiteConfig"
    assert paths["/api/v1/auth/register"]["post"]["operationId"] == "register"

    operation_ids = [
        operation["operationId"]
        for path_item in paths.values()
        for method, operation in path_item.items()
        if method in {"delete", "get", "head", "options", "patch", "post", "put", "trace"}
    ]
    assert len(operation_ids) == len(set(operation_ids))

    health_schema = schema["components"]["schemas"]["HealthResponse"]
    assert health_schema["required"] == ["code", "msg", "data"]
    assert health_schema["properties"]["code"] == {
        "const": 0,
        "title": "Code",
        "type": "integer",
    }
    assert health_schema["properties"]["msg"] == {
        "const": "SUCCESS",
        "title": "Msg",
        "type": "string",
    }
    assert health_schema["properties"]["data"] == {"$ref": "#/components/schemas/HealthData"}
    assert schema["components"]["schemas"]["HealthData"]["properties"]["status"] == {
        "const": "ok",
        "title": "Status",
        "type": "string",
    }


def test_registration_documents_stable_error_envelopes_and_retry_header() -> None:
    schema = load_schema()
    operation = schema["paths"]["/api/v1/auth/register"]["post"]
    assert schema["components"]["schemas"]["RegisterRequest"]["properties"]["password"]["writeOnly"] is True

    assert operation["responses"]["201"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/RegisterUserResponse"
    }
    expected_errors = {
        "403": "RegistrationDisabledErrorResponse",
        "409": "AccountIdentifierUnavailableErrorResponse",
        "422": "ValidationErrorResponse",
        "429": "RegistrationRateLimitedErrorResponse",
        "503": "ServiceUnavailableErrorResponse",
    }
    for status_code, model_name in expected_errors.items():
        assert operation["responses"][status_code]["content"]["application/json"]["schema"] == {
            "$ref": f"#/components/schemas/{model_name}"
        }
    assert operation["responses"]["429"]["headers"]["Retry-After"]["schema"] == {
        "minimum": 1,
        "type": "integer",
    }


def test_admin_health_uses_http_bearer_security() -> None:
    schema = load_schema()
    operation = schema["paths"]["/api/admin/v1/health"]["get"]

    assert operation["security"] == [{"HTTPBearer": []}]
    assert schema["components"]["securitySchemes"]["HTTPBearer"] == {
        "scheme": "bearer",
        "type": "http",
    }
    assert operation.get("parameters", []) == []
    unauthorized = operation["responses"]["401"]
    assert unauthorized["headers"]["WWW-Authenticate"]["schema"] == {"type": "string"}
    assert unauthorized["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/UnauthorizedErrorResponse"
    }


def test_openapi_exposes_every_stable_error_code_as_a_literal() -> None:
    schemas = load_schema()["components"]["schemas"]
    expected = {
        "InternalErrorResponse": (-1, "INTERNAL_ERROR"),
        "ValidationErrorResponse": (10001, "VALIDATION_ERROR"),
        "UnauthorizedErrorResponse": (10002, "UNAUTHORIZED"),
        "ForbiddenErrorResponse": (10003, "FORBIDDEN"),
        "NotFoundErrorResponse": (10004, "NOT_FOUND"),
        "ConflictErrorResponse": (10005, "CONFLICT"),
        "RateLimitedErrorResponse": (10006, "RATE_LIMITED"),
        "ServiceUnavailableErrorResponse": (10007, "SERVICE_UNAVAILABLE"),
        "RegistrationDisabledErrorResponse": (11001, "REGISTRATION_DISABLED"),
        "AccountIdentifierUnavailableErrorResponse": (11002, "ACCOUNT_IDENTIFIER_UNAVAILABLE"),
        "RegistrationRateLimitedErrorResponse": (11003, "REGISTRATION_RATE_LIMITED"),
    }

    for model_name, (code, message) in expected.items():
        schema = schemas[model_name]
        assert schema["properties"]["code"]["const"] == code
        assert schema["properties"]["msg"]["const"] == message

    refs = schemas["HTTPErrorResponse"]["anyOf"]
    assert {item["$ref"].rsplit("/", 1)[-1] for item in refs} == set(expected)
