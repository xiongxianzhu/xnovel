import { describe, expect, it } from "vitest";

import { estimateDocumentWords } from "./editorState";

describe("estimateDocumentWords", () => {
  it("matches the API counting contract", () => {
    expect(estimateDocumentWords("")).toBe(0);
    expect(estimateDocumentWords("第一章 Hello world 123!")).toBe(6);
    expect(estimateDocumentWords("café déjà-vu")).toBe(3);
    expect(estimateDocumentWords("标点，。！？")).toBe(2);
  });
});
