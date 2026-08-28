import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

import { CredentialStore } from "../src/main/credentials";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

it("persists only encrypted credential bytes and can rotate by reference", async () => {
  const root = join(process.cwd(), `.test-credentials-${Date.now()}`);
  await mkdir(root);
  roots.push(root);
  const path = join(root, "credentials.v1.json");
  const store = new CredentialStore(path, {
    available: () => true,
    encrypt: (value) => Buffer.from([...value].reverse().join("")),
    decrypt: (value) => [...value.toString()].reverse().join(""),
  });
  const id = await store.put("secret-value");
  expect(await store.get(id)).toBe("secret-value");
  expect(await readFile(path, "utf8")).not.toContain("secret-value");
  await store.remove(id);
  await expect(store.get(id)).rejects.toThrow("CREDENTIAL_NOT_FOUND");
});
