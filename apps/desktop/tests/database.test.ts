import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import {
  DESKTOP_MIGRATIONS,
  DesktopDatabase,
  SCHEMA_COMMENTS,
} from "../src/main/database";

const roots: string[] = [];
async function workspace() {
  const root = join(
    process.cwd(),
    `.test-db-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  await mkdir(root);
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("DesktopDatabase", () => {
  it("persists the offline create-write-reopen flow with optimistic locking", async () => {
    const root = await workspace();
    const path = join(root, "xnovel.db");
    let store = await DesktopDatabase.open(path, join(root, "backups"));
    const created = store.createProject("雾城");
    const saved = store.saveContent(created.document.id, "第一章 雨落。", 1);
    expect(saved.version).toBe(2);
    expect(saved.wordCount).toBe(5);
    expect(() => store.saveContent(created.document.id, "过期", 1)).toThrow(
      "CONTENT_VERSION_CONFLICT",
    );
    store.close();
    store = await DesktopDatabase.open(path, join(root, "backups"));
    expect(store.listProjects()[0]?.title).toBe("雾城");
    expect(store.getContent(created.document.id).content).toBe("第一章 雨落。");
    expect(
      (
        store.db
          .prepare("SELECT COUNT(*) AS count FROM document_revisions")
          .get() as { count: number }
      ).count,
    ).toBe(1);
    store.close();
  });

  it("backs up before an upgrade and rolls back a failing migration", async () => {
    const root = await workspace();
    const path = join(root, "xnovel.db");
    const backups = join(root, "backups");
    let store = await DesktopDatabase.open(
      path,
      backups,
      DESKTOP_MIGRATIONS.slice(0, 1),
    );
    store.createProject("上一稳定版");
    store.close();
    store = await DesktopDatabase.open(path, backups);
    expect(
      (
        store.db
          .prepare("SELECT MAX(version) AS version FROM schema_migrations")
          .get() as { version: number }
      ).version,
    ).toBe(3);
    expect((await readdir(backups)).length).toBeGreaterThan(0);
    store.close();
    await expect(
      DesktopDatabase.open(path, backups, [
        ...DESKTOP_MIGRATIONS,
        { version: 4, destructive: true, sql: "CREATE TABLE broken (" },
      ]),
    ).rejects.toThrow();
    const raw = new DatabaseSync(path);
    expect(
      (
        raw
          .prepare("SELECT MAX(version) AS version FROM schema_migrations")
          .get() as { version: number }
      ).version,
    ).toBe(3);
    expect(
      (
        raw.prepare("SELECT COUNT(*) AS count FROM projects").get() as {
          count: number;
        }
      ).count,
    ).toBe(1);
    raw.close();
  });

  it("restores the latest verified backup and preserves a pre-restore snapshot", async () => {
    const root = await workspace();
    const path = join(root, "xnovel.db");
    const backups = join(root, "backups");
    let store = await DesktopDatabase.open(path, backups);
    const created = store.createProject("恢复测试");
    store.saveContent(created.document.id, "备份中的正文", 1);
    await store.createBackup(backups);
    store.saveContent(created.document.id, "恢复前的新正文", 2);
    expect(await store.restoreLatestBackup(backups)).toBe(true);
    store = await DesktopDatabase.open(path, backups);
    expect(store.getContent(created.document.id).content).toBe("备份中的正文");
    expect((await readdir(backups)).length).toBeGreaterThanOrEqual(2);
    store.close();
  });

  it("keeps Chinese metadata comments for every persistent table and column", async () => {
    const root = await workspace();
    const store = await DesktopDatabase.open(join(root, "xnovel.db"));
    for (const [table, metadata] of Object.entries(SCHEMA_COMMENTS)) {
      expect(metadata.table.length).toBeGreaterThan(0);
      const columns = (
        store.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
          name: string;
        }>
      )
        .map((item) => item.name)
        .sort();
      expect(Object.keys(metadata.columns).sort()).toEqual(columns);
      expect(Object.values(metadata.columns).every(Boolean)).toBe(true);
    }
    store.close();
  });

  it("applies or rejects AI candidates only through an explicit decision", async () => {
    const root = await workspace();
    const store = await DesktopDatabase.open(join(root, "xnovel.db"));
    const created = store.createProject("候选测试");
    const provider = store.saveProvider(
      {
        displayName: "模型",
        protocol: "openai_chat",
        baseUrl: "https://api.example.com/v1",
        model: "model-1",
      },
      "credential-1",
    );
    const taskId = store.createAiTask({
      projectId: created.project.id,
      documentId: created.document.id,
      providerId: provider.id,
      instruction: "改写",
      contextManifest: {
        document_id: created.document.id,
        document_version: 1,
      },
    });
    const candidate = store.finishAiTask(taskId, "新的正文");
    expect(store.getContent(created.document.id).content).toBe("");
    expect(
      store.decideAiResult({
        resultId: candidate.resultId,
        decision: "apply",
        documentId: created.document.id,
        version: 1,
      }).status,
    ).toBe("applied");
    expect(store.getContent(created.document.id).content).toBe("新的正文");
    expect(() =>
      store.decideAiResult({
        resultId: candidate.resultId,
        decision: "reject",
        documentId: created.document.id,
      }),
    ).toThrow("AI_RESULT_ALREADY_DECIDED");

    const staleTaskId = store.createAiTask({
      projectId: created.project.id,
      documentId: created.document.id,
      providerId: provider.id,
      instruction: "再次改写",
      contextManifest: {
        document_id: created.document.id,
        document_version: 2,
      },
    });
    const staleCandidate = store.finishAiTask(staleTaskId, "过期候选");
    store.saveContent(created.document.id, "作者的新正文", 2);
    expect(() =>
      store.decideAiResult({
        resultId: staleCandidate.resultId,
        decision: "apply",
        documentId: created.document.id,
        version: 3,
      }),
    ).toThrow("CONTENT_VERSION_CONFLICT");
    store.close();
  });

  it("persists recoverable drafts and manages a multi-document tree", async () => {
    const root = await workspace();
    const store = await DesktopDatabase.open(join(root, "xnovel.db"));
    const created = store.createProject("长篇");
    const folder = store.createDocument({
      projectId: created.project.id,
      parentId: null,
      title: "第一卷",
      kind: "folder",
    });
    const chapter = store.createDocument({
      projectId: created.project.id,
      parentId: folder.id,
      title: "第一章",
      kind: "manuscript",
    });
    store.saveEditorDraft(chapter.id, "尚未保存", 1);
    expect(store.getEditorDraft(chapter.id)?.content).toBe("尚未保存");
    expect(() => store.moveDocument(folder.id, folder.id, 0)).toThrow(
      "DOCUMENT_CYCLE",
    );
    expect(store.listDocuments(created.project.id)).toHaveLength(3);
    store.setDocumentArchived(chapter.id, true);
    expect(store.listDocuments(created.project.id, "archived")[0]?.id).toBe(
      chapter.id,
    );
    store.setDocumentArchived(chapter.id, false);
    store.removeEditorDraft(chapter.id);
    expect(store.getEditorDraft(chapter.id)).toBeNull();
    store.close();
  });
});
