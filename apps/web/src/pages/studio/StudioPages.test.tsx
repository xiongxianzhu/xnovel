import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../shared/i18n";
import { PlanningRecordPage, ReferencesPage } from "./PlanningPages";
import { StudioRecordPage } from "./StudioPages";
import { ImportPage } from "./DeliveryPages";

const api = vi.hoisted(() => ({
  previewManuscriptImport: vi.fn(),
  commitManuscriptImport: vi.fn(),
  createProjectDocument: vi.fn(),
  listProjectDocuments: vi.fn(),
  getProjectDocument: vi.fn(),
  listProjectCharacters: vi.fn(),
  listProjectWorldEntries: vi.fn(),
  getProjectDocumentReferences: vi.fn(),
  updateProjectDocumentReferences: vi.fn(),
  getStudioSummary: vi.fn(),
  updateStudioSummary: vi.fn(),
  getProjectDocumentContent: vi.fn(),
}));
vi.mock("../../shared/api/generated/sdk.gen", async (original) => ({
  ...(await original<typeof import("../../shared/api/generated/sdk.gen")>()),
  ...api,
}));
vi.mock("../../features/auth/useAuth", () => ({
  useAuth: () => ({ user: { id: "author-1" } }),
}));
const time = "2026-09-06T00:00:00Z";
const doc = {
  id: "document-1",
  title: "第一章",
  kind: "manuscript",
  parent_id: null,
  position: 0,
  status: "active",
  created_at: time,
  updated_at: time,
};
function response(data: unknown) {
  return { data: { data } };
}
function setup(route: string, path: string, element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path={path} element={element} />
          <Route path="*" element={<p>已保存</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("independent studio editors", () => {
  it("creates a folder with normalized title from the standalone page", async () => {
    api.listProjectDocuments.mockResolvedValue(response({ items: [] }));
    api.createProjectDocument.mockResolvedValue(
      response({ ...doc, id: "new-folder", kind: "folder", title: "第二卷" }),
    );
    api.getProjectDocument.mockResolvedValue(
      response({ ...doc, id: "new-folder", kind: "folder", title: "第二卷" }),
    );
    setup(
      "/projects/project-1/documents/new?kind=folder",
      "/projects/:projectId/documents/:recordId",
      <PlanningRecordPage />,
    );
    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "  第二卷  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
    await waitFor(() =>
      expect(api.createProjectDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { title: "第二卷", kind: "folder", parent_id: null },
        }),
      ),
    );
    expect(
      await screen.findByRole("heading", { name: "第二卷" }),
    ).toBeVisible();
  });
  it("edits explicit chapter references on the dedicated page", async () => {
    api.getProjectDocumentReferences.mockResolvedValue(
      response({
        document_id: doc.id,
        character_ids: [],
        world_entry_ids: [],
        updated_at: time,
      }),
    );
    api.listProjectCharacters.mockResolvedValue(
      response({ items: [{ id: "character-1", name: "沈砚" }] }),
    );
    api.listProjectWorldEntries.mockResolvedValue(
      response({ items: [{ id: "world-1", title: "雾城" }] }),
    );
    api.updateProjectDocumentReferences.mockResolvedValue(
      response({
        character_ids: ["character-1"],
        world_entry_ids: ["world-1"],
      }),
    );
    setup(
      "/projects/project-1/references/document-1/edit",
      "/projects/:projectId/references/:documentId/edit",
      <ReferencesPage />,
    );
    fireEvent.click(await screen.findByRole("checkbox", { name: "沈砚" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "雾城" }));
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
    await waitFor(() =>
      expect(api.updateProjectDocumentReferences).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.objectContaining({
            project_id: "project-1",
            document_id: "document-1",
          }),
          body: {
            character_ids: ["character-1"],
            world_entry_ids: ["world-1"],
          },
        }),
      ),
    );
  });
  it("keeps edits after a conflict and only refreshes the source version explicitly", async () => {
    api.getStudioSummary.mockResolvedValue(
      response({
        id: "summary-1",
        project_id: "project-1",
        title: "第一章前情",
        body: "旧摘要",
        source_document_id: doc.id,
        source_version: 1,
        source_stale: true,
        source_missing: false,
        status: "confirmed",
        version: 2,
        created_at: time,
        updated_at: time,
      }),
    );
    api.listProjectDocuments.mockResolvedValue(response({ items: [doc] }));
    api.listProjectCharacters.mockResolvedValue(response({ items: [] }));
    api.getProjectDocumentContent.mockResolvedValue(
      response({ document_id: doc.id, content: "新正文", version: 3 }),
    );
    api.updateStudioSummary.mockRejectedValue(new Error("conflict"));
    setup(
      "/projects/project-1/studio/summaries/summary-1/edit",
      "/projects/:projectId/studio/:kind/:recordId/edit",
      <StudioRecordPage />,
    );
    fireEvent.change(await screen.findByLabelText("内容"), {
      target: { value: "修改后的摘要" },
    });
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
    await waitFor(() =>
      expect(api.updateStudioSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ source_version: 1, version: 2 }),
        }),
      ),
    );
    expect(
      await screen.findByText("操作失败，请重试；输入内容已保留。"),
    ).toBeVisible();
    expect(screen.getByLabelText("内容")).toHaveValue("修改后的摘要");
    fireEvent.click(
      screen.getByRole("button", { name: "已核对，使用当前来源版本" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));
    await waitFor(() =>
      expect(api.updateStudioSummary).toHaveBeenLastCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ source_version: 3, version: 2 }),
        }),
      ),
    );
  });
});

it("keeps import as an editable preview until the author confirms", async () => {
  api.previewManuscriptImport.mockResolvedValue(
    response({
      title: "旧稿",
      encoding: "utf-8",
      duplicate_titles: [],
      chapters: [{ title: "第一章", content: "合成稿件内容" }],
    }),
  );
  api.commitManuscriptImport.mockResolvedValue(
    response({ project_id: "new-project", imported: 1, skipped: 0 }),
  );
  setup("/projects/import", "/projects/import", <ImportPage />);
  fireEvent.change(screen.getByLabelText(/稿件文件/), {
    target: {
      files: [
        new File(["第一章\n合成稿件内容"], "旧稿.txt", { type: "text/plain" }),
      ],
    },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: /预\s*览/ }).closest("form")!,
  );
  const body = await screen.findByLabelText("内容");
  expect(api.commitManuscriptImport).not.toHaveBeenCalled();
  fireEvent.change(body, { target: { value: "作者修订后的稿件" } });
  fireEvent.click(screen.getByRole("button", { name: "确认导入" }));
  await waitFor(() =>
    expect(api.commitManuscriptImport).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          chapters: [{ title: "第一章", content: "作者修订后的稿件" }],
          duplicate_policy: "keep",
        }),
      }),
    ),
  );
});
