import { describe, expect, it, vi } from "vitest";

import {
  createCharacterRequest,
  exportProjectRequest,
  getDocumentReferencesRequest,
  listCharactersRequest,
  listWorldEntriesRequest,
} from "./planningApi";

const generated = vi.hoisted(() => ({
  createProjectCharacter: vi.fn(),
  exportProject: vi.fn(),
  getProjectDocumentReferences: vi.fn(),
  listProjectCharacters: vi.fn(),
  listProjectWorldEntries: vi.fn(),
}));

vi.mock("../../shared/api/generated/sdk.gen", () => generated);

describe("planningApi", () => {
  it("uses generated clients for planning resources", async () => {
    generated.listProjectCharacters.mockResolvedValue({
      data: { data: { items: [] } },
    });
    generated.listProjectWorldEntries.mockResolvedValue({
      data: { data: { items: [] } },
    });
    generated.getProjectDocumentReferences.mockResolvedValue({
      data: {
        data: {
          character_ids: [],
          document_id: "document-1",
          updated_at: "now",
          world_entry_ids: [],
        },
      },
    });
    generated.createProjectCharacter.mockResolvedValue({
      data: { data: { id: "character-1" } },
    });

    await listCharactersRequest("project-1");
    await listWorldEntriesRequest("project-1");
    await getDocumentReferencesRequest("project-1", "document-1");
    await createCharacterRequest("project-1", {
      aliases: [],
      name: "沈砚",
      profile: {},
      summary: "",
    });

    expect(generated.listProjectCharacters).toHaveBeenCalledWith(
      expect.objectContaining({ path: { project_id: "project-1" } }),
    );
    expect(generated.getProjectDocumentReferences).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { document_id: "document-1", project_id: "project-1" },
      }),
    );
  });

  it("decodes the exported filename", async () => {
    generated.exportProject.mockResolvedValue({
      data: "# 作品",
      headers: {
        "content-disposition":
          "attachment; filename*=UTF-8''%E9%9B%BE%E5%9F%8E.md",
      },
    });
    await expect(
      exportProjectRequest("project-1", "markdown"),
    ).resolves.toEqual({
      content: "# 作品",
      filename: "雾城.md",
    });
  });
});
