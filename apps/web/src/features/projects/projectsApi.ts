import {
  createProject,
  getProject,
  listProjects,
} from "../../shared/api/generated/sdk.gen";
import type {
  ProjectCreateRequest,
  ProjectDetailData,
  ProjectListData,
} from "../../shared/api/generated/types.gen";
import { apiClient } from "../../shared/api/client";

export async function listProjectsRequest(): Promise<ProjectListData> {
  const response = await listProjects({
    client: apiClient,
    query: { page: 1, page_size: 100 },
  });
  return response.data.data;
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
