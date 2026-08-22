import {
  changeCurrentUserPassword,
  getCurrentUserProfile,
  login,
  logout,
  refreshSession,
} from "../../shared/api/generated/sdk.gen";
import type {
  AuthenticatedUserData,
  ChangePasswordRequest,
  LoginRequestWritable,
  PasswordChangedData,
  UserProfileData,
} from "../../shared/api/generated/types.gen";
import { apiClient } from "../../shared/api/client";

let refreshPromise: Promise<string> | undefined;

export async function loginRequest(
  payload: LoginRequestWritable,
): Promise<{ accessToken: string; user: AuthenticatedUserData }> {
  const response = await login({ body: payload, client: apiClient });
  return {
    accessToken: response.data.data.access_token,
    user: response.data.data.user,
  };
}

export function refreshAccessToken(): Promise<string> {
  refreshPromise ??= refreshSession({ client: apiClient })
    .then((response) => response.data.data.access_token)
    .finally(() => {
      refreshPromise = undefined;
    });
  return refreshPromise;
}

export async function getProfileRequest(): Promise<UserProfileData> {
  const response = await getCurrentUserProfile({ client: apiClient });
  return response.data.data;
}

export async function logoutRequest(): Promise<void> {
  await logout({ client: apiClient });
}

export async function changePasswordRequest(
  payload: ChangePasswordRequest,
): Promise<PasswordChangedData> {
  const response = await changeCurrentUserPassword({
    body: payload,
    client: apiClient,
  });
  return response.data.data;
}
