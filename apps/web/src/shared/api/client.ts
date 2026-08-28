import axios, { type AxiosRequestConfig } from "axios";

import { env } from "../config/env";
import { toApiError } from "./errors";
import { createClient } from "./generated/client/client.gen";

let accessToken: string | undefined;
let refreshAccessTokenHandler: (() => Promise<string | null>) | undefined;
const retriedRequests = new WeakSet<object>();

const transport = axios.create({
  baseURL: env.VITE_API_BASE_URL,
  withCredentials: true,
});

transport.interceptors.response.use(undefined, async (error: unknown) => {
  if (
    !axios.isAxiosError(error) ||
    error.response?.status !== 401 ||
    !error.config ||
    !refreshAccessTokenHandler ||
    isAuthenticationRequest(error.config.url) ||
    retriedRequests.has(error.config)
  ) {
    return Promise.reject(error);
  }

  retriedRequests.add(error.config);
  const token = await refreshAccessTokenHandler();
  if (!token) {
    return Promise.reject(error);
  }
  error.config.headers.set("Authorization", `Bearer ${token}`);
  return transport.request(error.config);
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

export function getAccessToken(): string | undefined {
  return accessToken;
}

export function setRefreshAccessTokenHandler(
  handler: (() => Promise<string | null>) | undefined,
): void {
  refreshAccessTokenHandler = handler;
}

export function configureApiClient() {
  return apiClient;
}

function isAuthenticationRequest(url: AxiosRequestConfig["url"]): boolean {
  return (
    typeof url === "string" &&
    ["/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/logout"].some(
      (path) => url.endsWith(path),
    )
  );
}
