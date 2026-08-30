import { env } from "../config/env";

export function resolveMediaUrl(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  return new URL(value, env.VITE_API_BASE_URL).toString();
}
