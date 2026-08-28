import type {
  DocumentReorderRequest,
  DocumentSummary,
} from "../../shared/api/generated/types.gen";

export type DocumentTreeNode = {
  children: DocumentTreeNode[];
  document: DocumentSummary;
};

export type DocumentTreeResult =
  | { ok: true; roots: DocumentTreeNode[] }
  | { ok: false; reason: "duplicate" | "cycle" };

function compareDocuments(left: DocumentSummary, right: DocumentSummary) {
  return left.position - right.position || left.id.localeCompare(right.id);
}

export function buildDocumentTree(
  documents: DocumentSummary[],
): DocumentTreeResult {
  const byId = new Map<string, DocumentSummary>();
  for (const document of documents) {
    if (byId.has(document.id)) {
      return { ok: false, reason: "duplicate" };
    }
    byId.set(document.id, document);
  }

  const visitState = new Map<string, "visiting" | "visited">();
  function visit(id: string): boolean {
    const state = visitState.get(id);
    if (state === "visiting") return false;
    if (state === "visited") return true;
    visitState.set(id, "visiting");
    const parentId = byId.get(id)?.parent_id;
    if (parentId && byId.has(parentId) && !visit(parentId)) return false;
    visitState.set(id, "visited");
    return true;
  }
  if ([...byId.keys()].some((id) => !visit(id))) {
    return { ok: false, reason: "cycle" };
  }

  const childrenByParent = new Map<string | null, DocumentSummary[]>();
  for (const document of documents) {
    const parentId = document.parent_id;
    const effectiveParent = parentId && byId.has(parentId) ? parentId : null;
    const siblings = childrenByParent.get(effectiveParent) ?? [];
    siblings.push(document);
    childrenByParent.set(effectiveParent, siblings);
  }

  function makeNodes(parentId: string | null): DocumentTreeNode[] {
    return (childrenByParent.get(parentId) ?? [])
      .sort(compareDocuments)
      .map((document) => ({
        children: makeNodes(document.id),
        document,
      }));
  }

  return { ok: true, roots: makeNodes(null) };
}

export function descendantsOf(
  documents: DocumentSummary[],
  documentId: string,
): Set<string> {
  const descendants = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const document of documents) {
      if (
        document.parent_id &&
        (document.parent_id === documentId ||
          descendants.has(document.parent_id)) &&
        !descendants.has(document.id)
      ) {
        descendants.add(document.id);
        changed = true;
      }
    }
  }
  return descendants;
}

function siblingsOf(
  documents: DocumentSummary[],
  parentId: string | null,
): DocumentSummary[] {
  return documents
    .filter((document) => document.parent_id === parentId)
    .sort(compareDocuments);
}

export function prepareDocumentMove(
  documents: DocumentSummary[],
  documentId: string,
  targetParentId: string | null,
  targetIndex: number,
): { documents: DocumentSummary[]; payload: DocumentReorderRequest } {
  const moving = documents.find((document) => document.id === documentId);
  if (!moving) throw new Error("document not found");
  const sourceParentId = moving.parent_id;
  const source = siblingsOf(documents, sourceParentId).filter(
    (document) => document.id !== documentId,
  );
  const targetBase =
    sourceParentId === targetParentId
      ? source
      : siblingsOf(documents, targetParentId).filter(
          (document) => document.id !== documentId,
        );
  const insertionIndex = Math.max(0, Math.min(targetIndex, targetBase.length));
  const target = [...targetBase];
  target.splice(insertionIndex, 0, moving);
  const groups =
    sourceParentId === targetParentId
      ? [{ parent_id: targetParentId, items: target }]
      : [
          { parent_id: sourceParentId, items: source },
          { parent_id: targetParentId, items: target },
        ];
  const changedIds = new Set(
    groups.flatMap((group) => group.items.map((item) => item.id)),
  );
  const changedById = new Map<string, DocumentSummary>();
  for (const group of groups) {
    group.items.forEach((document, position) => {
      changedById.set(document.id, {
        ...document,
        parent_id: group.parent_id,
        position,
      });
    });
  }

  return {
    documents: documents.map((document) =>
      changedIds.has(document.id)
        ? (changedById.get(document.id) ?? document)
        : document,
    ),
    payload: {
      document_id: documentId,
      target_parent_id: targetParentId,
      groups: groups.map((group) => ({
        parent_id: group.parent_id,
        items: group.items.map((document) => ({
          id: document.id,
          updated_at: document.updated_at,
        })),
      })),
    },
  };
}
