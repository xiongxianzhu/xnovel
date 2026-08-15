import axios, { AxiosError, CanceledError, type AxiosResponse } from "axios";
import { describe, expect, it } from "vitest";

import { ApiError, isApiError, toApiError } from "./errors";

function createHttpError(data: unknown, status: number): AxiosError {
  const error = new AxiosError("Request failed");
  error.response = {
    config: { headers: new axios.AxiosHeaders() },
    data,
    headers: {},
    status,
    statusText: "Request failed",
  } as AxiosResponse;
  return error;
}

describe("toApiError", () => {
  it("maps HTTP errors and preserves the service error contract", () => {
    const error = toApiError(
      createHttpError({ code: 10002, msg: "UNAUTHORIZED", data: {} }, 401),
    );

    expect(error).toMatchObject({
      code: 10002,
      kind: "http",
      message: "UNAUTHORIZED",
      status: 401,
    });
  });

  it("does not accept the removed legacy message and string code fields", () => {
    const error = toApiError(
      createHttpError({ code: "AUTH_REQUIRED", message: "legacy" }, 401),
    );

    expect(error).toMatchObject({
      code: undefined,
      message: "API 请求失败（HTTP 401）",
    });
  });

  it("maps network and canceled requests separately", () => {
    expect(toApiError(new AxiosError("Network Error"))).toMatchObject({
      kind: "network",
      message: "无法连接到 API 服务",
    });
    expect(toApiError(new CanceledError())).toMatchObject({
      kind: "canceled",
      message: "请求已取消",
    });
  });

  it("keeps normalized errors stable", () => {
    const error = new ApiError("已归一化", {
      cause: null,
      kind: "unknown",
    });

    expect(toApiError(error)).toBe(error);
    expect(isApiError(error)).toBe(true);
  });
});
