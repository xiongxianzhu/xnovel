import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentSummary } from "../../shared/api/generated/types.gen";
import "../../shared/i18n";
import { EditorNavigationProvider } from "../editor/EditorNavigationProvider";
import { ProjectDocumentSidebar } from "./ProjectDocumentSidebar";

const api = vi.hoisted(() => ({
  createProjectDocumentRequest: vi.fn(),
  deleteProjectDocumentRequest: vi.fn(),
  listProjectDocumentsRequest: vi.fn(),
  reorderProjectDocumentsRequest: vi.fn(),
  updateProjectDocumentRequest: vi.fn(),
}));

vi.mock("./documentsApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./documentsApi")>()),
  ...api,
}));

function document(
  id: string,
  title: string,
  parentId: string | null,
  position: number,
  kind: "folder" | "manuscript" = "manuscript",
  status: "active" | "archived" = "active",
): DocumentSummary {
  return {
    created_at: "2026-08-27T00:00:00Z",
    id,
    kind,
    parent_id: parentId,
    position,
    status,
    title,
    updated_at: "2026-08-27T00:00:00Z",
  };
}

const activeDocuments = [
  document("folder", "第一卷", null, 0, "folder"),
  document("chapter-one", "第一章", "folder", 0),
  document("chapter-two", "第二章", "folder", 1),
];

function renderSidebar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={["/projects/project-1"]}>
      <QueryClientProvider client={queryClient}>
        <EditorNavigationProvider>
          <ProjectDocumentSidebar projectId="project-1" userId="user-1" />
        </EditorNavigationProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("ProjectDocumentSidebar", () => {
  beforeEach(() => {
    api.listProjectDocumentsRequest.mockImplementation(
      async (_projectId: string, status: "active" | "archived") => ({
        items:
          status === "archived"
            ? [
                document(
                  "archived",
                  "旧章节",
                  null,
                  0,
                  "manuscript",
                  "archived",
                ),
              ]
            : activeDocuments,
      }),
    );
    api.createProjectDocumentRequest.mockResolvedValue(activeDocuments[0]);
    api.updateProjectDocumentRequest.mockResolvedValue(activeDocuments[0]);
    api.deleteProjectDocumentRequest.mockResolvedValue({
      deleted: true,
      id: "chapter-one",
    });
    api.reorderProjectDocumentsRequest.mockResolvedValue({
      items: activeDocuments,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders a hierarchical tree and switches to archived documents", async () => {
    renderSidebar();

    expect(
      await screen.findByRole("tree", { name: "作品文档树" }),
    ).toBeInTheDocument();
    expect(screen.getByText("第一卷")).toBeVisible();
    expect(screen.getByText("第一章")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "已归档" }));
    expect(await screen.findByText("旧章节")).toBeVisible();
    expect(api.listProjectDocumentsRequest).toHaveBeenCalledWith(
      "project-1",
      "archived",
    );
  });

  it("creates a normalized folder through the accessible dialog", async () => {
    renderSidebar();
    await screen.findByText("第一卷");

    fireEvent.click(screen.getByRole("button", { name: "新建" }));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "新建文件夹" }),
    );
    fireEvent.change(screen.getByLabelText("文档标题"), {
      target: { value: "  第二卷  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));

    await waitFor(() =>
      expect(api.createProjectDocumentRequest).toHaveBeenCalledWith(
        "project-1",
        {
          kind: "folder",
          parent_id: null,
          title: "第二卷",
        },
      ),
    );
  });

  it("moves a document upward from the keyboard-accessible action menu", async () => {
    renderSidebar();
    await screen.findByText("第二章");

    fireEvent.click(screen.getByRole("button", { name: "第二章的操作" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "上移" }));

    await waitFor(() =>
      expect(api.reorderProjectDocumentsRequest).toHaveBeenCalledOnce(),
    );
    const payload = api.reorderProjectDocumentsRequest.mock.calls[0]?.[1];
    expect(
      payload.groups[0].items.map((item: { id: string }) => item.id),
    ).toEqual(["chapter-two", "chapter-one"]);
  });

  it("closes the narrow-screen drawer with Escape and returns focus", async () => {
    renderSidebar();
    await screen.findByText("第一卷");
    const trigger = screen.getByRole("button", { name: "打开作品文档树" });

    fireEvent.click(trigger);
    fireEvent.keyDown(window.document, { key: "Escape" });

    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
