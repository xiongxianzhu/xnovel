import { apiClient } from "../../shared/api/client";
import {
  deleteSiteLogo,
  getPublicSiteSettings,
  updateSiteSettings,
  uploadSiteLogo,
} from "../../shared/api/generated/sdk.gen";

export async function getSiteSettingsRequest() {
  const response = await getPublicSiteSettings({ client: apiClient });
  return response.data.data;
}

export async function updateSiteNameRequest(siteName: string) {
  const response = await updateSiteSettings({
    client: apiClient,
    body: { site_name: siteName },
  });
  return response.data.data;
}

export async function uploadSiteLogoRequest(file: File) {
  const response = await uploadSiteLogo({ client: apiClient, body: { file } });
  return response.data.data;
}

export async function deleteSiteLogoRequest() {
  const response = await deleteSiteLogo({ client: apiClient });
  return response.data.data;
}
