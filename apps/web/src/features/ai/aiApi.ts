import {
  applyAiResult,
  cancelAiTask,
  createAiProviderConfig,
  createAiTask,
  deleteAiProviderConfig,
  getAiProviderCatalog,
  getAiProviderConfig,
  getAiTask,
  listAiProviderConfigs,
  rejectAiResult,
  testAiProviderConnection,
  updateAiProviderConfig,
} from "../../shared/api/generated/sdk.gen";
import type {
  AiResultApplyRequest,
  AiResultDecisionData,
  AiTaskCreateRequest,
  AiTaskData,
  ProviderCatalogData,
  ProviderConfigCreateRequestWritable,
  ProviderConfigData,
  ProviderConfigListData,
  ProviderConfigUpdateRequestWritable,
  ProviderConnectionTestData,
} from "../../shared/api/generated/types.gen";
import { apiClient } from "../../shared/api/client";

export async function getProviderCatalogRequest(): Promise<ProviderCatalogData> {
  return (await getAiProviderCatalog({ client: apiClient })).data.data;
}

export async function listProviderConfigsRequest(
  page = 1,
  pageSize = 50,
  query = "",
): Promise<ProviderConfigListData> {
  return (
    await listAiProviderConfigs({
      client: apiClient,
      query: { page, page_size: pageSize, q: query || undefined },
    })
  ).data.data;
}

export async function deleteProviderConfigRequest(
  configId: string,
): Promise<void> {
  await deleteAiProviderConfig({
    client: apiClient,
    path: { config_id: configId },
  });
}

export async function createProviderConfigRequest(
  payload: ProviderConfigCreateRequestWritable,
): Promise<ProviderConfigData> {
  return (await createAiProviderConfig({ body: payload, client: apiClient }))
    .data.data;
}

export async function getProviderConfigRequest(
  configId: string,
): Promise<ProviderConfigData> {
  return (
    await getAiProviderConfig({
      client: apiClient,
      path: { config_id: configId },
    })
  ).data.data;
}

export async function updateProviderConfigRequest(
  configId: string,
  payload: ProviderConfigUpdateRequestWritable,
): Promise<ProviderConfigData> {
  return (
    await updateAiProviderConfig({
      body: payload,
      client: apiClient,
      path: { config_id: configId },
    })
  ).data.data;
}

export async function testProviderConnectionRequest(
  configId: string,
  modelId?: string,
): Promise<ProviderConnectionTestData> {
  return (
    await testAiProviderConnection({
      body: { model_id: modelId ?? null },
      client: apiClient,
      path: { config_id: configId },
    })
  ).data.data;
}

export async function createAiTaskRequest(
  payload: AiTaskCreateRequest,
): Promise<AiTaskData> {
  return (await createAiTask({ body: payload, client: apiClient })).data.data;
}

export async function getAiTaskRequest(taskId: string): Promise<AiTaskData> {
  return (await getAiTask({ client: apiClient, path: { task_id: taskId } }))
    .data.data;
}

export async function cancelAiTaskRequest(taskId: string): Promise<AiTaskData> {
  return (await cancelAiTask({ client: apiClient, path: { task_id: taskId } }))
    .data.data;
}

export async function applyAiResultRequest(
  resultId: string,
  payload: AiResultApplyRequest,
): Promise<AiResultDecisionData> {
  return (
    await applyAiResult({
      body: payload,
      client: apiClient,
      path: { result_id: resultId },
    })
  ).data.data;
}

export async function rejectAiResultRequest(
  resultId: string,
): Promise<AiResultDecisionData> {
  return (
    await rejectAiResult({ client: apiClient, path: { result_id: resultId } })
  ).data.data;
}
