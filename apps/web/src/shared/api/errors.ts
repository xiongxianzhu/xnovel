import axios from "axios";

export type ApiErrorKind = "canceled" | "http" | "network" | "unknown";

type ErrorBody = Record<string, unknown>;

interface ApiErrorOptions {
  cause: unknown;
  code?: number;
  data?: unknown;
  kind: ApiErrorKind;
  status?: number;
}

export class ApiError extends Error {
  readonly code?: number;
  override readonly cause: unknown;
  readonly data?: unknown;
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(message: string, options: ApiErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.cause = options.cause;
    this.code = options.code;
    this.data = options.data;
    this.kind = options.kind;
    this.status = options.status;
  }
}

function asErrorBody(value: unknown): ErrorBody | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as ErrorBody;
}

function readCode(body: ErrorBody | undefined): number | undefined {
  const code = body?.code;
  return typeof code === "number" ? code : undefined;
}

function readMessage(body: ErrorBody | undefined): string | undefined {
  const message = body?.msg;
  return typeof message === "string" && message.trim() ? message : undefined;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) {
    return error;
  }

  if (axios.isCancel(error)) {
    return new ApiError("请求已取消", {
      cause: error,
      kind: "canceled",
    });
  }

  if (axios.isAxiosError(error)) {
    const data: unknown = error.response?.data;
    const body = asErrorBody(data);
    const status = error.response?.status;

    return new ApiError(
      readMessage(body) ??
        (status ? `API 请求失败（HTTP ${status}）` : "无法连接到 API 服务"),
      {
        cause: error,
        code: readCode(body),
        data,
        kind: status ? "http" : "network",
        status,
      },
    );
  }

  return new ApiError(error instanceof Error ? error.message : "发生未知错误", {
    cause: error,
    kind: "unknown",
  });
}
