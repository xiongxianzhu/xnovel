import {
  createProjectDocument,
  deleteProjectDocument,
  listProjectDocuments,
  reorderProjectDocuments,
  updateProjectDocument,
} from "../../shared/api/generated/sdk.gen";
import type {
  DocumentCreateRequest,
  DocumentDeleteData,
  DocumentListData,
  DocumentReorderRequest,
  DocumentSummary,
  DocumentUpdateRequest,
} from "../../shared/api/generated/types.gen";
import { apiClient } from "../../shared/api/client";

export type DocumentTreeStatus = "active" | "archived" | "all";

export async function listProjectDocumentsRequest(
  projectId: string,
  status: DocumentTreeStatus = "active",
): Promise<DocumentListData> {
  const response = await listProjectDocuments({
    client: apiClient,
    path: { project_id: projectId },
    query: { status },
  });
  return response.data.data;
}

export async function createProjectDocumentRequest(
  projectId: string,
  payload: DocumentCreateRequest,
): Promise<DocumentSummary> {
  const response = await createProjectDocument({
    body: payload,
    client: apiClient,
    path: { project_id: projectId },
  });
  return response.data.data;
}

export async function updateProjectDocumentRequest(
  projectId: string,
  documentId: string,
  payload: DocumentUpdateRequest,
): Promise<DocumentSummary> {
  const response = await updateProjectDocument({
    body: payload,
    client: apiClient,
    path: { project_id: projectId, document_id: documentId },
  });
  return response.data.data;
}

export async function reorderProjectDocumentsRequest(
  projectId: string,
  payload: DocumentReorderRequest,
): Promise<DocumentListData> {
  const response = await reorderProjectDocuments({
    body: payload,
    client: apiClient,
    path: { project_id: projectId },
  });
  return response.data.data;
}

export async function deleteProjectDocumentRequest(
  projectId: string,
  documentId: string,
): Promise<DocumentDeleteData> {
  const response = await deleteProjectDocument({
    client: apiClient,
    path: { project_id: projectId, document_id: documentId },
  });
  return response.data.data;
}
