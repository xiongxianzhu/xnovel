"""规划、设定、引用与导出 Schema。"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import APIResponse

WorldCategory = Literal["location", "faction", "item", "rule", "event", "other"]
ExportFormat = Literal["markdown", "plain_text"]


def _normalize_title(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("value must not be empty")
    return normalized


def _validate_string_map(value: dict[str, str]) -> dict[str, str]:
    if len(value) > 50:
        raise ValueError("map must contain at most 50 entries")
    result: dict[str, str] = {}
    for raw_key, raw_value in value.items():
        key = raw_key.strip()
        if not key or len(key) > 100 or len(raw_value) > 2000:
            raise ValueError("map keys or values exceed limits")
        result[key] = raw_value
    return result


class CharacterCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    aliases: list[str] = Field(default_factory=list, max_length=20)
    summary: str = Field(default="", max_length=5000)
    profile: dict[str, str] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return _normalize_title(value)

    @field_validator("aliases")
    @classmethod
    def normalize_aliases(cls, value: list[str]) -> list[str]:
        aliases: list[str] = []
        seen: set[str] = set()
        for raw_alias in value:
            alias = raw_alias.strip()
            if not alias or len(alias) > 100:
                raise ValueError("aliases must contain non-empty values up to 100 characters")
            if alias not in seen:
                aliases.append(alias)
                seen.add(alias)
        return aliases

    @field_validator("profile")
    @classmethod
    def validate_profile(cls, value: dict[str, str]) -> dict[str, str]:
        return _validate_string_map(value)


class CharacterUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    aliases: list[str] | None = Field(default=None, max_length=20)
    summary: str | None = Field(default=None, max_length=5000)
    profile: dict[str, str] | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return None if value is None else _normalize_title(value)

    @field_validator("aliases")
    @classmethod
    def normalize_aliases(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        return CharacterCreateRequest.normalize_aliases(value)

    @field_validator("profile")
    @classmethod
    def validate_profile(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        return None if value is None else _validate_string_map(value)

    @model_validator(mode="after")
    def require_change(self) -> Self:
        if all(value is None for value in (self.name, self.aliases, self.summary, self.profile)):
            raise ValueError("at least one field must be provided")
        return self


class CharacterData(BaseModel):
    id: UUID
    name: str
    aliases: list[str]
    summary: str
    profile: dict[str, str]
    position: int
    created_at: datetime
    updated_at: datetime


class CharacterListData(BaseModel):
    items: list[CharacterData]


class OrderedResourceItem(BaseModel):
    id: UUID
    updated_at: datetime


class CharacterReorderRequest(BaseModel):
    items: list[OrderedResourceItem] = Field(min_length=1)


class WorldEntryCreateRequest(BaseModel):
    parent_id: UUID | None = None
    category: WorldCategory = "other"
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(default="", max_length=50000)
    attributes: dict[str, str] = Field(default_factory=dict)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return _normalize_title(value)

    @field_validator("attributes")
    @classmethod
    def validate_attributes(cls, value: dict[str, str]) -> dict[str, str]:
        return _validate_string_map(value)


class WorldEntryUpdateRequest(BaseModel):
    category: WorldCategory | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, max_length=50000)
    attributes: dict[str, str] | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str | None:
        return None if value is None else _normalize_title(value)

    @field_validator("attributes")
    @classmethod
    def validate_attributes(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        return None if value is None else _validate_string_map(value)

    @model_validator(mode="after")
    def require_change(self) -> Self:
        if all(value is None for value in (self.category, self.title, self.content, self.attributes)):
            raise ValueError("at least one field must be provided")
        return self


class WorldEntryData(BaseModel):
    id: UUID
    parent_id: UUID | None
    category: WorldCategory
    title: str
    content: str
    attributes: dict[str, str]
    position: int
    created_at: datetime
    updated_at: datetime


class WorldEntryListData(BaseModel):
    items: list[WorldEntryData]


class WorldEntryReorderGroup(BaseModel):
    parent_id: UUID | None
    items: list[OrderedResourceItem]


class WorldEntryReorderRequest(BaseModel):
    entry_id: UUID
    target_parent_id: UUID | None
    groups: list[WorldEntryReorderGroup] = Field(min_length=1, max_length=2)


class ResourceDeleteData(BaseModel):
    id: UUID
    deleted: Literal[True]


class DocumentReferencesData(BaseModel):
    document_id: UUID
    character_ids: list[UUID]
    world_entry_ids: list[UUID]
    updated_at: datetime


class DocumentReferencesUpdateRequest(BaseModel):
    character_ids: list[UUID] = Field(default_factory=list, max_length=500)
    world_entry_ids: list[UUID] = Field(default_factory=list, max_length=500)

    @field_validator("character_ids", "world_entry_ids")
    @classmethod
    def reject_duplicates(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("reference ids must be unique")
        return value


class CharacterListResponse(APIResponse[CharacterListData]):
    pass


class CharacterResponse(APIResponse[CharacterData]):
    pass


class WorldEntryListResponse(APIResponse[WorldEntryListData]):
    pass


class WorldEntryResponse(APIResponse[WorldEntryData]):
    pass


class ResourceDeleteResponse(APIResponse[ResourceDeleteData]):
    pass


class DocumentReferencesResponse(APIResponse[DocumentReferencesData]):
    pass
