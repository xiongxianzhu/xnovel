import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentSummary } from "../../shared/api/generated/types.gen";
import "../../shared/i18n";
import { ProjectPlanningPanel } from "./ProjectPlanningPanel";

const api = vi.hoisted(() => ({
  createCharacterRequest: vi.fn(),
  createWorldEntryRequest: vi.fn(),
  deleteCharacterRequest: vi.fn(),
  deleteWorldEntryRequest: vi.fn(),
  getDocumentReferencesRequest: vi.fn(),
  listCharactersRequest: vi.fn(),
  listWorldEntriesRequest: vi.fn(),
  reorderCharactersRequest: vi.fn(),
  reorderWorldEntriesRequest: vi.fn(),
  updateCharacterRequest: vi.fn(),
  updateDocumentReferencesRequest: vi.fn(),
  updateWorldEntryRequest: vi.fn(),
}));
vi.mock("./planningApi", () => api);

const time = "2026-08-28T00:00:00Z";
const manuscript: DocumentSummary = {
  created_at: time,
  id: "document-1",
  kind: "manuscript",
  parent_id: null,
  position: 0,
  status: "active",
  title: "第一章",
  updated_at: time,
};

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectPlanningPanel
        document={manuscript}
        onClose={vi.fn()}
        open
        projectId="project-1"
      />
    </QueryClientProvider>,
  );
}

describe("ProjectPlanningPanel", () => {
  beforeEach(() => {
    api.listCharactersRequest.mockResolvedValue({
      items: [
        {
          aliases: [],
          created_at: time,
          id: "character-1",
          name: "沈砚",
          position: 0,
          profile: {},
          summary: "记者",
          updated_at: time,
        },
      ],
    });
    api.listWorldEntriesRequest.mockResolvedValue({
      items: [
        {
          attributes: {},
          category: "location",
          content: "",
          created_at: time,
          id: "world-1",
          parent_id: null,
          position: 0,
          title: "雾城",
          updated_at: time,
        },
      ],
    });
    api.getDocumentReferencesRequest.mockResolvedValue({
      character_ids: [],
      document_id: "document-1",
      updated_at: time,
      world_entry_ids: [],
    });
    api.createCharacterRequest.mockResolvedValue({ id: "character-2" });
    api.updateDocumentReferencesRequest.mockResolvedValue({
      character_ids: ["character-1"],
      document_id: "document-1",
      updated_at: time,
      world_entry_ids: ["world-1"],
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("creates a character from a labeled form", async () => {
    renderPanel();
    expect(
      await screen.findByRole("button", { name: "编辑人物" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "新建人物" }));
    fireEvent.change(screen.getByLabelText("人物名称"), {
      target: { value: "林雾" },
    });
    fireEvent.click(screen.getByRole("button", { name: /保\s*存/ }));

    await waitFor(() =>
      expect(api.createCharacterRequest).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({ name: "林雾" }),
      ),
    );
  });

  it("saves explicit manuscript references", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "正文引用" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "沈砚" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "雾城" }));
    fireEvent.click(screen.getByRole("button", { name: "保存引用" }));

    await waitFor(() =>
      expect(api.updateDocumentReferencesRequest).toHaveBeenCalledWith(
        "project-1",
        "document-1",
        {
          character_ids: ["character-1"],
          world_entry_ids: ["world-1"],
        },
      ),
    );
  });
});
