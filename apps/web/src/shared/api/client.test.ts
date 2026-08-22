import { AxiosError, type AxiosRequestConfig, type AxiosResponse } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  apiClient,
  configureApiClient,
  setAccessToken,
  setRefreshAccessTokenHandler,
} from "./client";
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
  setRefreshAccessTokenHandler(undefined);
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

  it("refreshes once and retries a protected request with the new token", async () => {
    let attempts = 0;
    let retriedAuthorization: string | undefined;
    const refresh = vi.fn().mockResolvedValue("renewed-token");
    setAccessToken("expired-token");
    setRefreshAccessTokenHandler(refresh);
    apiClient.instance.defaults.adapter = async (config) => {
      attempts += 1;
      if (attempts === 1) {
        throw new AxiosError(
          "unauthorized",
          "ERR_BAD_REQUEST",
          config,
          undefined,
          {
            config,
            data: { code: 11006, data: {}, msg: "SESSION_INVALID" },
            headers: {},
            status: 401,
            statusText: "Unauthorized",
          },
        );
      }
      retriedAuthorization = config.headers.get("Authorization")?.toString();
      return {
        config,
        data: { code: 0, data: { status: "ok" }, msg: "SUCCESS" },
        headers: {},
        status: 200,
        statusText: "OK",
      } as AxiosResponse;
    };

    await getAdminHealth({ client: apiClient });

    expect(refresh).toHaveBeenCalledOnce();
    expect(attempts).toBe(2);
    expect(retriedAuthorization).toBe("Bearer renewed-token");
  });
});
