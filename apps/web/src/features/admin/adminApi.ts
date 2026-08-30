import {
  createAdminUser,
  disableAdminUser,
  listAdminLoginAudits,
  listAdminOperationAudits,
  listAdminUsers,
  updateAdminUser,
} from "../../shared/api/generated/sdk.gen";
import type {
  AdminUserCreateRequestWritable,
  AdminUserData,
  AdminUserListData,
  AdminUserUpdateRequest,
  LoginAuditListData,
  OperationAuditListData,
} from "../../shared/api/generated/types.gen";
import { apiClient } from "../../shared/api/client";

export type UserFilters = {
  limit: number;
  offset: number;
  query?: string;
  role?: "user" | "admin";
  status?: "active" | "disabled";
};

export async function listUsersRequest(
  filters: UserFilters,
): Promise<AdminUserListData> {
  return (await listAdminUsers({ client: apiClient, query: filters })).data
    .data;
}

export async function createUserRequest(
  payload: AdminUserCreateRequestWritable,
): Promise<AdminUserData> {
  return (await createAdminUser({ body: payload, client: apiClient })).data
    .data;
}

export async function updateUserRequest(
  userId: string,
  payload: AdminUserUpdateRequest,
): Promise<AdminUserData> {
  return (
    await updateAdminUser({
      body: payload,
      client: apiClient,
      path: { user_id: userId },
    })
  ).data.data;
}

export async function disableUserRequest(
  userId: string,
): Promise<AdminUserData> {
  return (
    await disableAdminUser({
      client: apiClient,
      path: { user_id: userId },
    })
  ).data.data;
}

export async function listLoginAuditsRequest(filters: {
  limit: number;
  offset: number;
  query?: string;
}): Promise<LoginAuditListData> {
  return (await listAdminLoginAudits({ client: apiClient, query: filters }))
    .data.data;
}

export async function listOperationAuditsRequest(filters: {
  action?: string;
  limit: number;
  offset: number;
}): Promise<OperationAuditListData> {
  return (await listAdminOperationAudits({ client: apiClient, query: filters }))
    .data.data;
}
