import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient, configureApiClient, setAccessToken } from "./client";
import { getAdminHealth, getHealth } from "./generated/sdk.gen";

const originalAdapter = apiClient.instance.defaults.adapter;

function useRecordingAdapter() {
  let request: AxiosRequestConfig | undefined;

  apiClient.instance.defaults.adapter = async (config) => {
    request = config;
    return {
      config,
      data: { status: "ok" },
      headers: {},
      status: 200,
      statusText: "OK",
    } as AxiosResponse;
  };

  return () => request;
}

afterEach(() => {
  apiClient.instance.defaults.adapter = originalAdapter;
  setAccessToken(undefined);
  vi.unstubAllGlobals();
});

describe("configureApiClient", () => {
  it("initializes the shared client once with the public API base URL", () => {
    expect(configureApiClient()).toBe(apiClient);
    expect(apiClient.getConfig()).toMatchObject({
      baseURL: "http://127.0.0.1:8000",
      withCredentials: true,
    });
    expect(apiClient.instance.defaults.auth).toBeUndefined();
  });

  it("adds a Bearer token only to protected operations", async () => {
    const getRequest = useRecordingAdapter();
    setAccessToken("test-access-token");

    await getAdminHealth({ client: apiClient });
    expect(getRequest()?.auth).toBeUndefined();
    expect(getRequest()?.headers?.Authorization).toBe(
      "Bearer test-access-token",
    );

    await getHealth({ client: apiClient });
    expect(getRequest()?.headers?.Authorization).toBeUndefined();
  });

  it("preserves Bearer auth through Axios' fetch adapter", async () => {
    let authorization: string | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      authorization = request.headers.get("Authorization");
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    apiClient.instance.defaults.adapter = "fetch";
    setAccessToken("test-access-token");

    await getAdminHealth({ client: apiClient });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(authorization).toBe("Bearer test-access-token");
  });
});
