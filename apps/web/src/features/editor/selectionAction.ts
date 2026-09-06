export type SelectionAction = {
  documentId: string;
  content: string;
  start: number;
  end: number;
  version: number;
  task: "rewrite" | "expand" | "compress";
};

export function applySelectionCandidate(
  selection: SelectionAction,
  candidate: string,
  documentId: string,
  version: number,
) {
  if (selection.documentId !== documentId || selection.version !== version) {
    throw new Error("CONTENT_VERSION_CONFLICT");
  }
  return (
    selection.content.slice(0, selection.start) +
    candidate +
    selection.content.slice(selection.end)
  );
}
