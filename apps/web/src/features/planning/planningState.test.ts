import { describe, expect, it } from "vitest";

import type {
  CharacterData,
  WorldEntryData,
} from "../../shared/api/generated/types.gen";
import {
  flattenWorldEntries,
  prepareCharacterMove,
  prepareWorldMove,
} from "./planningState";

const time = "2026-08-28T00:00:00Z";
const character = (id: string, position: number): CharacterData => ({
  aliases: [],
  created_at: time,
  id,
  name: id,
  position,
  profile: {},
  summary: "",
  updated_at: time,
});
const world = (
  id: string,
  parentId: string | null,
  position: number,
): WorldEntryData => ({
  attributes: {},
  category: "other",
  content: "",
  created_at: time,
  id,
  parent_id: parentId,
  position,
  title: id,
  updated_at: time,
});

describe("planningState", () => {
  it("reorders the complete character list", () => {
    const result = prepareCharacterMove(
      [character("one", 0), character("two", 1)],
      "two",
      0,
    );
    expect(result.items.map((item) => item.id)).toEqual(["two", "one"]);
  });

  it("flattens world hierarchy and prepares cross-parent moves", () => {
    const entries = [
      world("root", null, 0),
      world("child", "root", 0),
      world("other", null, 1),
    ];
    expect(
      flattenWorldEntries(entries).map((item) => [item.id, item.depth]),
    ).toEqual([
      ["root", 0],
      ["child", 1],
      ["other", 0],
    ]);
    const move = prepareWorldMove(entries, "other", "root", 1);
    expect(move.groups[0]?.items.map((item) => item.id)).toEqual(["root"]);
    expect(move.groups[1]?.items.map((item) => item.id)).toEqual([
      "child",
      "other",
    ]);
  });
});
