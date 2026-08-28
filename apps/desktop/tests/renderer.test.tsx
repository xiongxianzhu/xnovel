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

import type { DesktopProject, XnovelDesktopApi } from "../src/shared/contracts";
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
    title: "未命名文档",
    kind: "manuscript" as const,
    position: 0,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
  let projects: DesktopProject[] = [];
  const api: XnovelDesktopApi = {
    projects: {
      list: vi.fn(async () => projects),
      create: vi.fn(async () => {
        projects = [project];
        return { project, document: documentItem };
      }),
      documents: vi.fn(async () => [documentItem]),
      content: vi.fn(async () => ({
        documentId: documentItem.id,
        content: "",
        version: 1,
        wordCount: 0,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })),
      save: vi.fn(),
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
});
