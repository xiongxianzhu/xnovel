import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

import { DesktopDatabase } from "../src/main/database";
import { LocalSkillService } from "../src/main/skills";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

it("scans local Skills read-only and disables a changed fingerprint", async () => {
  const root = join(process.cwd(), `.test-skills-${Date.now()}`);
  const skillRoot = join(root, "skills");
  const folder = join(skillRoot, "rewrite");
  await mkdir(folder, { recursive: true });
  roots.push(root);
  await writeFile(
    join(folder, "SKILL.md"),
    "---\nname: 改写助手\ndescription: 克制改写\n---\n只提供候选。",
    "utf8",
  );
  const store = await DesktopDatabase.open(join(root, "xnovel.db"));
  const service = new LocalSkillService(
    skillRoot,
    join(process.cwd(), "resources", "unicode", "CaseFolding-17.0.0.txt"),
    store,
  );
  await service.initialize();
  let skills = await service.scan();
  expect(skills[0]?.enabled).toBe(false);
  expect(skills[0]?.status).toBe("ready");
  skills = await service.setEnabled(
    skills[0]!.directoryKey,
    true,
    skills[0]!.contentFingerprint,
  );
  expect(skills[0]?.enabled).toBe(true);
  expect(
    (await service.detail(skills[0]!.directoryKey)).skillMarkdown,
  ).toContain("只提供候选");
  await writeFile(
    join(folder, "SKILL.md"),
    "---\nname: 改写助手\n---\n内容变化。",
    "utf8",
  );
  skills = await service.scan();
  expect(skills[0]?.enabled).toBe(false);
  expect(skills[0]?.status).toBe("changed");
  await expect(service.verified([skills[0]!.directoryKey])).rejects.toThrow(
    "SKILL_NOT_ENABLED",
  );
  store.close();
});

it("rejects a modified Unicode case-folding protocol asset", async () => {
  const root = join(process.cwd(), `.test-skills-asset-${Date.now()}`);
  await mkdir(root, { recursive: true });
  roots.push(root);
  const asset = join(root, "CaseFolding-17.0.0.txt");
  await writeFile(asset, "modified", "utf8");
  const store = await DesktopDatabase.open(join(root, "xnovel.db"));
  const service = new LocalSkillService(join(root, "skills"), asset, store);
  await expect(service.initialize()).rejects.toThrow(
    "CASE_FOLDING_ASSET_INVALID",
  );
  store.close();
});
