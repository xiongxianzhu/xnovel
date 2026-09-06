export function recordField(record: object, key: string): string {
  const value: unknown = Object.entries(record).find(
    ([name]) => name === key,
  )?.[1];
  return value === undefined || value === null ? "" : String(value);
}
