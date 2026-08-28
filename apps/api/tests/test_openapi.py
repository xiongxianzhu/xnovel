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
    schemas = schema["components"]["schemas"]
    assert schemas["LoginRequest"]["properties"]["password"]["writeOnly"] is True
    assert "writeOnly" not in schemas["AuthTokenData"]["properties"]["access_token"]
    assert "writeOnly" not in schemas["RefreshTokenData"]["properties"]["access_token"]


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
        "$ref": "#/components/schemas/AuthenticationErrorResponse"
    }
    assert operation["responses"]["403"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ForbiddenErrorResponse"
    }
    assert operation["responses"]["503"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ServiceUnavailableErrorResponse"
    }


def test_t107_operations_expose_precise_errors_and_binary_media() -> None:
    schema = load_schema()
    paths = schema["paths"]

    operations = {
        ("post", "/api/v1/auth/login"): {"200", "401", "422", "429", "503", "default"},
        ("post", "/api/v1/auth/refresh"): {"200", "401", "403", "503", "default"},
        ("post", "/api/v1/auth/logout"): {"200", "403", "503", "default"},
        ("get", "/api/v1/users/me"): {"200", "401", "503", "default"},
        ("patch", "/api/v1/users/me"): {"200", "401", "409", "422", "503", "default"},
        ("put", "/api/v1/users/me/password"): {"200", "401", "422", "503", "default"},
        ("post", "/api/v1/users/me/avatar"): {"200", "401", "413", "422", "503", "default"},
        ("put", "/api/v1/users/me/avatar-url"): {"200", "401", "422", "503", "default"},
        ("delete", "/api/v1/users/me/avatar"): {"200", "401", "503", "default"},
        ("get", "/api/v1/site-settings/public"): {"200", "503", "default"},
        ("get", "/api/v1/users/me/preferences"): {"200", "401", "503", "default"},
        ("patch", "/api/v1/users/me/preferences"): {"200", "401", "422", "503", "default"},
        ("post", "/api/admin/v1/site-settings/logo"): {
            "200",
            "401",
            "403",
            "413",
            "422",
            "503",
            "default",
        },
        ("delete", "/api/admin/v1/site-settings/logo"): {"200", "401", "403", "503", "default"},
    }
    for (method, path), expected_statuses in operations.items():
        responses = paths[path][method]["responses"]
        assert set(responses) == expected_statuses
        if "401" in responses:
            assert responses["401"]["headers"]["WWW-Authenticate"]["schema"] == {"type": "string"}

    login_responses = paths["/api/v1/auth/login"]["post"]["responses"]
    assert login_responses["401"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/InvalidCredentialsErrorResponse"
    }
    assert login_responses["422"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ValidationErrorResponse"
    }
    assert login_responses["429"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/LoginRateLimitedErrorResponse"
    }

    profile_responses = paths["/api/v1/users/me"]["patch"]["responses"]
    assert profile_responses["401"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/AuthenticationErrorResponse"
    }
    assert profile_responses["422"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ProfileValidationErrorResponse"
    }

    media_responses = paths["/api/v1/media/{storage_key}"]["get"]["responses"]
    assert set(media_responses) == {"200", "404", "422", "default"}
    assert set(media_responses["200"]["content"]) == {"image/jpeg", "image/png", "image/webp"}
    for content in media_responses["200"]["content"].values():
        assert content["schema"] == {"type": "string", "format": "binary"}
    assert media_responses["404"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/NotFoundErrorResponse"
    }

    preference_update = schema["components"]["schemas"]["UpdateUserPreferenceRequest"]
    branches = {item["$ref"].rsplit("/", 1)[-1] for item in preference_update["anyOf"]}
    assert branches == {
        "UpdateLocalePreferenceRequest",
        "UpdateThemeModePreferenceRequest",
        "UpdateThemePalettePreferenceRequest",
    }
    required_by_branch = {
        "UpdateLocalePreferenceRequest": "locale",
        "UpdateThemeModePreferenceRequest": "theme_mode",
        "UpdateThemePalettePreferenceRequest": "theme_palette",
    }
    for model_name, required_field in required_by_branch.items():
        model = schema["components"]["schemas"][model_name]
        assert model["required"] == [required_field]
        for field in model["properties"].values():
            assert field["type"] == "string"
            assert "null" not in field.get("enum", [])


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
        "InvalidCredentialsErrorResponse": (11004, "INVALID_CREDENTIALS"),
        "LoginRateLimitedErrorResponse": (11005, "LOGIN_RATE_LIMITED"),
        "SessionInvalidErrorResponse": (11006, "SESSION_INVALID"),
        "CurrentPasswordInvalidErrorResponse": (11007, "CURRENT_PASSWORD_INVALID"),
        "MediaInvalidErrorResponse": (12001, "MEDIA_INVALID"),
        "MediaTooLargeErrorResponse": (12002, "MEDIA_TOO_LARGE"),
    }

    for model_name, (code, message) in expected.items():
        schema = schemas[model_name]
        assert schema["properties"]["code"]["const"] == code
        assert schema["properties"]["msg"]["const"] == message

    refs = schemas["HTTPErrorResponse"]["anyOf"]
    assert {item["$ref"].rsplit("/", 1)[-1] for item in refs} == set(expected)


