"""AI Provider、任务、候选与 Skill API Schema。"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import APIResponse

ProviderProtocol = Literal["openai_chat", "openai_responses", "anthropic", "google"]
ProviderSource = Literal["builtin", "custom"]
AITaskType = Literal["brainstorm", "outline", "rewrite", "expand", "compress", "consistency", "extract_settings"]
AITaskStatus = Literal["queued", "running", "succeeded", "failed", "cancelled"]
SkillStatus = Literal["ready", "quarantined", "deleting"]


class ProviderCatalogItem(BaseModel):
    provider_id: str
    display_name: str
    protocol: ProviderProtocol
    base_url: str
    requires_key: bool = True


class ProviderCatalogData(BaseModel):
    items: list[ProviderCatalogItem]


class ProviderModelInput(BaseModel):
    model_id: str = Field(min_length=1, max_length=200)
    display_name: str = Field(min_length=1, max_length=200)
    context_window: int = Field(gt=0, le=10_000_000)
    max_output_tokens: int = Field(gt=0, le=1_000_000)
    supports_streaming: bool = True
    enabled: bool = True

    @model_validator(mode="after")
    def output_fits_context(self) -> Self:
        if self.max_output_tokens > self.context_window:
            raise ValueError("max_output_tokens must not exceed context_window")
        return self


class ProviderConfigCreateRequest(BaseModel):
    source: ProviderSource
    provider_id: str = Field(pattern=r"^[a-z][a-z0-9-]{1,62}$")
    display_name: str = Field(min_length=1, max_length=200)
    protocol: ProviderProtocol
    base_url: str | None = Field(default=None, max_length=2000)
    api_key: str | None = Field(default=None, min_length=1, max_length=4096, json_schema_extra={"writeOnly": True})
    models: list[ProviderModelInput] = Field(min_length=1, max_length=100)
    default_model_id: str = Field(min_length=1, max_length=200)
    enabled: bool = True

    @model_validator(mode="after")
    def validate_default(self) -> Self:
        matches = [item for item in self.models if item.model_id == self.default_model_id and item.enabled]
        if len(matches) != 1 or len({item.model_id for item in self.models}) != len(self.models):
            raise ValueError("models must be unique and include one enabled default")
        return self


class ProviderConfigUpdateRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=200)
    base_url: str | None = Field(default=None, max_length=2000)
    api_key: str | None = Field(default=None, max_length=4096, json_schema_extra={"writeOnly": True})
    clear_api_key: bool = False
    models: list[ProviderModelInput] = Field(min_length=1, max_length=100)
    default_model_id: str = Field(min_length=1, max_length=200)
    enabled: bool = True

    @model_validator(mode="after")
    def validate_request(self) -> Self:
        if self.api_key and self.clear_api_key:
            raise ValueError("api_key and clear_api_key are mutually exclusive")
        if len({item.model_id for item in self.models}) != len(self.models):
            raise ValueError("models must be unique")
        if not any(item.model_id == self.default_model_id and item.enabled for item in self.models):
            raise ValueError("default model must exist and be enabled")
        return self


class ProviderModelData(BaseModel):
    id: UUID
    model_id: str
    display_name: str
    context_window: int
    max_output_tokens: int
    supports_streaming: bool
    enabled: bool


class ProviderConfigData(BaseModel):
    id: UUID
    source: ProviderSource
    provider_id: str
    display_name: str
    protocol: ProviderProtocol
    base_url: str
    configured: bool
    key_hint: str | None
    unauthenticated_warning: bool
    default_model_id: UUID
    enabled: bool
    models: list[ProviderModelData]
    created_at: datetime
    updated_at: datetime


class ProviderConfigListData(BaseModel):
    page: int
    page_size: int
    total: int
    pages: int
    items: list[ProviderConfigData]


class ProviderConfigDeleteData(BaseModel):
    id: UUID
    deleted: Literal[True]


class ProviderConnectionTestRequest(BaseModel):
    model_id: UUID | None = None


class ProviderConnectionTestData(BaseModel):
    task_id: UUID
    status: AITaskStatus
    input_tokens: int | None
    output_tokens: int | None
    error_code: str | None


class AITaskCreateRequest(BaseModel):
    project_id: UUID
    document_id: UUID | None = None
    provider_config_id: UUID
    model_id: UUID | None = None
    task_type: AITaskType
    instruction: str = Field(min_length=1, max_length=10000)
    selected_text: str | None = Field(default=None, max_length=200000)
    max_output_tokens: int = Field(default=1024, gt=0, le=8192)
    skill_ids: list[UUID] = Field(default_factory=list, max_length=20)

    @field_validator("skill_ids")
    @classmethod
    def unique_skills(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("skill ids must be unique")
        return value


class AIResultData(BaseModel):
    id: UUID
    sequence: int
    content: str
    status: Literal["candidate", "applied", "rejected"]
    applied_document_id: UUID | None
    decided_at: datetime | None


class AITaskData(BaseModel):
    id: UUID
    project_id: UUID | None
    document_id: UUID | None
    task_type: str
    provider: str
    model: str
    context_manifest: dict[str, Any]
    status: AITaskStatus
    error_code: str | None
    error_message: str | None
    input_tokens: int | None
    output_tokens: int | None
    cache_read_tokens: int | None
    reasoning_tokens: int | None
    cancel_requested_at: datetime | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime
    results: list[AIResultData] = Field(default_factory=list)


class AIResultApplyRequest(BaseModel):
    document_id: UUID
    version: int = Field(gt=0)
    content: str = Field(max_length=2_000_000)


class AIResultDecisionData(BaseModel):
    result: AIResultData
    document_version: int | None = None


class SkillVersionData(BaseModel):
    id: UUID
    version_number: int
    source_kind: Literal["upload", "editor"]
    content_sha256: str
    normalized_package_size: int
    uncompressed_size: int
    file_count: int
    validation_summary: dict[str, Any]
    created_at: datetime


class SkillData(BaseModel):
    id: UUID
    name: str
    description: str
    enabled: bool
    status: SkillStatus
    current_version: SkillVersionData
    created_at: datetime
    updated_at: datetime


class SkillListData(BaseModel):
    items: list[SkillData]


class SkillUpdateRequest(BaseModel):
    skill_md_text: str = Field(min_length=1, max_length=1_048_576)
    current_version_id: UUID


class SkillEnabledRequest(BaseModel):
    enabled: bool


class SkillResourceData(BaseModel):
    path: str
    content: str


class SkillDeleteData(BaseModel):
    id: UUID
    deleted: Literal[True]


class AdminSkillData(BaseModel):
    id: UUID
    owner_id: UUID
    name: str
    status: SkillStatus
    enabled: bool
    content_sha256: str
    file_count: int
    uncompressed_size: int
    validation_summary: dict[str, Any]
    updated_at: datetime


class AdminSkillListData(BaseModel):
    items: list[AdminSkillData]


class SkillQuarantineRequest(BaseModel):
    reason_code: str = Field(pattern=r"^[A-Z][A-Z0-9_]{2,63}$")
    note: str | None = Field(default=None, max_length=500)


class ProviderCatalogResponse(APIResponse[ProviderCatalogData]):
    pass


class ProviderConfigResponse(APIResponse[ProviderConfigData]):
    pass


class ProviderConfigDeleteResponse(APIResponse[ProviderConfigDeleteData]):
    pass


class ProviderConfigListResponse(APIResponse[ProviderConfigListData]):
    pass


class ProviderConnectionTestResponse(APIResponse[ProviderConnectionTestData]):
    pass


class AITaskResponse(APIResponse[AITaskData]):
    pass


class AIResultDecisionResponse(APIResponse[AIResultDecisionData]):
    pass


class SkillResponse(APIResponse[SkillData]):
    pass


class SkillListResponse(APIResponse[SkillListData]):
    pass


class SkillResourceResponse(APIResponse[SkillResourceData]):
    pass


class SkillDeleteResponse(APIResponse[SkillDeleteData]):
    pass


class AdminSkillListResponse(APIResponse[AdminSkillListData]):
    pass


class AdminSkillResponse(APIResponse[AdminSkillData]):
    pass
