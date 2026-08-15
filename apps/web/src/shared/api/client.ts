import axios from "axios";

import { env } from "../config/env";
import { toApiError } from "./errors";
import { createClient } from "./generated/client/client.gen";

let accessToken: string | undefined;

const transport = axios.create({
  baseURL: env.VITE_API_BASE_URL,
  withCredentials: true,
});

transport.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(toApiError(error)),
);

export const apiClient = createClient({
  auth: () => accessToken,
  axios: transport,
  baseURL: env.VITE_API_BASE_URL,
  throwOnError: true,
  withCredentials: true,
});

export function setAccessToken(token: string | null | undefined): void {
  accessToken = token?.trim() || undefined;
}

export function configureApiClient() {
  return apiClient;
}
