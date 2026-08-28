import { describe, expect, it } from "vitest";

import type { DocumentSummary } from "../../shared/api/generated/types.gen";
import { buildDocumentTree, prepareDocumentMove } from "./documentTree";

function document(
  id: string,
  parentId: string | null,
  position: number,
  kind: "folder" | "manuscript" = "manuscript",
): DocumentSummary {
  return {
    created_at: "2026-08-27T00:00:00Z",
    id,
    kind,
    parent_id: parentId,
    position,
    status: "active",
    title: id,
    updated_at: "2026-08-27T00:00:00Z",
  };
}

describe("documentTree", () => {
  it("builds a sorted hierarchy and keeps orphaned nodes visible", () => {
    const result = buildDocumentTree([
      document("child", "folder", 0),
      document("second", null, 1),
      document("folder", null, 0, "folder"),
      document("orphan", "missing", 2),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.roots.map((node) => node.document.id)).toEqual([
      "folder",
      "second",
      "orphan",
    ]);
    expect(result.roots[0]?.children[0]?.document.id).toBe("child");
  });

  it("rejects duplicate ids and cycles", () => {
    expect(
      buildDocumentTree([document("same", null, 0), document("same", null, 1)]),
    ).toEqual({
      ok: false,
      reason: "duplicate",
    });
    expect(
      buildDocumentTree([document("one", "two", 0), document("two", "one", 0)]),
    ).toEqual({
      ok: false,
      reason: "cycle",
    });
  });

  it("prepares complete same-parent and cross-parent reorder groups", () => {
    const documents = [
      document("one", null, 0),
      document("folder", null, 1, "folder"),
      document("two", null, 2),
      document("child", "folder", 0),
    ];
    const sameParent = prepareDocumentMove(documents, "two", null, 0);
    expect(sameParent.payload.groups).toHaveLength(1);
    expect(sameParent.payload.groups[0]?.items.map((item) => item.id)).toEqual([
      "two",
      "one",
      "folder",
    ]);

    const crossParent = prepareDocumentMove(documents, "one", "folder", 1);
    expect(crossParent.payload.groups).toHaveLength(2);
    expect(crossParent.payload.groups[0]?.items.map((item) => item.id)).toEqual(
      ["folder", "two"],
    );
    expect(crossParent.payload.groups[1]?.items.map((item) => item.id)).toEqual(
      ["child", "one"],
    );
    expect(
      crossParent.documents.find((item) => item.id === "one")?.parent_id,
    ).toBe("folder");
  });
});
