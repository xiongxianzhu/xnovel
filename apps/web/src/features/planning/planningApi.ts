import {
  createProjectCharacter,
  createProjectWorldEntry,
  deleteProjectCharacter,
  deleteProjectWorldEntry,
  exportProject,
  getProjectDocumentReferences,
  listProjectCharacters,
  listProjectWorldEntries,
  reorderProjectCharacters,
  reorderProjectWorldEntries,
  updateProjectCharacter,
  updateProjectDocumentReferences,
  updateProjectWorldEntry,
} from "../../shared/api/generated/sdk.gen";
import type {
  CharacterCreateRequest,
  CharacterData,
  CharacterListData,
  CharacterReorderRequest,
  CharacterUpdateRequest,
  DocumentReferencesData,
  DocumentReferencesUpdateRequest,
  ResourceDeleteData,
  WorldEntryCreateRequest,
  WorldEntryData,
  WorldEntryListData,
  WorldEntryReorderRequest,
  WorldEntryUpdateRequest,
} from "../../shared/api/generated/types.gen";
import { apiClient } from "../../shared/api/client";

export type ProjectExportFormat = "markdown" | "plain_text";

export async function listCharactersRequest(
  projectId: string,
): Promise<CharacterListData> {
  const response = await listProjectCharacters({
    client: apiClient,
    path: { project_id: projectId },
  });
  return response.data.data;
}

export async function createCharacterRequest(
  projectId: string,
  payload: CharacterCreateRequest,
): Promise<CharacterData> {
  const response = await createProjectCharacter({
    body: payload,
    client: apiClient,
    path: { project_id: projectId },
  });
  return response.data.data;
}

export async function updateCharacterRequest(
  projectId: string,
  characterId: string,
  payload: CharacterUpdateRequest,
): Promise<CharacterData> {
  const response = await updateProjectCharacter({
    body: payload,
    client: apiClient,
    path: { project_id: projectId, character_id: characterId },
  });
  return response.data.data;
}

export async function reorderCharactersRequest(
  projectId: string,
  payload: CharacterReorderRequest,
): Promise<CharacterListData> {
  const response = await reorderProjectCharacters({
    body: payload,
    client: apiClient,
    path: { project_id: projectId },
  });
  return response.data.data;
}

export async function deleteCharacterRequest(
  projectId: string,
  characterId: string,
): Promise<ResourceDeleteData> {
  const response = await deleteProjectCharacter({
    client: apiClient,
    path: { project_id: projectId, character_id: characterId },
  });
  return response.data.data;
}

export async function listWorldEntriesRequest(
  projectId: string,
): Promise<WorldEntryListData> {
  const response = await listProjectWorldEntries({
    client: apiClient,
    path: { project_id: projectId },
  });
  return response.data.data;
}

export async function createWorldEntryRequest(
  projectId: string,
  payload: WorldEntryCreateRequest,
): Promise<WorldEntryData> {
  const response = await createProjectWorldEntry({
    body: payload,
    client: apiClient,
    path: { project_id: projectId },
  });
  return response.data.data;
}

export async function updateWorldEntryRequest(
  projectId: string,
  entryId: string,
  payload: WorldEntryUpdateRequest,
): Promise<WorldEntryData> {
  const response = await updateProjectWorldEntry({
    body: payload,
    client: apiClient,
    path: { project_id: projectId, entry_id: entryId },
  });
  return response.data.data;
}

export async function reorderWorldEntriesRequest(
  projectId: string,
  payload: WorldEntryReorderRequest,
): Promise<WorldEntryListData> {
  const response = await reorderProjectWorldEntries({
    body: payload,
    client: apiClient,
    path: { project_id: projectId },
  });
  return response.data.data;
}

export async function deleteWorldEntryRequest(
  projectId: string,
  entryId: string,
): Promise<ResourceDeleteData> {
  const response = await deleteProjectWorldEntry({
    client: apiClient,
    path: { project_id: projectId, entry_id: entryId },
  });
  return response.data.data;
}

export async function getDocumentReferencesRequest(
  projectId: string,
  documentId: string,
): Promise<DocumentReferencesData> {
  const response = await getProjectDocumentReferences({
    client: apiClient,
    path: { project_id: projectId, document_id: documentId },
  });
  return response.data.data;
}

export async function updateDocumentReferencesRequest(
  projectId: string,
  documentId: string,
  payload: DocumentReferencesUpdateRequest,
): Promise<DocumentReferencesData> {
  const response = await updateProjectDocumentReferences({
    body: payload,
    client: apiClient,
    path: { project_id: projectId, document_id: documentId },
  });
  return response.data.data;
}

export async function exportProjectRequest(
  projectId: string,
  format: ProjectExportFormat,
): Promise<{ content: string; filename: string }> {
  const response = await exportProject({
    client: apiClient,
    path: { project_id: projectId },
    query: { format },
  });
  const disposition = String(response.headers["content-disposition"] ?? "");
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const fallback = format === "markdown" ? "xnovel.md" : "xnovel.txt";
  return {
    content: response.data,
    filename: encoded ? decodeURIComponent(encoded) : fallback,
  };
}
