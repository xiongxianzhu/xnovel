import type {
  DesktopContent,
  DesktopProject,
  XnovelDesktopApi,
} from "../../shared/contracts";

export function installDevMock(): void {
  if (!import.meta.env.DEV || window.xnovelDesktop) return;
  const now = new Date().toISOString();
  let project: DesktopProject = {
    id: "01900000-0000-7000-8000-000000000001",
    title: "雾港来信",
    createdAt: now,
    updatedAt: now,
  };
  const documentItem = {
    id: "01900000-0000-7000-8000-000000000002",
    projectId: project.id,
    parentId: null,
    title: "第一章 · 雨夜",
    kind: "manuscript" as const,
    position: 0,
    status: "active" as const,
    createdAt: now,
    updatedAt: now,
  };
  let content: DesktopContent = {
    documentId: documentItem.id,
    content:
      "雨从雾港的旧钟楼一路落到码头。\n\n林舟拆开那封没有署名的信，纸上只有一句话：不要让潮水在午夜前抵达城门。",
    version: 3,
    wordCount: 48,
    createdAt: now,
    updatedAt: now,
  };
  const api: XnovelDesktopApi = {
    projects: {
      list: async () => [project],
      create: async (title) => {
        project = { ...project, title };
        return { project, document: documentItem };
      },
      remove: async () => undefined,
      documents: async () => [documentItem],
      archivedDocuments: async () => [],
      createDocument: async (input) => ({
        ...documentItem,
        id: crypto.randomUUID(),
        parentId: input.parentId,
        title: input.title,
        kind: input.kind,
      }),
      renameDocument: async (_id, title) => ({ ...documentItem, title }),
      moveDocument: async () => [documentItem],
      setDocumentArchived: async (_id, archived) => ({
        ...documentItem,
        status: archived ? "archived" : "active",
      }),
      deleteDocument: async () => [],
      content: async () => content,
      save: async (_id, text) =>
        (content = {
          ...content,
          content: text,
          version: content.version + 1,
          updatedAt: new Date().toISOString(),
        }),
    },
    drafts: {
      get: async () => null,
      save: async (documentId, text, baseVersion) => ({
        documentId,
        baseVersion,
        content: text,
        createdAt: now,
        updatedAt: now,
      }),
      remove: async () => undefined,
    },
    preferences: {
      get: async () => ({
        themePalette: "manuscript-brown",
        themeMode: "dark",
      }),
      set: async (value) => value,
    },
    skills: {
      scan: async () => [
        {
          directoryKey: "rewrite",
          directoryName: "rewrite",
          name: "克制改写",
          description: "减少解释，让动作承担叙事。",
          enabled: true,
          contentFingerprint:
            "8f4f1855a7ad0000000000000000000000000000000000000000000000000000",
          status: "ready",
        },
      ],
      list: async () => [],
      detail: async () => ({
        skill: {
          directoryKey: "rewrite",
          directoryName: "rewrite",
          name: "克制改写",
          description: "减少解释，让动作承担叙事。",
          enabled: true,
          contentFingerprint:
            "8f4f1855a7ad0000000000000000000000000000000000000000000000000000",
          status: "ready",
        },
        skillMarkdown: "---\nname: 克制改写\n---\n减少解释，让动作承担叙事。",
      }),
      setEnabled: async () => [],
    },
    providers: {
      list: async () => [],
      save: async () => ({
        id: "provider",
        displayName: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt",
        configured: true,
      }),
    },
    ai: {
      run: async () => ({
        taskId: "task",
        resultId: "result",
        content:
          "潮声越过最后一级石阶时，林舟才发现信纸背面还有一行被雨水泡开的字。",
        status: "candidate",
      }),
      decide: async (input) => ({
        taskId: "task",
        resultId: input.resultId,
        content: "",
        status: input.decision === "apply" ? "applied" : "rejected",
      }),
    },
    backup: {
      create: async () => "backups/xnovel-demo.db",
      restoreLatest: async () => true,
    },
    update: {
      check: async () => ({ status: "development" }),
      download: async () => ({ status: "development" }),
      install: async () => undefined,
    },
    window: {
      info: async () => ({ frameless: false, maximized: false }),
      minimize: async () => undefined,
      toggleMaximize: async () => ({ maximized: false }),
      close: async () => undefined,
      onMaximizedChange: () => () => undefined,
    },
  };
  Object.defineProperty(window, "xnovelDesktop", {
    configurable: true,
    value: api,
  });
}