def test_t202_document_tree_contract_is_complete() -> None:
    schema = load_schema()
    paths = schema["paths"]
    collection = paths["/api/v1/projects/{project_id}/documents"]
    item = paths["/api/v1/projects/{project_id}/documents/{document_id}"]
    reorder = paths["/api/v1/projects/{project_id}/documents/reorder"]["post"]

    assert collection["get"]["operationId"] == "listProjectDocuments"
    assert collection["post"]["operationId"] == "createProjectDocument"
    assert item["patch"]["operationId"] == "updateProjectDocument"
    assert item["delete"]["operationId"] == "deleteProjectDocument"
    assert reorder["operationId"] == "reorderProjectDocuments"

    for operation in (collection["post"], item["patch"], item["delete"], reorder):
        assert set(operation["responses"]) == {"200", "401", "404", "409", "422", "503", "default"} or set(
            operation["responses"]
        ) == {"201", "401", "404", "409", "422", "503", "default"}
        assert operation["responses"]["409"]["content"]["application/json"]["schema"] == {
            "$ref": "#/components/schemas/ConflictErrorResponse"
        }

    create_kind = schema["components"]["schemas"]["DocumentCreateRequest"]["properties"]["kind"]
    assert create_kind["enum"] == ["folder", "manuscript", "outline"]
    status_parameter = next(parameter for parameter in collection["get"]["parameters"] if parameter["name"] == "status")
    assert status_parameter["schema"]["enum"] == ["active", "archived", "all"]


def test_t203_document_content_contract_is_complete() -> None:
    schema = load_schema()
    operations = schema["paths"]["/api/v1/projects/{project_id}/documents/{document_id}/content"]
    read = operations["get"]
    save = operations["put"]

    assert read["operationId"] == "getProjectDocumentContent"
    assert save["operationId"] == "saveProjectDocumentContent"
    assert set(read["responses"]) == {"200", "401", "404", "422", "503", "default"}
    assert set(save["responses"]) == {"200", "401", "404", "409", "422", "503", "default"}
    assert save["responses"]["409"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ConflictErrorResponse"
    }
    request = schema["components"]["schemas"]["DocumentContentUpdateRequest"]
    assert set(request["required"]) == {"content", "content_format", "version"}
    assert request["properties"]["content_format"]["const"] == "plain_text"
    assert request["properties"]["version"]["minimum"] == 1


def test_phase3_planning_reference_and_export_contracts_are_complete() -> None:
    schema = load_schema()
    paths = schema["paths"]
    operations = {
        ("get", "/api/v1/projects/{project_id}/characters"): "listProjectCharacters",
        ("post", "/api/v1/projects/{project_id}/characters"): "createProjectCharacter",
        ("post", "/api/v1/projects/{project_id}/characters/reorder"): "reorderProjectCharacters",
        ("patch", "/api/v1/projects/{project_id}/characters/{character_id}"): "updateProjectCharacter",
        ("delete", "/api/v1/projects/{project_id}/characters/{character_id}"): "deleteProjectCharacter",
        ("get", "/api/v1/projects/{project_id}/world-entries"): "listProjectWorldEntries",
        ("post", "/api/v1/projects/{project_id}/world-entries"): "createProjectWorldEntry",
        ("post", "/api/v1/projects/{project_id}/world-entries/reorder"): "reorderProjectWorldEntries",
        ("patch", "/api/v1/projects/{project_id}/world-entries/{entry_id}"): "updateProjectWorldEntry",
        ("delete", "/api/v1/projects/{project_id}/world-entries/{entry_id}"): "deleteProjectWorldEntry",
        ("get", "/api/v1/projects/{project_id}/documents/{document_id}/references"): "getProjectDocumentReferences",
        ("put", "/api/v1/projects/{project_id}/documents/{document_id}/references"): "updateProjectDocumentReferences",
        ("get", "/api/v1/projects/{project_id}/export"): "exportProject",
    }
    for (method, path), operation_id in operations.items():
        assert paths[path][method]["operationId"] == operation_id

    export = paths["/api/v1/projects/{project_id}/export"]["get"]
    success_content = export["responses"]["200"]["content"]
    assert set(success_content) == {"text/markdown", "text/plain"}
    format_parameter = next(parameter for parameter in export["parameters"] if parameter["name"] == "format")
    assert format_parameter["schema"]["default"] == "markdown"
    assert format_parameter["schema"]["enum"] == ["markdown", "plain_text"]

    references = schema["components"]["schemas"]["DocumentReferencesUpdateRequest"]
    assert references["properties"]["character_ids"]["maxItems"] == 500
    assert references["properties"]["world_entry_ids"]["maxItems"] == 500
