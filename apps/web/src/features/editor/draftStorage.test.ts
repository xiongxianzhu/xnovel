import { beforeEach, describe, expect, it } from "vitest";

import {
  loadEditorDraft,
  removeEditorDraft,
  saveEditorDraft,
} from "./draftStorage";

describe("draftStorage", () => {
  beforeEach(() => sessionStorage.clear());

  it("isolates drafts by user, project, and document", () => {
    saveEditorDraft("user-1", "project-1", "document-1", {
      baseVersion: 2,
      content: "未保存正文",
      savedAt: "2026-08-27T00:00:00Z",
    });

    expect(loadEditorDraft("user-1", "project-1", "document-1")?.content).toBe(
      "未保存正文",
    );
    expect(loadEditorDraft("user-2", "project-1", "document-1")).toBeNull();
    removeEditorDraft("user-1", "project-1", "document-1");
    expect(loadEditorDraft("user-1", "project-1", "document-1")).toBeNull();
  });

  it("rejects malformed stored values", () => {
    sessionStorage.setItem(
      "xnovel:editor-draft:v1:user-1:project-1:document-1",
      JSON.stringify({ baseVersion: 0, content: 12 }),
    );
    expect(loadEditorDraft("user-1", "project-1", "document-1")).toBeNull();
  });
});
