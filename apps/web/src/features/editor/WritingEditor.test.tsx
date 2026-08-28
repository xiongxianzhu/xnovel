import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentContentData } from "../../shared/api/generated/types.gen";
import { ApiError } from "../../shared/api/errors";
import "../../shared/i18n";
import { EditorNavigationProvider } from "./EditorNavigationProvider";
import { WritingEditor } from "./WritingEditor";

const api = vi.hoisted(() => ({
  getDocumentContentRequest: vi.fn(),
  saveDocumentContentRequest: vi.fn(),
}));

vi.mock("./editorApi", () => api);

const initial: DocumentContentData = {
  checksum: "empty",
  content: "",
  content_format: "plain_text",
  created_at: "2026-08-27T00:00:00Z",
  document_id: "document-1",
  updated_at: "2026-08-27T00:00:00Z",
  version: 1,
  word_count: 0,
};

function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EditorNavigationProvider>
        <WritingEditor
          documentId="document-1"
          documentTitle="第一章"
          projectId="project-1"
          userId="user-1"
        />
      </EditorNavigationProvider>
    </QueryClientProvider>,
  );
}

describe("WritingEditor", () => {
  beforeEach(() => {
    sessionStorage.clear();
    api.getDocumentContentRequest.mockResolvedValue(initial);
    api.saveDocumentContentRequest.mockImplementation(
      async (
        _projectId: string,
        _documentId: string,
        payload: { content: string },
      ) => ({
        ...initial,
        checksum: "saved",
        content: payload.content,
        updated_at: "2026-08-27T00:01:00Z",
        version: 2,
        word_count: 4,
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("automatically saves one second after editing", async () => {
    renderEditor();
    const editor = await screen.findByRole("textbox", { name: "正文编辑器" });
    vi.useFakeTimers();

    fireEvent.change(editor, { target: { value: "第一章 Hello" } });
    expect(screen.getByText("尚未保存")).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(api.saveDocumentContentRequest).toHaveBeenCalledWith(
      "project-1",
      "document-1",
      {
        content: "第一章 Hello",
        content_format: "plain_text",
        version: 1,
      },
    );
    expect(screen.getByText("已保存")).toBeVisible();
  });

  it("saves immediately with the keyboard shortcut", async () => {
    renderEditor();
    const editor = await screen.findByRole("textbox", { name: "正文编辑器" });
    fireEvent.change(editor, { target: { value: "快捷保存" } });
    fireEvent.keyDown(editor, { ctrlKey: true, key: "s" });

    await waitFor(() =>
      expect(api.saveDocumentContentRequest).toHaveBeenCalledOnce(),
    );
  });

  it("does not let an older save response hide newer edits", async () => {
    let resolveSave: ((value: DocumentContentData) => void) | undefined;
    api.saveDocumentContentRequest.mockReturnValueOnce(
      new Promise<DocumentContentData>((resolve) => {
        resolveSave = resolve;
      }),
    );
    renderEditor();
    const editor = await screen.findByRole("textbox", { name: "正文编辑器" });
    fireEvent.change(editor, { target: { value: "第一版" } });
    fireEvent.keyDown(editor, { ctrlKey: true, key: "s" });
    fireEvent.change(editor, { target: { value: "第二版" } });

    await act(async () => {
      resolveSave?.({
        ...initial,
        content: "第一版",
        version: 2,
        word_count: 3,
      });
    });

    await waitFor(() =>
      expect(api.saveDocumentContentRequest).toHaveBeenCalledTimes(2),
    );
    expect(api.saveDocumentContentRequest.mock.calls[1]?.[2]).toEqual({
      content: "第二版",
      content_format: "plain_text",
      version: 2,
    });
    expect(editor).toHaveValue("第二版");
    expect(screen.getByText("已保存")).toBeVisible();
  });

  it("keeps the manuscript available when saving fails", async () => {
    api.saveDocumentContentRequest.mockRejectedValueOnce(new Error("offline"));
    renderEditor();
    const editor = await screen.findByRole("textbox", { name: "正文编辑器" });
    fireEvent.change(editor, { target: { value: "不会丢失的正文" } });
    fireEvent.keyDown(editor, { ctrlKey: true, key: "s" });

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("保存失败")).toBeVisible();
    expect(editor).toHaveValue("不会丢失的正文");
    expect(
      within(alert).getByRole("button", { name: /重\s*试/ }),
    ).toBeEnabled();
  });

  it("keeps local text and shows both versions after a conflict", async () => {
    const server = { ...initial, content: "服务端正文", version: 2 };
    api.getDocumentContentRequest
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(server);
    api.saveDocumentContentRequest.mockRejectedValueOnce(
      new ApiError("CONFLICT", {
        cause: new Error("conflict"),
        code: 10005,
        data: { data: { reason: "content_version_conflict" } },
        kind: "http",
        status: 409,
      }),
    );
    renderEditor();
    const editor = await screen.findByRole("textbox", { name: "正文编辑器" });
    fireEvent.change(editor, { target: { value: "本地正文" } });
    fireEvent.keyDown(editor, { ctrlKey: true, key: "s" });

    const dialog = await screen.findByRole("dialog", { name: "比较版本" });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByDisplayValue("本地正文")).toBeVisible();
    expect(within(dialog).getByDisplayValue("服务端正文")).toBeVisible();
  });

  it("restores an explicit tab draft without silently replacing the server value", async () => {
    sessionStorage.setItem(
      "xnovel:editor-draft:v1:user-1:project-1:document-1",
      JSON.stringify({
        baseVersion: 1,
        content: "标签页草稿",
        savedAt: "2026-08-27T00:02:00Z",
      }),
    );
    renderEditor();
    const editor = await screen.findByRole("textbox", { name: "正文编辑器" });

    expect(editor).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "恢复草稿" }));
    expect(editor).toHaveValue("标签页草稿");
    expect(screen.getByText("尚未保存")).toBeVisible();
  });
});
