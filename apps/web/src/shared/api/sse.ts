import { env } from "../config/env";
import { getAccessToken } from "./client";
import { ApiError } from "./errors";

export async function streamSse(
  path: string,
  onEvent: (event: Record<string, unknown>) => void,
  signal: AbortSignal,
) {
  const token = getAccessToken();
  const response = await fetch(`${env.VITE_API_BASE_URL}${path}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
  if (!response.ok || !response.body) {
    throw new ApiError(`SSE request failed (${response.status})`, {
      cause: response,
      kind: "http",
      status: response.status,
    });
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((item) => item.startsWith("data:"));
      if (!line) continue;
      try {
        const parsed = JSON.parse(line.slice(5).trim());
        if (typeof parsed === "object" && parsed !== null)
          onEvent(parsed as Record<string, unknown>);
      } catch {
        // 无效事件被忽略，任务最终状态仍通过 get task 获取。
      }
    }
  }
}
