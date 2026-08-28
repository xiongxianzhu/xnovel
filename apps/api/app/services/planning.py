"""人物、世界设定与正文引用服务。"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.exceptions import APIException
from app.models.document import Document
from app.models.planning import Character, DocumentCharacterLink, DocumentWorldEntryLink, WorldEntry
from app.schemas.planning import (
    CharacterCreateRequest,
    CharacterData,
    CharacterListData,
    CharacterReorderRequest,
    CharacterUpdateRequest,
    DocumentReferencesData,
    DocumentReferencesUpdateRequest,
    ResourceDeleteData,
    WorldEntryCreateRequest,
    WorldEntryData,
    WorldEntryListData,
    WorldEntryReorderRequest,
    WorldEntryUpdateRequest,
)
from app.services.projects import (
    _conflict,
    _editable_document,
    _not_found,
    _owned_project,
    _same_timestamp,
    _service_unavailable,
    _touch_project,
)

CONFLICT_PLANNING_CHANGED = "planning_changed"
CONFLICT_WORLD_CYCLE = "world_entry_cycle"
CONFLICT_WORLD_NOT_EMPTY = "world_entry_not_empty"


def _timestamps(value: Character | WorldEntry) -> tuple[datetime, datetime]:
    if value.created_at is None or value.updated_at is None:
        raise _service_unavailable()
    return value.created_at, value.updated_at


def character_data(character: Character) -> CharacterData:
    created_at, updated_at = _timestamps(character)
    return CharacterData(
        id=character.id,
        name=character.name,
        aliases=list(character.aliases),
        summary=character.summary,
        profile=dict(character.profile),
        position=character.position,
        created_at=created_at,
        updated_at=updated_at,
    )


def world_entry_data(entry: WorldEntry) -> WorldEntryData:
    created_at, updated_at = _timestamps(entry)
    return WorldEntryData(
        id=entry.id,
        parent_id=entry.parent_id,
        category=entry.category,
        title=entry.title,
        content=entry.content,
        attributes=dict(entry.attributes),
        position=entry.position,
        created_at=created_at,
        updated_at=updated_at,
    )


async def _active_characters(session: AsyncSession, project_id: UUID, *, lock: bool = False) -> list[Character]:
    statement = (
        select(Character)
        .where(col(Character.project_id) == project_id, col(Character.deleted_at).is_(None))
        .order_by(col(Character.position), col(Character.id))
    )
    if lock:
        statement = statement.with_for_update()
    return list((await session.exec(statement)).all())


async def _active_world_siblings(
    session: AsyncSession,
    project_id: UUID,
    parent_id: UUID | None,
    *,
    lock: bool = False,
) -> list[WorldEntry]:
    parent_filter = col(WorldEntry.parent_id).is_(None) if parent_id is None else col(WorldEntry.parent_id) == parent_id
    statement = (
        select(WorldEntry)
        .where(
            col(WorldEntry.project_id) == project_id,
            col(WorldEntry.deleted_at).is_(None),
            parent_filter,
        )
        .order_by(col(WorldEntry.position), col(WorldEntry.id))
    )
    if lock:
        statement = statement.with_for_update()
    return list((await session.exec(statement)).all())


async def _visible_character(
    session: AsyncSession,
    project_id: UUID,
    character_id: UUID,
    *,
    lock: bool = False,
) -> Character:
    statement = select(Character).where(
        col(Character.id) == character_id,
        col(Character.project_id) == project_id,
        col(Character.deleted_at).is_(None),
    )
    if lock:
        statement = statement.with_for_update()
    character = (await session.exec(statement)).one_or_none()
    if character is None:
        raise _not_found()
    return character


async def _visible_world_entry(
    session: AsyncSession,
    project_id: UUID,
    entry_id: UUID,
    *,
    lock: bool = False,
) -> WorldEntry:
    statement = select(WorldEntry).where(
        col(WorldEntry.id) == entry_id,
        col(WorldEntry.project_id) == project_id,
        col(WorldEntry.deleted_at).is_(None),
    )
    if lock:
        statement = statement.with_for_update()
    entry = (await session.exec(statement)).one_or_none()
    if entry is None:
        raise _not_found()
    return entry


async def list_characters(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
) -> CharacterListData:
    try:
        await _owned_project(session, owner_id=owner_id, project_id=project_id)
        items = await _active_characters(session, project_id)
    except APIException:
        raise
    except SQLAlchemyError as exc:
        raise _service_unavailable() from exc
    return CharacterListData(items=[character_data(item) for item in items])


async def create_character(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    payload: CharacterCreateRequest,
) -> CharacterData:
    try:
        project = await _owned_project(session, owner_id=owner_id, project_id=project_id, lock=True)
        items = await _active_characters(session, project_id, lock=True)
        character = Character(
            project_id=project_id,
            name=payload.name,
            aliases=payload.aliases,
            summary=payload.summary,
            profile=payload.profile,
            position=len(items),
        )
        session.add(character)
        _touch_project(project)
        await session.commit()
        await session.refresh(character)
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    return character_data(character)


async def update_character(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    character_id: UUID,
    payload: CharacterUpdateRequest,
) -> CharacterData:
    try:
        project = await _owned_project(session, owner_id=owner_id, project_id=project_id, lock=True)
        character = await _visible_character(session, project_id, character_id, lock=True)
        now = _touch_project(project)
        for field in ("name", "aliases", "summary", "profile"):
            value = getattr(payload, field)
            if value is not None:
                setattr(character, field, value)
        character.updated_at = now
        session.add(character)
        await session.commit()
        await session.refresh(character)
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    return character_data(character)


async def reorder_characters(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    payload: CharacterReorderRequest,
) -> CharacterListData:
    try:
        project = await _owned_project(session, owner_id=owner_id, project_id=project_id, lock=True)
        current = await _active_characters(session, project_id, lock=True)
        by_id = {item.id: item for item in current}
        submitted_ids = [item.id for item in payload.items]
        if len(submitted_ids) != len(set(submitted_ids)) or set(submitted_ids) != set(by_id):
            raise _conflict(CONFLICT_PLANNING_CHANGED)
        for item in payload.items:
            if not _same_timestamp(by_id[item.id].updated_at, item.updated_at):
                raise _conflict(CONFLICT_PLANNING_CHANGED)
        now = _touch_project(project)
        for position, item in enumerate(payload.items):
            character = by_id[item.id]
            character.position = position
            character.updated_at = now
            session.add(character)
        await session.commit()
        current = await _active_characters(session, project_id)
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    return CharacterListData(items=[character_data(item) for item in current])


async def delete_character(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    character_id: UUID,
) -> ResourceDeleteData:
    try:
        project = await _owned_project(session, owner_id=owner_id, project_id=project_id, lock=True)
        character = await _visible_character(session, project_id, character_id, lock=True)
        now = _touch_project(project)
        character.deleted_at = now
        character.updated_at = now
        links = list(
            (
                await session.exec(
                    select(DocumentCharacterLink).where(
                        col(DocumentCharacterLink.project_id) == project_id,
                        col(DocumentCharacterLink.character_id) == character_id,
                    )
                )
            ).all()
        )
        for link in links:
            await session.delete(link)
        session.add(character)
        await session.flush()
        remaining = await _active_characters(session, project_id, lock=True)
        for position, item in enumerate(remaining):
            if item.position != position:
                item.position = position
                item.updated_at = now
                session.add(item)
        await session.commit()
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    return ResourceDeleteData(id=character_id, deleted=True)


async def list_world_entries(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
) -> WorldEntryListData:
    try:
        await _owned_project(session, owner_id=owner_id, project_id=project_id)
        items = list(
            (
                await session.exec(
                    select(WorldEntry).where(
                        col(WorldEntry.project_id) == project_id,
                        col(WorldEntry.deleted_at).is_(None),
                    )
                )
            ).all()
        )
        items.sort(key=lambda item: (str(item.parent_id or ""), item.position, str(item.id)))
    except APIException:
        raise
    except SQLAlchemyError as exc:
        raise _service_unavailable() from exc
    return WorldEntryListData(items=[world_entry_data(item) for item in items])


async def create_world_entry(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    payload: WorldEntryCreateRequest,
) -> WorldEntryData:
    try:
        project = await _owned_project(session, owner_id=owner_id, project_id=project_id, lock=True)
        if payload.parent_id is not None:
            await _visible_world_entry(session, project_id, payload.parent_id, lock=True)
        siblings = await _active_world_siblings(session, project_id, payload.parent_id, lock=True)
        entry = WorldEntry(
            project_id=project_id,
            parent_id=payload.parent_id,
            category=payload.category,
            title=payload.title,
            content=payload.content,
            attributes=payload.attributes,
            position=len(siblings),
        )
        session.add(entry)
        _touch_project(project)
        await session.commit()
        await session.refresh(entry)
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    return world_entry_data(entry)


async def update_world_entry(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    entry_id: UUID,
    payload: WorldEntryUpdateRequest,
) -> WorldEntryData:
    try:
        project = await _owned_project(session, owner_id=owner_id, project_id=project_id, lock=True)
        entry = await _visible_world_entry(session, project_id, entry_id, lock=True)
        now = _touch_project(project)
        for field in ("category", "title", "content", "attributes"):
            value = getattr(payload, field)
            if value is not None:
                setattr(entry, field, value)
        entry.updated_at = now
        session.add(entry)
        await session.commit()
        await session.refresh(entry)
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    return world_entry_data(entry)


async def _validate_world_parent(
    session: AsyncSession,
    project_id: UUID,
    entry: WorldEntry,
    target_parent_id: UUID | None,
) -> None:
    ancestor_id = target_parent_id
    while ancestor_id is not None:
        if ancestor_id == entry.id:
            raise _conflict(CONFLICT_WORLD_CYCLE)
        ancestor = await _visible_world_entry(session, project_id, ancestor_id, lock=True)
        ancestor_id = ancestor.parent_id


async def reorder_world_entries(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    payload: WorldEntryReorderRequest,
) -> WorldEntryListData:
    try:
        project = await _owned_project(session, owner_id=owner_id, project_id=project_id, lock=True)
        entry = await _visible_world_entry(session, project_id, payload.entry_id, lock=True)
        await _validate_world_parent(session, project_id, entry, payload.target_parent_id)
        source_parent_id = entry.parent_id
        expected_parents = {source_parent_id, payload.target_parent_id}
        groups = {group.parent_id: group for group in payload.groups}
        if len(groups) != len(payload.groups) or set(groups) != expected_parents:
            raise _conflict(CONFLICT_PLANNING_CHANGED)
        source = await _active_world_siblings(session, project_id, source_parent_id, lock=True)
        target = (
            source
            if source_parent_id == payload.target_parent_id
            else await _active_world_siblings(session, project_id, payload.target_parent_id, lock=True)
        )
        by_id = {item.id: item for item in source + target}
        submitted = [item for group in payload.groups for item in group.items]
        submitted_ids = [item.id for item in submitted]
        if len(submitted_ids) != len(set(submitted_ids)) or set(submitted_ids) != set(by_id):
            raise _conflict(CONFLICT_PLANNING_CHANGED)
        for item in submitted:
            if not _same_timestamp(by_id[item.id].updated_at, item.updated_at):
                raise _conflict(CONFLICT_PLANNING_CHANGED)
        source_final = {item.id for item in groups[source_parent_id].items}
        if source_parent_id == payload.target_parent_id:
            if source_final != {item.id for item in source}:
                raise _conflict(CONFLICT_PLANNING_CHANGED)
        else:
            target_final = {item.id for item in groups[payload.target_parent_id].items}
            if source_final != {item.id for item in source if item.id != entry.id}:
                raise _conflict(CONFLICT_PLANNING_CHANGED)
            if target_final != {item.id for item in target} | {entry.id}:
                raise _conflict(CONFLICT_PLANNING_CHANGED)
        if entry.id not in {item.id for item in groups[payload.target_parent_id].items}:
            raise _conflict(CONFLICT_PLANNING_CHANGED)
        now = _touch_project(project)
        for parent_id, group in groups.items():
            for position, item in enumerate(group.items):
                current = by_id[item.id]
                current.parent_id = parent_id
                current.position = position
                current.updated_at = now
                session.add(current)
        await session.commit()
        result = await list_world_entries(session, owner_id=owner_id, project_id=project_id)
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    return result


async def delete_world_entry(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    entry_id: UUID,
) -> ResourceDeleteData:
    try:
        project = await _owned_project(session, owner_id=owner_id, project_id=project_id, lock=True)
        entry = await _visible_world_entry(session, project_id, entry_id, lock=True)
        child_count = int(
            (
                await session.exec(
                    select(func.count())
                    .select_from(WorldEntry)
                    .where(
                        col(WorldEntry.project_id) == project_id,
                        col(WorldEntry.parent_id) == entry_id,
                        col(WorldEntry.deleted_at).is_(None),
                    )
                )
            ).one()
        )
        if child_count:
            raise _conflict(CONFLICT_WORLD_NOT_EMPTY)
        now = _touch_project(project)
        entry.deleted_at = now
        entry.updated_at = now
        links = list(
            (
                await session.exec(
                    select(DocumentWorldEntryLink).where(
                        col(DocumentWorldEntryLink.project_id) == project_id,
                        col(DocumentWorldEntryLink.world_entry_id) == entry_id,
                    )
                )
            ).all()
        )
        for link in links:
            await session.delete(link)
        session.add(entry)
        await session.flush()
        remaining = await _active_world_siblings(session, project_id, entry.parent_id, lock=True)
        for position, item in enumerate(remaining):
            if item.position != position:
                item.position = position
                item.updated_at = now
                session.add(item)
        await session.commit()
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    return ResourceDeleteData(id=entry_id, deleted=True)


async def _referenceable_document(
    session: AsyncSession,
    project_id: UUID,
    document_id: UUID,
    *,
    lock: bool = False,
) -> Document:
    document = await _editable_document(session, project_id=project_id, document_id=document_id, lock=lock)
    if document.kind != "manuscript":
        raise _not_found()
    return document


async def get_document_references(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    document_id: UUID,
) -> DocumentReferencesData:
    try:
        await _owned_project(session, owner_id=owner_id, project_id=project_id)
        document = await _referenceable_document(session, project_id, document_id)
        character_links = list(
            (
                await session.exec(
                    select(DocumentCharacterLink).where(
                        col(DocumentCharacterLink.project_id) == project_id,
                        col(DocumentCharacterLink.document_id) == document_id,
                    )
                )
            ).all()
        )
        world_links = list(
            (
                await session.exec(
                    select(DocumentWorldEntryLink).where(
                        col(DocumentWorldEntryLink.project_id) == project_id,
                        col(DocumentWorldEntryLink.document_id) == document_id,
                    )
                )
            ).all()
        )
        characters = await _active_characters(session, project_id)
        world_entries = list(
            (
                await session.exec(
                    select(WorldEntry)
                    .where(col(WorldEntry.project_id) == project_id, col(WorldEntry.deleted_at).is_(None))
                    .order_by(col(WorldEntry.position), col(WorldEntry.id))
                )
            ).all()
        )
        character_link_ids = {link.character_id for link in character_links}
        world_link_ids = {link.world_entry_id for link in world_links}
        updated_at = document.updated_at
        if updated_at is None:
            raise _service_unavailable()
    except APIException:
        raise
    except SQLAlchemyError as exc:
        raise _service_unavailable() from exc
    return DocumentReferencesData(
        document_id=document_id,
        character_ids=[item.id for item in characters if item.id in character_link_ids],
        world_entry_ids=[item.id for item in world_entries if item.id in world_link_ids],
        updated_at=updated_at,
    )


async def update_document_references(
    session: AsyncSession,
    *,
    owner_id: UUID,
    project_id: UUID,
    document_id: UUID,
    payload: DocumentReferencesUpdateRequest,
) -> DocumentReferencesData:
    try:
        project = await _owned_project(session, owner_id=owner_id, project_id=project_id, lock=True)
        document = await _referenceable_document(session, project_id, document_id, lock=True)
        characters = await _active_characters(session, project_id, lock=True)
        world_entries = list(
            (
                await session.exec(
                    select(WorldEntry)
                    .where(col(WorldEntry.project_id) == project_id, col(WorldEntry.deleted_at).is_(None))
                    .with_for_update()
                )
            ).all()
        )
        if not set(payload.character_ids).issubset({item.id for item in characters}):
            raise _not_found()
        if not set(payload.world_entry_ids).issubset({item.id for item in world_entries}):
            raise _not_found()
        existing_characters = list(
            (
                await session.exec(
                    select(DocumentCharacterLink).where(
                        col(DocumentCharacterLink.project_id) == project_id,
                        col(DocumentCharacterLink.document_id) == document_id,
                    )
                )
            ).all()
        )
        existing_world = list(
            (
                await session.exec(
                    select(DocumentWorldEntryLink).where(
                        col(DocumentWorldEntryLink.project_id) == project_id,
                        col(DocumentWorldEntryLink.document_id) == document_id,
                    )
                )
            ).all()
        )
        desired_characters = set(payload.character_ids)
        desired_world = set(payload.world_entry_ids)
        existing_character_ids = {link.character_id for link in existing_characters}
        existing_world_ids = {link.world_entry_id for link in existing_world}
        for link in existing_characters:
            if link.character_id not in desired_characters:
                await session.delete(link)
        for world_link in existing_world:
            if world_link.world_entry_id not in desired_world:
                await session.delete(world_link)
        for character_id in desired_characters - existing_character_ids:
            session.add(
                DocumentCharacterLink(
                    project_id=project_id,
                    document_id=document_id,
                    character_id=character_id,
                )
            )
        for entry_id in desired_world - existing_world_ids:
            session.add(
                DocumentWorldEntryLink(
                    project_id=project_id,
                    document_id=document_id,
                    world_entry_id=entry_id,
                )
            )
        now = _touch_project(project)
        document.updated_at = now
        session.add(document)
        await session.commit()
    except APIException:
        await session.rollback()
        raise
    except SQLAlchemyError as exc:
        await session.rollback()
        raise _service_unavailable() from exc
    return DocumentReferencesData(
        document_id=document_id,
        character_ids=[item.id for item in characters if item.id in desired_characters],
        world_entry_ids=[item.id for item in world_entries if item.id in desired_world],
        updated_at=now,
    )
