import type { DocumentSummary } from "../../shared/api/generated/types.gen";
import {
  buildDocumentTree,
  type DocumentTreeNode,
} from "../documents/documentTree";

export function orderedManuscripts(documents: DocumentSummary[]) {
  const tree = buildDocumentTree(documents);
  if (!tree.ok) return [];
  const result: DocumentSummary[] = [];
  const visit = (nodes: DocumentTreeNode[]) => {
    for (const node of nodes) {
      if (node.document.kind === "manuscript") result.push(node.document);
      visit(node.children);
    }
  };
  visit(tree.roots);
  return result;
}
