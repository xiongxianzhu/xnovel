import {
  deleteCurrentUserAvatar,
  setCurrentUserAvatarUrl,
  updateCurrentUserProfile,
  uploadCurrentUserAvatar,
} from "../../shared/api/generated/sdk.gen";
import type {
  AvatarData,
  UpdateProfileRequestWritable,
  UserProfileData,
} from "../../shared/api/generated/types.gen";
import { apiClient } from "../../shared/api/client";

export async function updateProfileRequest(
  payload: UpdateProfileRequestWritable,
): Promise<UserProfileData> {
  const response = await updateCurrentUserProfile({
    body: payload,
    client: apiClient,
  });
  return response.data.data;
}

export async function uploadAvatarRequest(file: File): Promise<AvatarData> {
  const response = await uploadCurrentUserAvatar({
    body: { file },
    client: apiClient,
  });
  return response.data.data;
}

export async function setAvatarUrlRequest(url: string): Promise<AvatarData> {
  const response = await setCurrentUserAvatarUrl({
    body: { url },
    client: apiClient,
  });
  return response.data.data;
}

export async function deleteAvatarRequest(): Promise<AvatarData> {
  const response = await deleteCurrentUserAvatar({ client: apiClient });
  return response.data.data;
}
