import { describe, expect, it } from "vitest";
import {
  applySelectionCandidate,
  type SelectionAction,
} from "./selectionAction";

const selection: SelectionAction = {
  documentId: "chapter-1",
  content: "雨落下。她打开信封。窗外很静。",
  start: 4,
  end: 10,
  version: 3,
  task: "rewrite",
};

describe("selection candidate application", () => {
  it("replaces only the selected passage, preserving text on both sides", () => {
    expect(
      applySelectionCandidate(selection, "她拆开了信。", "chapter-1", 3),
    ).toBe("雨落下。她拆开了信。窗外很静。");
  });
  it("rejects a candidate after switching documents even at the same version", () => {
    expect(() =>
      applySelectionCandidate(selection, "候选", "chapter-2", 3),
    ).toThrow("CONTENT_VERSION_CONFLICT");
  });
  it("rejects a candidate when the manuscript version changed", () => {
    expect(() =>
      applySelectionCandidate(selection, "候选", "chapter-1", 4),
    ).toThrow("CONTENT_VERSION_CONFLICT");
  });
});
