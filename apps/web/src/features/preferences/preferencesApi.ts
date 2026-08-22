import {
  getCurrentUserPreferences,
  updateCurrentUserPreferences,
} from "../../shared/api/generated/sdk.gen";
import type {
  UpdateUserPreferenceRequest,
  UserPreferenceData,
} from "../../shared/api/generated/types.gen";
import { apiClient } from "../../shared/api/client";

export async function getPreferencesRequest(): Promise<UserPreferenceData> {
  const response = await getCurrentUserPreferences({ client: apiClient });
  return response.data.data;
}

export async function updatePreferencesRequest(
  payload: UpdateUserPreferenceRequest,
): Promise<UserPreferenceData> {
  const response = await updateCurrentUserPreferences({
    body: payload,
    client: apiClient,
  });
  return response.data.data;
}
