import {
  deleteSkill,
  getSkillResource,
  listAdminSkills,
  listSkills,
  quarantineSkill,
  releaseSkillQuarantine,
  setSkillEnabled,
  updateSkillMarkdown,
  uploadSkill,
} from "../../shared/api/generated/sdk.gen";
import type {
  AdminSkillData,
  AdminSkillListData,
  SkillData,
  SkillListData,
  SkillResourceData,
} from "../../shared/api/generated/types.gen";
import { apiClient } from "../../shared/api/client";

export async function listSkillsRequest(): Promise<SkillListData> {
  return (await listSkills({ client: apiClient })).data.data;
}

export async function uploadSkillRequest(file: File): Promise<SkillData> {
  return (await uploadSkill({ body: { file }, client: apiClient })).data.data;
}

export async function updateSkillMarkdownRequest(
  skillId: string,
  currentVersionId: string,
  skillMdText: string,
): Promise<SkillData> {
  return (
    await updateSkillMarkdown({
      body: {
        current_version_id: currentVersionId,
        skill_md_text: skillMdText,
      },
      client: apiClient,
      path: { skill_id: skillId },
    })
  ).data.data;
}

export async function setSkillEnabledRequest(
  skillId: string,
  enabled: boolean,
): Promise<SkillData> {
  return (
    await setSkillEnabled({
      body: { enabled },
      client: apiClient,
      path: { skill_id: skillId },
    })
  ).data.data;
}

export async function deleteSkillRequest(skillId: string): Promise<void> {
  await deleteSkill({ client: apiClient, path: { skill_id: skillId } });
}

export async function getSkillResourceRequest(
  skillId: string,
  path: string,
): Promise<SkillResourceData> {
  return (
    await getSkillResource({
      client: apiClient,
      path: { skill_id: skillId },
      query: { path },
    })
  ).data.data;
}

export async function listAdminSkillsRequest(): Promise<AdminSkillListData> {
  return (await listAdminSkills({ client: apiClient })).data.data;
}

export async function quarantineSkillRequest(
  skillId: string,
  reasonCode: string,
  note?: string,
): Promise<AdminSkillData> {
  return (
    await quarantineSkill({
      body: { note: note ?? null, reason_code: reasonCode },
      client: apiClient,
      path: { skill_id: skillId },
    })
  ).data.data;
}

export async function releaseSkillRequest(
  skillId: string,
  reasonCode: string,
): Promise<AdminSkillData> {
  return (
    await releaseSkillQuarantine({
      body: { note: null, reason_code: reasonCode },
      client: apiClient,
      path: { skill_id: skillId },
    })
  ).data.data;
}
