import {
  getProjectDocumentContent,
  saveProjectDocumentContent,
} from "../../shared/api/generated/sdk.gen";
import type {
  DocumentContentData,
  DocumentContentUpdateRequest,
} from "../../shared/api/generated/types.gen";
import { apiClient } from "../../shared/api/client";

export async function getDocumentContentRequest(
  projectId: string,
  documentId: string,
): Promise<DocumentContentData> {
  const response = await getProjectDocumentContent({
    client: apiClient,
    path: { project_id: projectId, document_id: documentId },
  });
  return response.data.data;
}

export async function saveDocumentContentRequest(
  projectId: string,
  documentId: string,
  payload: DocumentContentUpdateRequest,
): Promise<DocumentContentData> {
  const response = await saveProjectDocumentContent({
    body: payload,
    client: apiClient,
    path: { project_id: projectId, document_id: documentId },
  });
  return response.data.data;
}
