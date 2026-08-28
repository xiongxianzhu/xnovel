import type {
  CharacterData,
  CharacterReorderRequest,
  WorldEntryData,
  WorldEntryReorderRequest,
} from "../../shared/api/generated/types.gen";

export type FlatWorldEntry = WorldEntryData & { depth: number };

export function flattenWorldEntries(
  entries: WorldEntryData[],
): FlatWorldEntry[] {
  const byParent = new Map<string | null, WorldEntryData[]>();
  for (const entry of entries) {
    const siblings = byParent.get(entry.parent_id) ?? [];
    siblings.push(entry);
    byParent.set(entry.parent_id, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort(
      (a, b) => a.position - b.position || a.id.localeCompare(b.id),
    );
  }
  const result: FlatWorldEntry[] = [];
  const visited = new Set<string>();
  function visit(parentId: string | null, depth: number) {
    for (const entry of byParent.get(parentId) ?? []) {
      if (visited.has(entry.id)) continue;
      visited.add(entry.id);
      result.push({ ...entry, depth });
      visit(entry.id, depth + 1);
    }
  }
  visit(null, 0);
  for (const entry of entries) {
    if (!visited.has(entry.id)) result.push({ ...entry, depth: 0 });
  }
  return result;
}

export function prepareCharacterMove(
  characters: CharacterData[],
  characterId: string,
  targetIndex: number,
): CharacterReorderRequest {
  const ordered = [...characters].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );
  const currentIndex = ordered.findIndex((item) => item.id === characterId);
  if (currentIndex < 0) throw new Error("character not found");
  const [moving] = ordered.splice(currentIndex, 1);
  ordered.splice(
    Math.max(0, Math.min(targetIndex, ordered.length)),
    0,
    moving!,
  );
  return { items: ordered.map(({ id, updated_at }) => ({ id, updated_at })) };
}

export function worldDescendants(
  entries: WorldEntryData[],
  entryId: string,
): Set<string> {
  const result = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of entries) {
      if (
        entry.parent_id &&
        (entry.parent_id === entryId || result.has(entry.parent_id)) &&
        !result.has(entry.id)
      ) {
        result.add(entry.id);
        changed = true;
      }
    }
  }
  return result;
}

export function prepareWorldMove(
  entries: WorldEntryData[],
  entryId: string,
  targetParentId: string | null,
  targetIndex: number,
): WorldEntryReorderRequest {
  const moving = entries.find((entry) => entry.id === entryId);
  if (!moving) throw new Error("world entry not found");
  const sorted = (parentId: string | null) =>
    entries
      .filter((entry) => entry.parent_id === parentId && entry.id !== entryId)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const source = sorted(moving.parent_id);
  const target =
    moving.parent_id === targetParentId ? source : sorted(targetParentId);
  target.splice(Math.max(0, Math.min(targetIndex, target.length)), 0, moving);
  const groups =
    moving.parent_id === targetParentId
      ? [{ parent_id: targetParentId, items: target }]
      : [
          { parent_id: moving.parent_id, items: source },
          { parent_id: targetParentId, items: target },
        ];
  return {
    entry_id: entryId,
    target_parent_id: targetParentId,
    groups: groups.map((group) => ({
      parent_id: group.parent_id,
      items: group.items.map(({ id, updated_at }) => ({ id, updated_at })),
    })),
  };
}
