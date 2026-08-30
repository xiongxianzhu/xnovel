import {
  createProject,
  deleteProject,
  deleteProjectCover,
  getProject,
  listProjects,
  restoreProject,
  updateProject,
  uploadProjectCover,
} from "../../shared/api/generated/sdk.gen";
import type {
  ProjectCreateRequest,
  ProjectDetailData,
  ProjectListData,
  ProjectSummary,
  ProjectUpdateRequest,
} from "../../shared/api/generated/types.gen";
import { apiClient } from "../../shared/api/client";

export async function listProjectsRequest(
  view: "active" | "archived" | "deleted" = "active",
  page = 1,
  pageSize = 50,
  query = "",
  updateStatus?: ProjectSummary["update_status"],
): Promise<ProjectListData> {
  const response = await listProjects({
    client: apiClient,
    query: {
      page,
      page_size: pageSize,
      q: query || undefined,
      update_status: updateStatus,
      view,
    },
  });
  return response.data.data;
}

export async function updateProjectRequest(
  projectId: string,
  payload: ProjectUpdateRequest,
): Promise<ProjectDetailData> {
  const response = await updateProject({
    body: payload,
    client: apiClient,
    path: { project_id: projectId },
  });
  return response.data.data;
}

export async function deleteProjectRequest(projectId: string): Promise<void> {
  await deleteProject({ client: apiClient, path: { project_id: projectId } });
}

export async function restoreProjectRequest(
  projectId: string,
): Promise<ProjectDetailData> {
  const response = await restoreProject({
    client: apiClient,
    path: { project_id: projectId },
  });
  return response.data.data;
}

export async function uploadProjectCoverRequest(
  projectId: string,
  file: File,
): Promise<string | null> {
  const response = await uploadProjectCover({
    body: { file },
    client: apiClient,
    path: { project_id: projectId },
  });
  return response.data.data.url;
}

export async function deleteProjectCoverRequest(
  projectId: string,
): Promise<void> {
  await deleteProjectCover({
    client: apiClient,
    path: { project_id: projectId },
  });
}

export async function createProjectRequest(
  payload: ProjectCreateRequest,
): Promise<ProjectDetailData> {
  const response = await createProject({ body: payload, client: apiClient });
  return response.data.data;
}

export async function getProjectRequest(
  projectId: string,
): Promise<ProjectDetailData> {
  const response = await getProject({
    client: apiClient,
    path: { project_id: projectId },
  });
  return response.data.data;
}
