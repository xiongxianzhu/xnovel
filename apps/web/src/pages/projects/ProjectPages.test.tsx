import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectDetailData } from "../../shared/api/generated/types.gen";
import "../../shared/i18n";
import { ProjectFormPage } from "./ProjectFormPage";
import { ProjectInfoPage } from "./ProjectInfoPage";
import { ProjectListPage } from "./ProjectListPage";

const api = vi.hoisted(() => ({
  listProjectsRequest: vi.fn(),
  getProjectRequest: vi.fn(),
  createProjectRequest: vi.fn(),
  updateProjectRequest: vi.fn(),
  deleteProjectRequest: vi.fn(),
  restoreProjectRequest: vi.fn(),
  deleteProjectCoverRequest: vi.fn(),
  uploadProjectCoverRequest: vi.fn(),
}));
vi.mock("../../features/projects/projectsApi", () => api);

const project: ProjectDetailData = {
  id: "project-1",
  book_number: "project-1",
  title: "雨城",
  author: "林墨",
  description: "一部关于雨夜的小说",
  cover_url: null,
  chapter_count: 3,
  word_count: 1200,
  status: "active",
  update_status: "completed",
  structure_mode: "tree",
  created_at: "2026-08-30T00:00:00Z",
  updated_at: "2026-08-30T01:00:00Z",
  initial_document: {
    id: "doc-1",
    title: "第一章",
    kind: "manuscript",
    parent_id: null,
    position: 0,
    status: "active",
    created_at: "2026-08-30T00:00:00Z",
    updated_at: "2026-08-30T00:00:00Z",
  },
};

function Location() {
  const location = useLocation();
  return (
    <output aria-label="当前地址">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderPage(path: string) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <Location />
        <Routes>
          <Route path="/projects" element={<ProjectListPage />} />
          <Route path="/projects/new" element={<ProjectFormPage />} />
          <Route
            path="/projects/:projectId/edit"
            element={<ProjectFormPage />}
          />
          <Route
            path="/projects/:projectId/details"
            element={<ProjectInfoPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("project author and details", () => {
  beforeEach(() => {
    api.listProjectsRequest.mockResolvedValue({
      items: [project],
      page: 2,
      page_size: 50,
      total: 51,
      pages: 2,
    });
    api.getProjectRequest.mockResolvedValue(project);
    api.createProjectRequest.mockResolvedValue(project);
    api.updateProjectRequest.mockResolvedValue(project);
  });
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it("restores combined search and status filters from the URL and resets pagination", async () => {
    renderPage("/projects?q=林墨&page=2&update_status=completed");
    await screen.findByText("雨城");
    expect(api.listProjectsRequest).toHaveBeenCalledWith(
      "active",
      2,
      50,
      "林墨",
      "completed",
    );
    expect(screen.getByRole("link", { name: "查看详情" })).toHaveAttribute(
      "href",
      "/projects/project-1/details",
    );
    expect(screen.getByRole("link", { name: "进入写作" })).toHaveAttribute(
      "href",
      "/projects/project-1",
    );
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "更新状态" }));
    fireEvent.click(await screen.findByText("连载中"));
    await waitFor(() =>
      expect(api.listProjectsRequest).toHaveBeenCalledWith(
        "active",
        1,
        50,
        "林墨",
        "serializing",
      ),
    );
    expect(screen.getByLabelText("当前地址")).toHaveTextContent("page=1");
    fireEvent.change(
      screen.getByRole("searchbox", { name: "搜索书名或作者名" }),
      { target: { value: "新作者" } },
    );
    await waitFor(() =>
      expect(api.listProjectsRequest).toHaveBeenCalledWith(
        "active",
        1,
        50,
        "新作者",
        "serializing",
      ),
    );
  });

  it("shows metadata on an independent detail page without the writing editor", async () => {
    renderPage("/projects/project-1/details");
    expect(
      await screen.findByRole("heading", { name: "作品详情" }),
    ).toBeVisible();
    expect(screen.getByText("作者: 林墨")).toBeVisible();
    expect(screen.getByText("3 章")).toBeVisible();
    expect(screen.getByText("1200 字")).toBeVisible();
    expect(screen.getByText(project.description)).toBeVisible();
    expect(
      screen.queryByRole("textbox", { name: "正文编辑器" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "编辑作品" })).toHaveAttribute(
      "href",
      "/projects/project-1/edit",
    );
  });

  it("creates a project with an author and keeps the initial progress hidden", async () => {
    renderPage("/projects/new");
    fireEvent.change(screen.getByLabelText("作品名"), {
      target: { value: "雨城" },
    });
    fireEvent.change(screen.getByLabelText("作者"), {
      target: { value: "林墨" },
    });
    expect(screen.getByLabelText("作者")).toHaveAttribute("maxlength", "100");
    expect(screen.queryByLabelText("更新状态")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
    await waitFor(() =>
      expect(api.createProjectRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          author: "林墨",
          title: "雨城",
          update_status: "not_started",
        }),
      ),
    );
  });

  it("loads and edits the author in the existing project form", async () => {
    renderPage("/projects/project-1/edit");
    const author = await screen.findByLabelText("作者");
    expect(author).toHaveValue("林墨");
    fireEvent.change(author, { target: { value: "新笔名" } });
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
    await waitFor(() =>
      expect(api.updateProjectRequest).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({ author: "新笔名" }),
      ),
    );
  });

  it("offers retry and a return link when detail loading fails", async () => {
    api.getProjectRequest.mockRejectedValueOnce(new Error("offline"));
    renderPage("/projects/project-1/details");
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("link", { name: "返回作品列表" })).toHaveAttribute(
      "href",
      "/projects",
    );
    fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));
    expect(await screen.findByText("雨城")).toBeVisible();
  });
});
