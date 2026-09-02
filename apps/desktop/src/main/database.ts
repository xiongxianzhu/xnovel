import { copyFile, mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { v7 as uuidv7 } from "uuid";
import { themeModes, themePalettes } from "@xnovel/theme";

import type {
  AiCandidate,
  DesktopContent,
  DesktopDocument,
  DesktopDraft,
  DesktopPreferences,
  DesktopProject,
  ProviderInput,
  ProviderSummary,
  ThemeMode,
  ThemePalette,
} from "../shared/contracts";

export const SCHEMA_COMMENTS = {
  schema_migrations: {
    table: "桌面独立数据库迁移记录",
    columns: {
      version: "已应用迁移版本",
      applied_at: "应用时间",
      created_at: "创建时间",
      updated_at: "更新时间",
    },
  },
  projects: {
    table: "本地小说作品",
    columns: {
      id: "UUID v7 主键",
      title: "作品标题",
      created_at: "创建时间",
      updated_at: "更新时间",
    },
  },
  documents: {
    table: "本地作品文档树",
    columns: {
      id: "UUID v7 主键",
      project_id: "所属作品",
      parent_id: "父文件夹",
      title: "文档标题",
      kind: "文档类型",
      position: "同级顺序",
      deleted_at: "软删除时间",
      created_at: "创建时间",
      updated_at: "更新时间",
    },
  },
  document_contents: {
    table: "本地正文当前版本",
    columns: {
      document_id: "文档主键",
      content: "正文内容",
      version: "乐观锁版本",
      word_count: "正文估算字数",
      created_at: "创建时间",
      updated_at: "更新时间",
    },
  },
  app_settings: {
    table: "桌面应用设置",
    columns: {
      id: "固定单例主键",
      theme_palette: "主题家族",
      theme_mode: "显示模式",
      created_at: "创建时间",
      updated_at: "更新时间",
    },
  },
  local_skill_preferences: {
    table: "本地 Skill 启用偏好",
    columns: {
      directory_key: "规范化一级目录键",
      directory_name: "展示目录名",
      enabled: "是否允许任务选择",
      content_fingerprint: "最近确认的内容指纹",
      created_at: "创建时间",
      updated_at: "更新时间",
    },
  },
  ai_provider_configs: {
    table: "桌面 AI Provider 非敏感配置",
    columns: {
      id: "UUID v7 主键",
      display_name: "显示名称",
      protocol: "固定协议",
      base_url: "服务地址",
      model: "模型标识",
      credential_ref: "独立凭据文件引用",
      created_at: "创建时间",
      updated_at: "更新时间",
    },
  },
  ai_tasks: {
    table: "桌面 AI 任务元数据",
    columns: {
      id: "UUID v7 主键",
      project_id: "作品引用",
      document_id: "文档引用",
      provider_config_id: "Provider 引用",
      instruction: "用户指令",
      context_manifest: "不含正文的上下文快照",
      status: "任务状态",
      error_code: "脱敏错误码",
      created_at: "创建时间",
      updated_at: "更新时间",
    },
  },
  ai_results: {
    table: "桌面 AI 候选及作者决策",
    columns: {
      id: "UUID v7 主键",
      task_id: "所属任务",
      content: "候选内容",
      status: "候选、已应用或已舍弃",
      applied_document_id: "应用目标文档",
      created_at: "创建时间",
      updated_at: "更新时间",
    },
  },
  document_revisions: {
    table: "正文保存前的不可变历史快照",
    columns: {
      id: "UUID v7 主键",
      document_id: "所属文档",
      content: "历史正文",
      version: "历史版本号",
      word_count: "历史字数",
      created_at: "创建时间",
      updated_at: "与创建时间相等且不可修改",
    },
  },
  editor_drafts: {
    table: "尚未写入正式正文的本地编辑草稿",
    columns: {
      document_id: "所属文档",
      base_version: "草稿基于的正文版本",
      content: "未保存正文",
      created_at: "创建时间",
      updated_at: "最后写入时间",
    },
  },
} as const;

export type DesktopMigration = {
  version: number;
  destructive: boolean;
  sql: string;
};

export const DESKTOP_MIGRATIONS: readonly DesktopMigration[] = [
  {
    version: 1,
    destructive: false,
    sql: `
      CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200), created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
      CREATE TABLE documents (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, parent_id TEXT REFERENCES documents(id) ON DELETE RESTRICT, title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200), kind TEXT NOT NULL CHECK(kind IN ('folder','manuscript','outline')), position INTEGER NOT NULL CHECK(position >= 0), deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
      CREATE INDEX ix_documents_project_position ON documents(project_id, parent_id, position);
      CREATE TABLE document_contents (document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE, content TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0), word_count INTEGER NOT NULL DEFAULT 0 CHECK(word_count >= 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
      CREATE TABLE app_settings (id INTEGER PRIMARY KEY CHECK(id = 1), theme_palette TEXT NOT NULL CHECK(theme_palette IN ('manuscript-brown','pine-green','harbor-blue','grape-purple','graphite')), theme_mode TEXT NOT NULL CHECK(theme_mode IN ('system','light','dark')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
      CREATE TABLE local_skill_preferences (directory_key TEXT PRIMARY KEY, directory_name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)), content_fingerprint TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
      CREATE TABLE ai_provider_configs (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, protocol TEXT NOT NULL CHECK(protocol = 'openai_chat'), base_url TEXT NOT NULL, model TEXT NOT NULL, credential_ref TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
      CREATE TABLE ai_tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, document_id TEXT REFERENCES documents(id) ON DELETE SET NULL, provider_config_id TEXT REFERENCES ai_provider_configs(id) ON DELETE SET NULL, instruction TEXT NOT NULL, context_manifest TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed','cancelled')), error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
      CREATE TABLE ai_results (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES ai_tasks(id) ON DELETE CASCADE, content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'candidate' CHECK(status IN ('candidate','applied','rejected')), applied_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
    `,
  },
  {
    version: 2,
    destructive: false,
    sql: `
      CREATE TABLE document_revisions (id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, content TEXT NOT NULL, version INTEGER NOT NULL CHECK(version > 0), word_count INTEGER NOT NULL CHECK(word_count >= 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL CHECK(updated_at = created_at)) STRICT;
      CREATE UNIQUE INDEX uq_document_revisions_document_version ON document_revisions(document_id, version);
    `,
  },
  {
    version: 3,
    destructive: false,
    sql: `
      CREATE TABLE editor_drafts (document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE, base_version INTEGER NOT NULL CHECK(base_version > 0), content TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
    `,
  },
] as const;

export class DesktopDatabase {
  readonly db: DatabaseSync;
  readonly path: string;

  private constructor(path: string) {
    this.path = path;
    this.db = new DatabaseSync(path, {
      enableForeignKeyConstraints: true,
      timeout: 5000,
    });
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  }

  static async open(
    path: string,
    backupRoot?: string,
    migrationPlan: readonly DesktopMigration[] = DESKTOP_MIGRATIONS,
  ): Promise<DesktopDatabase> {
    await mkdir(dirname(path), { recursive: true });
    const store = new DesktopDatabase(path);
    store.db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL CHECK(updated_at = created_at)) STRICT;",
    );
    const current = Number(
      (
        store.db
          .prepare(
            "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations",
          )
          .get() as { version: number }
      ).version,
    );
    const pending = migrationPlan.filter((item) => item.version > current);
    if (current > 0 && pending.length > 0 && backupRoot) {
      await store.createBackup(
        backupRoot,
        `xnovel-before-v${pending.at(-1)?.version}`,
      );
    }
    for (const migration of pending) {
      store.db.exec("BEGIN IMMEDIATE");
      try {
        store.db.exec(migration.sql);
        const appliedAt = now();
        store.db
          .prepare(
            "INSERT INTO schema_migrations(version, applied_at, created_at, updated_at) VALUES (?, ?, ?, ?)",
          )
          .run(migration.version, appliedAt, appliedAt, appliedAt);
        store.db.exec("COMMIT");
      } catch (error) {
        store.db.exec("ROLLBACK");
        store.close();
        throw error;
      }
    }
    store.ensureSettings();
    return store;
  }

  close(): void {
    if (this.db.isOpen) this.db.close();
  }

  async createBackup(backupRoot: string, prefix = "xnovel"): Promise<string> {
    await mkdir(backupRoot, { recursive: true });
    const target = join(backupRoot, `${prefix}-${Date.now()}-${uuidv7()}.db`);
    const escapedTarget = target.replaceAll("'", "''");
    this.db.exec(`VACUUM INTO '${escapedTarget}'`);
    return target;
  }

  async restoreLatestBackup(backupRoot: string): Promise<boolean> {
    const names = (await readdir(backupRoot).catch(() => []))
      .filter((name) => /^xnovel-\d+-[0-9a-f-]+\.db$/.test(name))
      .sort()
      .reverse();
    const latest = names[0];
    if (!latest) return false;
    const source = join(backupRoot, latest);
    const candidate = new DatabaseSync(source, { readOnly: true });
    try {
      const integrity = candidate.prepare("PRAGMA integrity_check").get() as {
        integrity_check: string;
      };
      if (integrity.integrity_check !== "ok") throw new Error("BACKUP_INVALID");
      const version = Number(
        (
          candidate
            .prepare(
              "SELECT COALESCE(MAX(version),0) AS version FROM schema_migrations",
            )
            .get() as { version: number }
        ).version,
      );
      if (version > DESKTOP_MIGRATIONS.at(-1)!.version)
        throw new Error("BACKUP_SCHEMA_TOO_NEW");
    } finally {
      candidate.close();
    }
    await this.createBackup(backupRoot);
    const temporary = `${this.path}.restore.tmp`;
    const previous = `${this.path}.restore.previous`;
    await copyFile(source, temporary);
    this.close();
    try {
      await rm(previous, { force: true });
      await rename(this.path, previous);
      await rename(temporary, this.path);
      await rm(previous, { force: true });
    } catch (error) {
      await rm(this.path, { force: true }).catch(() => undefined);
      await rename(previous, this.path).catch(() => undefined);
      throw error;
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
    return true;
  }

  listProjects(): DesktopProject[] {
    return (
      this.db
        .prepare(
          "SELECT id, title, created_at, updated_at FROM projects ORDER BY updated_at DESC, id DESC",
        )
        .all() as ProjectRow[]
    ).map(projectFromRow);
  }

  createProject(titleInput: string): {
    project: DesktopProject;
    document: DesktopDocument;
  } {
    const title = requiredText(titleInput, 200, "title");
    const timestamp = now();
    const projectId = uuidv7();
    const documentId = uuidv7();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "INSERT INTO projects(id,title,created_at,updated_at) VALUES (?,?,?,?)",
        )
        .run(projectId, title, timestamp, timestamp);
      this.db
        .prepare(
          "INSERT INTO documents(id,project_id,parent_id,title,kind,position,created_at,updated_at) VALUES (?,?,NULL,?,'manuscript',0,?,?)",
        )
        .run(documentId, projectId, "未命名文档", timestamp, timestamp);
      this.db
        .prepare(
          "INSERT INTO document_contents(document_id,content,version,word_count,created_at,updated_at) VALUES (?,'',1,0,?,?)",
        )
        .run(documentId, timestamp, timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return {
      project: {
        id: projectId,
        title,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      document: {
        id: documentId,
        projectId,
        parentId: null,
        title: "未命名文档",
        kind: "manuscript",
        position: 0,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    };
  }

  listDocuments(
    projectId: string,
    status: "active" | "archived" = "active",
  ): DesktopDocument[] {
    return (
      this.db
        .prepare(
          `SELECT id,project_id,parent_id,title,kind,position,deleted_at,created_at,updated_at
           FROM documents WHERE project_id=? AND deleted_at IS ${status === "active" ? "NULL" : "NOT NULL"}
           ORDER BY parent_id,position,id`,
        )
        .all(uuid(projectId)) as DocumentRow[]
    ).map(documentFromRow);
  }

  createDocument(input: {
    projectId: string;
    parentId: string | null;
    title: string;
    kind: DesktopDocument["kind"];
  }): DesktopDocument {
    const projectId = uuid(input.projectId);
    const parentId = input.parentId ? uuid(input.parentId) : null;
    if (!(["folder", "manuscript", "outline"] as const).includes(input.kind))
      throw new Error("DOCUMENT_KIND_INVALID");
    if (parentId) {
      const parent = this.documentRow(parentId);
      if (
        parent.project_id !== projectId ||
        parent.kind !== "folder" ||
        parent.deleted_at
      )
        throw new Error("DOCUMENT_PARENT_INVALID");
    }
    const position = Number(
      (
        this.db
          .prepare(
            "SELECT COALESCE(MAX(position),-1)+1 AS position FROM documents WHERE project_id=? AND parent_id IS ? AND deleted_at IS NULL",
          )
          .get(projectId, parentId) as { position: number }
      ).position,
    );
    const id = uuidv7();
    const timestamp = now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "INSERT INTO documents(id,project_id,parent_id,title,kind,position,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          projectId,
          parentId,
          requiredText(input.title, 200, "title"),
          input.kind,
          position,
          timestamp,
          timestamp,
        );
      if (input.kind !== "folder") {
        this.db
          .prepare(
            "INSERT INTO document_contents(document_id,content,version,word_count,created_at,updated_at) VALUES (?,'',1,0,?,?)",
          )
          .run(id, timestamp, timestamp);
      }
      this.db
        .prepare("UPDATE projects SET updated_at=? WHERE id=?")
        .run(timestamp, projectId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return documentFromRow(this.documentRow(id));
  }

  renameDocument(documentId: string, title: string): DesktopDocument {
    const id = uuid(documentId);
    const timestamp = now();
    const result = this.db
      .prepare(
        "UPDATE documents SET title=?,updated_at=? WHERE id=? AND deleted_at IS NULL",
      )
      .run(requiredText(title, 200, "title"), timestamp, id);
    if (result.changes !== 1) throw new Error("DOCUMENT_NOT_FOUND");
    return documentFromRow(this.documentRow(id));
  }

  moveDocument(
    documentId: string,
    parentId: string | null,
    position: number,
  ): DesktopDocument[] {
    const id = uuid(documentId);
    const targetParentId = parentId ? uuid(parentId) : null;
    if (!Number.isSafeInteger(position) || position < 0)
      throw new Error("DOCUMENT_POSITION_INVALID");
    const source = this.documentRow(id);
    if (source.deleted_at) throw new Error("DOCUMENT_NOT_FOUND");
    if (targetParentId) {
      const parent = this.documentRow(targetParentId);
      if (
        parent.project_id !== source.project_id ||
        parent.kind !== "folder" ||
        parent.deleted_at
      )
        throw new Error("DOCUMENT_PARENT_INVALID");
      let ancestor: string | null = targetParentId;
      while (ancestor) {
        if (ancestor === id) throw new Error("DOCUMENT_CYCLE");
        ancestor = this.documentRow(ancestor).parent_id;
      }
    }
    const documents = this.listDocuments(source.project_id);
    const sourceSiblings = documents.filter(
      (item) => item.parentId === source.parent_id && item.id !== id,
    );
    const targetSiblings =
      source.parent_id === targetParentId
        ? sourceSiblings
        : documents.filter(
            (item) => item.parentId === targetParentId && item.id !== id,
          );
    targetSiblings.splice(
      Math.min(position, targetSiblings.length),
      0,
      documentFromRow(source),
    );
    const timestamp = now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (source.parent_id !== targetParentId) {
        sourceSiblings.forEach((item, index) =>
          this.db
            .prepare("UPDATE documents SET position=?,updated_at=? WHERE id=?")
            .run(index, timestamp, item.id),
        );
      }
      targetSiblings.forEach((item, index) =>
        this.db
          .prepare(
            "UPDATE documents SET parent_id=?,position=?,updated_at=? WHERE id=?",
          )
          .run(targetParentId, index, timestamp, item.id),
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.listDocuments(source.project_id);
  }

  setDocumentArchived(documentId: string, archived: boolean): DesktopDocument {
    const id = uuid(documentId);
    const document = this.documentRow(id);
    if (archived) {
      this.assertNotLastManuscript(document);
      if (document.kind === "folder") {
        const child = this.db
          .prepare(
            "SELECT id FROM documents WHERE parent_id=? AND deleted_at IS NULL LIMIT 1",
          )
          .get(id);
        if (child) throw new Error("DOCUMENT_FOLDER_NOT_EMPTY");
      }
    }
    const timestamp = now();
    const parentId =
      !archived && document.parent_id
        ? this.documentRow(document.parent_id).deleted_at
          ? null
          : document.parent_id
        : document.parent_id;
    this.db
      .prepare(
        "UPDATE documents SET parent_id=?,deleted_at=?,updated_at=? WHERE id=?",
      )
      .run(parentId, archived ? timestamp : null, timestamp, id);
    return documentFromRow(this.documentRow(id));
  }

  deleteDocument(documentId: string): DesktopDocument[] {
    const id = uuid(documentId);
    const document = this.documentRow(id);
    this.assertNotLastManuscript(document);
    const timestamp = now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.deleteDocumentsDeepFirst([id]);
      this.reindexActiveSiblings(
        document.project_id,
        document.parent_id,
        timestamp,
      );
      this.db
        .prepare("UPDATE projects SET updated_at=? WHERE id=?")
        .run(timestamp, document.project_id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.listDocuments(document.project_id);
  }

  deleteProject(projectId: string): void {
    const id = uuid(projectId);
    const project = this.db
      .prepare("SELECT id FROM projects WHERE id=?")
      .get(id) as ProjectRow | undefined;
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const rootIds = (
      this.db
        .prepare(
          "SELECT id FROM documents WHERE project_id=? AND parent_id IS NULL",
        )
        .all(id) as DocumentRow[]
    ).map((row) => row.id);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.deleteDocumentsDeepFirst(rootIds);
      this.db.prepare("DELETE FROM projects WHERE id=?").run(id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private assertNotLastManuscript(document: DocumentRow): void {
    if (document.kind !== "manuscript" || document.deleted_at) return;
    const { total } = this.db
      .prepare(
        "SELECT COUNT(*) AS total FROM documents WHERE project_id=? AND kind='manuscript' AND deleted_at IS NULL",
      )
      .get(document.project_id) as { total: number };
    if (total <= 1) throw new Error("DOCUMENT_LAST_MANUSCRIPT");
  }

  private deleteDocumentsDeepFirst(rootIds: string[]): void {
    if (!rootIds.length) return;
    const ids = (
      this.db
        .prepare(
          `WITH RECURSIVE subtree(id,depth) AS (
             SELECT id,0 FROM documents WHERE id IN (${rootIds.map(() => "?").join(",")})
             UNION ALL
             SELECT documents.id,subtree.depth+1 FROM documents JOIN subtree ON documents.parent_id=subtree.id
           )
           SELECT id FROM subtree ORDER BY depth DESC`,
        )
        .all(...rootIds) as DocumentRow[]
    ).map((row) => row.id);
    const remove = this.db.prepare("DELETE FROM documents WHERE id=?");
    ids.forEach((documentId) => remove.run(documentId));
  }

  private reindexActiveSiblings(
    projectId: string,
    parentId: string | null,
    timestamp: string,
  ): void {
    const update = this.db.prepare(
      "UPDATE documents SET position=?,updated_at=? WHERE id=?",
    );
    this.listDocuments(projectId)
      .filter((item) => item.parentId === parentId)
      .forEach((item, index) => update.run(index, timestamp, item.id));
  }

  getEditorDraft(documentId: string): DesktopDraft | null {
    const row = this.db
      .prepare(
        "SELECT document_id,base_version,content,created_at,updated_at FROM editor_drafts WHERE document_id=?",
      )
      .get(uuid(documentId)) as DraftRow | undefined;
    return row ? draftFromRow(row) : null;
  }

  saveEditorDraft(
    documentId: string,
    content: string,
    baseVersion: number,
  ): DesktopDraft {
    const id = uuid(documentId);
    if (
      !Number.isSafeInteger(baseVersion) ||
      baseVersion < 1 ||
      content.length > 2_000_000
    )
      throw new Error("INVALID_CONTENT");
    const timestamp = now();
    this.db
      .prepare(
        `INSERT INTO editor_drafts(document_id,base_version,content,created_at,updated_at)
         VALUES (?,?,?,?,?) ON CONFLICT(document_id) DO UPDATE SET
         base_version=excluded.base_version,content=excluded.content,updated_at=excluded.updated_at`,
      )
      .run(id, baseVersion, content, timestamp, timestamp);
    return this.getEditorDraft(id)!;
  }

  removeEditorDraft(documentId: string): void {
    this.db
      .prepare("DELETE FROM editor_drafts WHERE document_id=?")
      .run(uuid(documentId));
  }

  private documentRow(documentId: string): DocumentRow {
    const row = this.db
      .prepare(
        "SELECT id,project_id,parent_id,title,kind,position,deleted_at,created_at,updated_at FROM documents WHERE id=?",
      )
      .get(uuid(documentId)) as DocumentRow | undefined;
    if (!row) throw new Error("DOCUMENT_NOT_FOUND");
    return row;
  }

  getContent(documentId: string): DesktopContent {
    const row = this.db
      .prepare(
        "SELECT document_id,content,version,word_count,created_at,updated_at FROM document_contents WHERE document_id=?",
      )
      .get(uuid(documentId)) as ContentRow | undefined;
    if (!row) throw new Error("DOCUMENT_NOT_FOUND");
    return contentFromRow(row);
  }

  saveContent(
    documentId: string,
    text: string,
    version: number,
  ): DesktopContent {
    if (
      !Number.isSafeInteger(version) ||
      version < 1 ||
      text.length > 2_000_000
    )
      throw new Error("INVALID_CONTENT");
    const timestamp = now();
    const current = this.getContent(documentId);
    if (current.version !== version)
      throw new Error("CONTENT_VERSION_CONFLICT");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "INSERT INTO document_revisions(id,document_id,content,version,word_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          uuidv7(),
          documentId,
          current.content,
          current.version,
          current.wordCount,
          timestamp,
          timestamp,
        );
      const result = this.db
        .prepare(
          "UPDATE document_contents SET content=?,version=version+1,word_count=?,updated_at=? WHERE document_id=? AND version=?",
        )
        .run(text, countWords(text), timestamp, uuid(documentId), version);
      if (result.changes !== 1) throw new Error("CONTENT_VERSION_CONFLICT");
      this.db
        .prepare("UPDATE documents SET updated_at=? WHERE id=?")
        .run(timestamp, documentId);
      this.db
        .prepare(
          "UPDATE projects SET updated_at=? WHERE id=(SELECT project_id FROM documents WHERE id=?)",
        )
        .run(timestamp, documentId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getContent(documentId);
  }

  getPreferences(): DesktopPreferences {
    const row = this.db
      .prepare("SELECT theme_palette,theme_mode FROM app_settings WHERE id=1")
      .get() as { theme_palette: ThemePalette; theme_mode: ThemeMode };
    return { themePalette: row.theme_palette, themeMode: row.theme_mode };
  }

  setPreferences(value: DesktopPreferences): DesktopPreferences {
    if (
      !themePalettes.includes(value.themePalette) ||
      !themeModes.includes(value.themeMode)
    )
      throw new Error("INVALID_PREFERENCES");
    this.db
      .prepare(
        "UPDATE app_settings SET theme_palette=?,theme_mode=?,updated_at=? WHERE id=1",
      )
      .run(value.themePalette, value.themeMode, now());
    return this.getPreferences();
  }

  skillPreferences(): Array<{
    directoryKey: string;
    directoryName: string;
    enabled: boolean;
    contentFingerprint: string;
  }> {
    return (
      this.db
        .prepare(
          "SELECT directory_key,directory_name,enabled,content_fingerprint FROM local_skill_preferences ORDER BY directory_name",
        )
        .all() as Array<{
        directory_key: string;
        directory_name: string;
        enabled: number;
        content_fingerprint: string;
      }>
    ).map((row) => ({
      directoryKey: row.directory_key,
      directoryName: row.directory_name,
      enabled: row.enabled === 1,
      contentFingerprint: row.content_fingerprint,
    }));
  }

  saveSkillPreference(
    directoryKey: string,
    directoryName: string,
    enabled: boolean,
    fingerprint: string,
  ): void {
    const timestamp = now();
    this.db
      .prepare(
        "INSERT INTO local_skill_preferences(directory_key,directory_name,enabled,content_fingerprint,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(directory_key) DO UPDATE SET directory_name=excluded.directory_name,enabled=excluded.enabled,content_fingerprint=excluded.content_fingerprint,updated_at=excluded.updated_at",
      )
      .run(
        requiredText(directoryKey, 500, "directory_key"),
        requiredText(directoryName, 255, "directory_name"),
        enabled ? 1 : 0,
        requiredText(fingerprint, 64, "fingerprint"),
        timestamp,
        timestamp,
      );
  }

  disableSkill(directoryKey: string): void {
    this.db
      .prepare(
        "UPDATE local_skill_preferences SET enabled=0,updated_at=? WHERE directory_key=?",
      )
      .run(now(), directoryKey);
  }

  listProviders(): ProviderSummary[] {
    return (
      this.db
        .prepare(
          "SELECT id,display_name,base_url,model,credential_ref FROM ai_provider_configs ORDER BY updated_at DESC",
        )
        .all() as Array<{
        id: string;
        display_name: string;
        base_url: string;
        model: string;
        credential_ref: string | null;
      }>
    ).map((row) => ({
      id: row.id,
      displayName: row.display_name,
      baseUrl: row.base_url,
      model: row.model,
      configured: Boolean(row.credential_ref),
    }));
  }

  credentialReferences(): string[] {
    return (
      this.db
        .prepare(
          "SELECT credential_ref FROM ai_provider_configs WHERE credential_ref IS NOT NULL",
        )
        .all() as Array<{ credential_ref: string }>
    ).map((row) => row.credential_ref);
  }

  saveProvider(
    input: ProviderInput,
    credentialRef: string | null,
  ): ProviderSummary {
    const id = input.id ? uuid(input.id) : uuidv7();
    const timestamp = now();
    const url = new URL(input.baseUrl);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("PROVIDER_URL_NOT_ALLOWED");
    this.db
      .prepare(
        "INSERT INTO ai_provider_configs(id,display_name,protocol,base_url,model,credential_ref,created_at,updated_at) VALUES (?,?,'openai_chat',?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,base_url=excluded.base_url,model=excluded.model,credential_ref=COALESCE(excluded.credential_ref,ai_provider_configs.credential_ref),updated_at=excluded.updated_at",
      )
      .run(
        id,
        requiredText(input.displayName, 200, "display_name"),
        url.origin + url.pathname.replace(/\/$/, ""),
        requiredText(input.model, 200, "model"),
        credentialRef,
        timestamp,
        timestamp,
      );
    return this.listProviders().find((item) => item.id === id)!;
  }

  providerSecretRef(providerId: string): {
    provider: ProviderSummary;
    credentialRef: string | null;
  } {
    const row = this.db
      .prepare(
        "SELECT id,display_name,base_url,model,credential_ref FROM ai_provider_configs WHERE id=?",
      )
      .get(uuid(providerId)) as
      | {
          id: string;
          display_name: string;
          base_url: string;
          model: string;
          credential_ref: string | null;
        }
      | undefined;
    if (!row) throw new Error("PROVIDER_NOT_FOUND");
    return {
      provider: {
        id: row.id,
        displayName: row.display_name,
        baseUrl: row.base_url,
        model: row.model,
        configured: Boolean(row.credential_ref),
      },
      credentialRef: row.credential_ref,
    };
  }

  createAiTask(input: {
    projectId: string;
    documentId: string;
    providerId: string;
    instruction: string;
    contextManifest: Record<string, unknown>;
  }): string {
    const id = uuidv7();
    const timestamp = now();
    this.db
      .prepare(
        "INSERT INTO ai_tasks(id,project_id,document_id,provider_config_id,instruction,context_manifest,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'running',?,?)",
      )
      .run(
        id,
        uuid(input.projectId),
        uuid(input.documentId),
        uuid(input.providerId),
        requiredText(input.instruction, 10_000, "instruction"),
        JSON.stringify(input.contextManifest),
        timestamp,
        timestamp,
      );
    return id;
  }

  finishAiTask(taskId: string, content: string): AiCandidate {
    const timestamp = now();
    const resultId = uuidv7();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "UPDATE ai_tasks SET status='succeeded',updated_at=? WHERE id=? AND status='running'",
        )
        .run(timestamp, uuid(taskId));
      this.db
        .prepare(
          "INSERT INTO ai_results(id,task_id,content,status,created_at,updated_at) VALUES (?,?,?,'candidate',?,?)",
        )
        .run(resultId, taskId, content, timestamp, timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { taskId, resultId, content, status: "candidate" };
  }

  failAiTask(taskId: string, code: string): void {
    this.db
      .prepare(
        "UPDATE ai_tasks SET status='failed',error_code=?,updated_at=? WHERE id=? AND status='running'",
      )
      .run(code, now(), uuid(taskId));
  }

  decideAiResult(input: {
    resultId: string;
    decision: "apply" | "reject";
    documentId: string;
    version?: number;
  }): AiCandidate {
    const row = this.db
      .prepare(
        `SELECT r.id,r.task_id,r.content,r.status,t.document_id,t.context_manifest
         FROM ai_results r JOIN ai_tasks t ON t.id=r.task_id WHERE r.id=?`,
      )
      .get(uuid(input.resultId)) as
      | {
          id: string;
          task_id: string;
          content: string;
          status: AiCandidate["status"];
          document_id: string | null;
          context_manifest: string;
        }
      | undefined;
    if (!row || row.status !== "candidate")
      throw new Error("AI_RESULT_ALREADY_DECIDED");
    const timestamp = now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (input.decision === "apply") {
        if (!input.version) throw new Error("CONTENT_VERSION_REQUIRED");
        const manifest = JSON.parse(row.context_manifest) as {
          document_id?: unknown;
          document_version?: unknown;
        };
        if (
          row.document_id !== input.documentId ||
          manifest.document_id !== input.documentId ||
          manifest.document_version !== input.version
        )
          throw new Error("CONTENT_VERSION_CONFLICT");
        const current = this.getContent(input.documentId);
        if (current.version !== input.version)
          throw new Error("CONTENT_VERSION_CONFLICT");
        this.db
          .prepare(
            "INSERT INTO document_revisions(id,document_id,content,version,word_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
          )
          .run(
            uuidv7(),
            input.documentId,
            current.content,
            current.version,
            current.wordCount,
            timestamp,
            timestamp,
          );
        const result = this.db
          .prepare(
            "UPDATE document_contents SET content=?,version=version+1,word_count=?,updated_at=? WHERE document_id=? AND version=?",
          )
          .run(
            row.content,
            countWords(row.content),
            timestamp,
            uuid(input.documentId),
            input.version,
          );
        if (result.changes !== 1) throw new Error("CONTENT_VERSION_CONFLICT");
        this.db
          .prepare(
            "UPDATE ai_results SET status='applied',applied_document_id=?,updated_at=? WHERE id=?",
          )
          .run(input.documentId, timestamp, row.id);
        this.db
          .prepare("UPDATE documents SET updated_at=? WHERE id=?")
          .run(timestamp, input.documentId);
        this.db
          .prepare(
            "UPDATE projects SET updated_at=? WHERE id=(SELECT project_id FROM documents WHERE id=?)",
          )
          .run(timestamp, input.documentId);
      } else {
        this.db
          .prepare(
            "UPDATE ai_results SET status='rejected',updated_at=? WHERE id=?",
          )
          .run(timestamp, row.id);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return {
      taskId: row.task_id,
      resultId: row.id,
      content: row.content,
      status: input.decision === "apply" ? "applied" : "rejected",
    };
  }

  private ensureSettings(): void {
    const timestamp = now();
    this.db
      .prepare(
        "INSERT OR IGNORE INTO app_settings(id,theme_palette,theme_mode,created_at,updated_at) VALUES (1,'manuscript-brown','system',?,?)",
      )
      .run(timestamp, timestamp);
  }
}

type ProjectRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};
type DocumentRow = {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  kind: DesktopDocument["kind"];
  position: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
type DraftRow = {
  document_id: string;
  base_version: number;
  content: string;
  created_at: string;
  updated_at: string;
};
type ContentRow = {
  document_id: string;
  content: string;
  version: number;
  word_count: number;
  created_at: string;
  updated_at: string;
};
const projectFromRow = (row: ProjectRow): DesktopProject => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
const documentFromRow = (row: DocumentRow): DesktopDocument => ({
  id: row.id,
  projectId: row.project_id,
  parentId: row.parent_id,
  title: row.title,
  kind: row.kind,
  position: row.position,
  status: row.deleted_at ? "archived" : "active",
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
const draftFromRow = (row: DraftRow): DesktopDraft => ({
  documentId: row.document_id,
  baseVersion: row.base_version,
  content: row.content,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
const contentFromRow = (row: ContentRow): DesktopContent => ({
  documentId: row.document_id,
  content: row.content,
  version: row.version,
  wordCount: row.word_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
const now = (): string => new Date().toISOString();
const uuid = (value: string): string => {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new Error("INVALID_ID");
  return value;
};
const requiredText = (value: string, max: number, field: string): string => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new Error(`INVALID_${field.toUpperCase()}`);
  return normalized;
};
export const countWords = (value: string): number =>
  (value.match(/[\p{Unified_Ideograph}]|[\p{L}\p{N}]+/gu) ?? []).length;
