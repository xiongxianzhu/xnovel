import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRef } from "react";
import "../../shared/i18n";
import { ProjectAiPanel, type ProjectAiPanelHandle } from "./ProjectAiPanel";

const api = vi.hoisted(() => ({
  applyAiResultRequest: vi.fn(),
  cancelAiTaskRequest: vi.fn(),
  createAiTaskRequest: vi.fn(),
  previewAiContextRequest: vi.fn(),
  getAiTaskRequest: vi.fn(),
  listProviderConfigsRequest: vi.fn(),
  rejectAiResultRequest: vi.fn(),
}));
const skills = vi.hoisted(() => ({ listSkillsRequest: vi.fn() }));
const sse = vi.hoisted(() => ({ streamSse: vi.fn() }));

vi.mock("./aiApi", () => ({
  ...api,
}));
vi.mock("../skills/skillsApi", () => skills);
vi.mock("../../shared/api/sse", () => sse);

describe("ProjectAiPanel", () => {
  beforeEach(() => {
    api.previewAiContextRequest.mockResolvedValue({
      estimated_input_tokens: 100,
      available_input_tokens: 8000,
      source_count: 1,
      skill_count: 0,
      document_version: 3,
    });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("sends selected text and applies only that range after confirmation", async () => {
    api.listProviderConfigsRequest.mockResolvedValue({
      items: [
        {
          id: "provider-1",
          display_name: "Provider",
          enabled: true,
          default_model_id: "model-1",
          models: [{ id: "model-1", display_name: "Model", enabled: true }],
        },
      ],
    });
    skills.listSkillsRequest.mockResolvedValue({ items: [] });
    api.createAiTaskRequest.mockResolvedValue({ id: "task-1" });
    sse.streamSse.mockResolvedValue(undefined);
    api.getAiTaskRequest.mockResolvedValue({
      status: "succeeded",
      context_manifest: { document_version: 3 },
      results: [{ id: "result-1", content: "她拆开了信。" }],
    });
    api.applyAiResultRequest.mockResolvedValue({});
    const ref = createRef<ProjectAiPanelHandle>();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProjectAiPanel
          ref={ref}
          onClose={vi.fn()}
          open
          projectId="project-1"
          document={{
            id: "doc-1",
            title: "第一章",
            kind: "manuscript",
            parent_id: null,
            position: 0,
            status: "active",
            created_at: "2026-09-05",
            updated_at: "2026-09-05",
          }}
        />
      </QueryClientProvider>,
    );
    await screen.findByLabelText("你的要求");
    act(() => {
      ref.current?.prepareSelection({
        documentId: "doc-1",
        content: "雨落下。她打开信封。窗外很静。",
        start: 4,
        end: 10,
        version: 3,
        task: "rewrite",
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "生成候选" }));
    expect(api.createAiTaskRequest).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "确认生成" }));
    await screen.findByText("她拆开了信。");
    expect(api.createAiTaskRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        selected_text: "她打开信封。",
        task_type: "rewrite",
      }),
      expect.anything(),
    );
    expect(api.applyAiResultRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "应用到选区" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认应用" }));
    await waitFor(() =>
      expect(api.applyAiResultRequest).toHaveBeenCalledWith("result-1", {
        content: "雨落下。她拆开了信。窗外很静。",
        document_id: "doc-1",
        version: 3,
      }),
    );
  });

  it("keeps streamed output as an explicit candidate", async () => {
    api.listProviderConfigsRequest.mockResolvedValue({
      items: [
        {
          default_model_id: "model-row-1",
          display_name: "OpenAI",
          enabled: true,
          id: "provider-1",
          models: [{ display_name: "GPT", enabled: true, id: "model-row-1" }],
        },
      ],
    });
    skills.listSkillsRequest.mockResolvedValue({ items: [] });
    api.createAiTaskRequest.mockResolvedValue({ id: "task-1" });
    sse.streamSse.mockImplementation(
      async (
        _path: string,
        onEvent: (event: Record<string, unknown>) => void,
      ) => {
        onEvent({ type: "status", status: "running" });
        onEvent({ type: "delta", text: "候选段落" });
        onEvent({ type: "done" });
      },
    );
    api.getAiTaskRequest.mockResolvedValue({
      results: [{ content: "候选段落", id: "result-1" }],
      status: "succeeded",
    });
    api.rejectAiResultRequest.mockResolvedValue({});

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProjectAiPanel onClose={vi.fn()} open projectId="project-1" />
      </QueryClientProvider>,
    );

    fireEvent.change(await screen.findByLabelText("你的要求"), {
      target: { value: "给我三个冲突方向" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成候选" }));
    expect(api.createAiTaskRequest).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "确认生成" }));

    expect(await screen.findByText("候选段落")).toBeVisible();
    expect(screen.getByText("AI 候选")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "应用到正文" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "舍弃" }));
    await waitFor(() =>
      expect(api.rejectAiResultRequest).toHaveBeenCalledWith(
        "result-1",
        expect.anything(),
      ),
    );
  });
});

vi.mock("../../shared/api/generated/sdk.gen", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../shared/api/generated/sdk.gen")
  >()),
  getWritingRecall: vi.fn(async () => ({
    data: { data: { summaries: [], facts: [], threads: [], stale_count: 0 } },
  })),
}));
