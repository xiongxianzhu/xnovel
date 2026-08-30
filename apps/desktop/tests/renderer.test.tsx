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
      createDocument: vi.fn(),
      renameDocument: vi.fn(),
      moveDocument: vi.fn(),
      setDocumentArchived: vi.fn(),
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
  vi.spyOn(window, "prompt").mockReturnValue("雾城");

  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "创建第一个作品" }),
  );
  expect(await screen.findByRole("heading", { name: "雾城" })).toBeVisible();
  expect(screen.getByLabelText("正文编辑器")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "AI 候选" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "添加 OpenAI 兼容连接" }),
  );
  const keyInput = screen.getByLabelText("API Key");
  expect(keyInput).toHaveAttribute("type", "password");
  await waitFor(() => expect(api.projects.create).toHaveBeenCalledWith("雾城"));

  fireEvent.click(screen.getByRole("button", { name: "关闭 AI 工具" }));
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
