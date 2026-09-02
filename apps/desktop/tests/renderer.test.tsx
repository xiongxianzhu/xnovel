// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type {
  DesktopContent,
  DesktopDocument,
  DesktopProject,
  XnovelDesktopApi,
} from "../src/shared/contracts";
import { App } from "../src/renderer/src/App";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("completes the local create-open flow and keeps credential input masked", async () => {
  const project: DesktopProject = {
    id: "01900000-0000-7000-8000-000000000001",
    title: "雾城",
    createdAt: "2026-08-28T00:00:00Z",
    updatedAt: "2026-08-28T00:00:00Z",
  };
  const documentItem = {
    id: "01900000-0000-7000-8000-000000000002",
    projectId: project.id,
    parentId: null,
    title: "未命名文档",
    kind: "manuscript" as const,
    position: 0,
    status: "active" as const,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
  let projects: DesktopProject[] = [];
  let resolveFirstSave:
    | ((value: {
        documentId: string;
        content: string;
        version: number;
        wordCount: number;
        createdAt: string;
        updatedAt: string;
      }) => void)
    | undefined;
  let saveCount = 0;
  const api: XnovelDesktopApi = {
    projects: {
      list: vi.fn(async () => projects),
      create: vi.fn(async () => {
        projects = [project];
        return { project, document: documentItem };
      }),
      documents: vi.fn(async () => [documentItem]),
      archivedDocuments: vi.fn(async () => []),
      remove: vi.fn(async () => undefined),
      createDocument: vi.fn(async (input) => ({
        ...documentItem,
        ...input,
        id: "01900000-0000-7000-8000-000000000003",
      })),
      renameDocument: vi.fn(async (documentId, title) => ({
        ...documentItem,
        id: documentId,
        title,
      })),
      moveDocument: vi.fn(),
      setDocumentArchived: vi.fn(),
      deleteDocument: vi.fn(async () => []),
      content: vi.fn(async () => ({
        documentId: documentItem.id,
        content: "",
        version: 1,
        wordCount: 0,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })),
      save: vi.fn((_documentId, text) => {
        saveCount += 1;
        if (saveCount === 1)
          return new Promise<DesktopContent>((resolve) => {
            resolveFirstSave = resolve;
          });
        return Promise.resolve({
          documentId: documentItem.id,
          content: text,
          version: 3,
          wordCount: text.length,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        });
      }),
    },
    drafts: {
      get: vi.fn(async () => null),
      save: vi.fn(),
      remove: vi.fn(),
    },
    preferences: {
      get: vi.fn(async () => ({
        themePalette: "manuscript-brown" as const,
        themeMode: "light" as const,
      })),
      set: vi.fn(),
    },
    skills: {
      scan: vi.fn(async () => []),
      list: vi.fn(async () => []),
      detail: vi.fn(),
      setEnabled: vi.fn(),
    },
    providers: { list: vi.fn(async () => []), save: vi.fn() },
    ai: { run: vi.fn(), decide: vi.fn() },
    backup: { create: vi.fn(), restoreLatest: vi.fn() },
    update: { check: vi.fn(), download: vi.fn(), install: vi.fn() },
    window: {
      info: vi.fn(async () => ({ frameless: false, maximized: false })),
      minimize: vi.fn(async () => undefined),
      toggleMaximize: vi.fn(async () => ({ maximized: false })),
      close: vi.fn(async () => undefined),
      onMaximizedChange: vi.fn(() => () => undefined),
    },
  };
  Object.defineProperty(window, "xnovelDesktop", {
    configurable: true,
    value: api,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
  // Electron renderer 不支持 window.prompt，回归调用必须直接失败
  vi.spyOn(window, "prompt").mockImplementation(() => {
    throw new Error("prompt() is not supported");
  });

  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "创建第一个作品" }),
  );
  expect(
    await screen.findByRole("heading", { name: "新建作品" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "创建作品" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("作品名称"), {
    target: { value: "  雾城  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "创建作品" }));
  await waitFor(() => expect(api.projects.create).toHaveBeenCalledWith("雾城"));
  expect(await screen.findByRole("heading", { name: "雾城" })).toBeVisible();
  expect(screen.getByLabelText("正文编辑器")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "AI 候选" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "添加 OpenAI 兼容连接" }),
  );
  const keyInput = screen.getByLabelText("API Key");
  expect(keyInput).toHaveAttribute("type", "password");

  fireEvent.click(screen.getByRole("button", { name: "关闭 AI 工具" }));
  fireEvent.click(screen.getByRole("button", { name: "重命名未命名文档" }));
  const renameInput = await screen.findByLabelText("文档名称");
  expect(renameInput).toHaveValue("未命名文档");
  fireEvent.change(renameInput, { target: { value: " 第一章 " } });
  fireEvent.click(screen.getByRole("button", { name: "保存名称" }));
  await waitFor(() =>
    expect(api.projects.renameDocument).toHaveBeenCalledWith(
      documentItem.id,
      "第一章",
    ),
  );

  fireEvent.click(screen.getByRole("button", { name: "文件夹" }));
  fireEvent.change(await screen.findByLabelText("文件夹名称"), {
    target: { value: "设定" },
  });
  fireEvent.click(screen.getByRole("button", { name: "创建" }));
  await waitFor(() =>
    expect(api.projects.createDocument).toHaveBeenCalledWith({
      projectId: project.id,
      parentId: null,
      title: "设定",
      kind: "folder",
    }),
  );

  const editor = screen.getByLabelText("正文编辑器");
  fireEvent.change(editor, { target: { value: "第一版" } });
  fireEvent.keyDown(editor, { ctrlKey: true, key: "s" });
  fireEvent.change(editor, { target: { value: "第二版" } });
  resolveFirstSave?.({
    documentId: documentItem.id,
    content: "第一版",
    version: 2,
    wordCount: 3,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  });
  await waitFor(() => expect(api.projects.save).toHaveBeenCalledTimes(2));
  expect(editor).toHaveValue("第二版");
  await waitFor(() => expect(screen.getByText("刚刚保存")).toBeVisible());
});

function createFixture(
  options: {
    frameless?: boolean;
    deleteDocument?: XnovelDesktopApi["projects"]["deleteDocument"];
  } = {},
) {
  const timestamp = "2026-08-28T00:00:00Z";
  const project: DesktopProject = {
    id: "01900000-0000-7000-8000-000000000011",
    title: "雾城",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const manuscript: DesktopDocument = {
    id: "01900000-0000-7000-8000-000000000012",
    projectId: project.id,
    parentId: null,
    title: "第一章",
    kind: "manuscript",
    position: 0,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const content: DesktopContent = {
    documentId: manuscript.id,
    content: "雨落在码头。",
    version: 1,
    wordCount: 6,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const documents = [manuscript];
  const api: XnovelDesktopApi = {
    projects: {
      list: vi.fn(async () => [project]),
      create: vi.fn(async () => ({ project, document: manuscript })),
      remove: vi.fn(async () => undefined),
      documents: vi.fn(async () => documents),
      archivedDocuments: vi.fn(async () => []),
      createDocument: vi.fn(async () => manuscript),
      renameDocument: vi.fn(async () => manuscript),
      moveDocument: vi.fn(async () => documents),
      setDocumentArchived: vi.fn(async () => manuscript),
      deleteDocument: options.deleteDocument ?? vi.fn(async () => documents),
      content: vi.fn(async () => content),
      save: vi.fn(async () => content),
    },
    drafts: { get: vi.fn(async () => null), save: vi.fn(), remove: vi.fn() },
    preferences: {
      get: vi.fn(async () => ({
        themePalette: "manuscript-brown" as const,
        themeMode: "light" as const,
      })),
      set: vi.fn(),
    },
    skills: {
      scan: vi.fn(async () => []),
      list: vi.fn(async () => []),
      detail: vi.fn(),
      setEnabled: vi.fn(),
    },
    providers: { list: vi.fn(async () => []), save: vi.fn() },
    ai: { run: vi.fn(), decide: vi.fn() },
    backup: { create: vi.fn(), restoreLatest: vi.fn() },
    update: { check: vi.fn(), download: vi.fn(), install: vi.fn() },
    window: {
      info: vi.fn(async () => ({
        frameless: options.frameless ?? false,
        maximized: false,
      })),
      minimize: vi.fn(async () => undefined),
      toggleMaximize: vi.fn(async () => ({ maximized: true })),
      close: vi.fn(async () => undefined),
      onMaximizedChange: vi.fn(() => () => undefined),
    },
  };
  Object.defineProperty(window, "xnovelDesktop", {
    configurable: true,
    value: api,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
  return { api, project, manuscript };
}

it("draws window controls only for the frameless Windows shell", async () => {
  const { api } = createFixture({ frameless: true });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "最小化" }));
  await waitFor(() => expect(api.window.minimize).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "最大化" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "向下还原" })).toBeVisible(),
  );
  fireEvent.click(screen.getByRole("button", { name: "关闭" }));
  await waitFor(() => expect(api.window.close).toHaveBeenCalled());
});

it("keeps the native title bar on platforms with window frames", async () => {
  createFixture({ frameless: false });
  render(<App />);
  expect(await screen.findByLabelText("正文编辑器")).toBeVisible();
  expect(screen.queryByRole("button", { name: "最小化" })).toBeNull();
});

it("requires confirmation before deleting a document", async () => {
  const { api, manuscript } = createFixture();
  const deleteLabel = `删除${manuscript.title}`;
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: deleteLabel }));
  const heading = await screen.findByRole("heading", { name: "删除文档" });
  expect(heading).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "删除文档" })).toBeNull(),
  );
  expect(api.projects.deleteDocument).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: deleteLabel }));
  fireEvent.click(await screen.findByRole("button", { name: "彻底删除" }));
  await waitFor(() =>
    expect(api.projects.deleteDocument).toHaveBeenCalledWith(manuscript.id),
  );
});

it("explains why the last active manuscript cannot be deleted", async () => {
  const { manuscript } = createFixture({
    deleteDocument: vi.fn(async () => {
      throw new Error(
        "Error invoking remote method 'projects:documents-delete': " +
          "Error: DOCUMENT_LAST_MANUSCRIPT",
      );
    }),
  });
  render(<App />);
  const deleteLabel = `删除${manuscript.title}`;
  fireEvent.click(await screen.findByRole("button", { name: deleteLabel }));
  fireEvent.click(await screen.findByRole("button", { name: "彻底删除" }));
  const expected = "作品需要保留至少一个当前正文，请先新建正文再删除。";
  expect(await screen.findByText(expected)).toBeVisible();
});
