import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../../shared/i18n";
import { ProjectAiPanel } from "./ProjectAiPanel";

const api = vi.hoisted(() => ({
  cancelAiTaskRequest: vi.fn(),
  createAiTaskRequest: vi.fn(),
  getAiTaskRequest: vi.fn(),
  listProviderConfigsRequest: vi.fn(),
  rejectAiResultRequest: vi.fn(),
}));
const skills = vi.hoisted(() => ({ listSkillsRequest: vi.fn() }));
const sse = vi.hoisted(() => ({ streamSse: vi.fn() }));

vi.mock("./aiApi", () => ({
  ...api,
  applyAiResultRequest: vi.fn(),
}));
vi.mock("../skills/skillsApi", () => skills);
vi.mock("../../shared/api/sse", () => sse);

describe("ProjectAiPanel", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
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
