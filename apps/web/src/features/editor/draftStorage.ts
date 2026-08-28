import { z } from "zod";

const DRAFT_PREFIX = "xnovel:editor-draft:v1";

const draftSchema = z.object({
  baseVersion: z.number().int().positive(),
  content: z.string(),
  savedAt: z.string(),
});

export type EditorDraft = z.infer<typeof draftSchema>;

function draftKey(userId: string, projectId: string, documentId: string) {
  return `${DRAFT_PREFIX}:${userId}:${projectId}:${documentId}`;
}

export function loadEditorDraft(
  userId: string,
  projectId: string,
  documentId: string,
): EditorDraft | null {
  try {
    const value = sessionStorage.getItem(
      draftKey(userId, projectId, documentId),
    );
    if (!value) return null;
    const result = draftSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function saveEditorDraft(
  userId: string,
  projectId: string,
  documentId: string,
  draft: EditorDraft,
) {
  try {
    sessionStorage.setItem(
      draftKey(userId, projectId, documentId),
      JSON.stringify(draft),
    );
  } catch {
    // 浏览器拒绝存储时，编辑器内存中的正文仍保持可用。
  }
}

export function removeEditorDraft(
  userId: string,
  projectId: string,
  documentId: string,
) {
  try {
    sessionStorage.removeItem(draftKey(userId, projectId, documentId));
  } catch {
    // 清理失败不影响服务端已保存正文。
  }
}
