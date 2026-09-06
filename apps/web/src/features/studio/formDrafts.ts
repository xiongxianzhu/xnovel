export function readFormDraft(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
export function clearFormDraft(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* A local cleanup failure must not turn a successful server save into a failure. */
  }
}
export function parseFormDraft(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
