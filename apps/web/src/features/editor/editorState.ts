export function documentContentQueryKey(projectId: string, documentId: string) {
  return ["projects", projectId, "documents", documentId, "content"] as const;
}

export function estimateDocumentWords(content: string): number {
  let count = 0;
  let insideWord = false;
  for (const character of content) {
    const codepoint = character.codePointAt(0) ?? 0;
    const isCjk =
      (codepoint >= 0x3400 && codepoint <= 0x4dbf) ||
      (codepoint >= 0x4e00 && codepoint <= 0x9fff) ||
      (codepoint >= 0xf900 && codepoint <= 0xfaff) ||
      (codepoint >= 0x20000 && codepoint <= 0x2ebef);
    if (isCjk) {
      count += 1;
      insideWord = false;
    } else if (/^[\p{L}\p{N}]$/u.test(character)) {
      if (!insideWord) count += 1;
      insideWord = true;
    } else {
      insideWord = false;
    }
  }
  return count;
}
