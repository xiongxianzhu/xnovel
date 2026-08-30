import { describe, expect, it, vi } from "vitest";

import { createProjectRequest, listProjectsRequest } from "./projectsApi";

const generated = vi.hoisted(() => ({
  createProject: vi.fn(),
  listProjects: vi.fn(),
}));

vi.mock("../../shared/api/generated/sdk.gen", () => generated);

describe("projectsApi", () => {
  it("uses the generated client for list and create requests", async () => {
    generated.listProjects.mockResolvedValue({
      data: {
        data: { items: [], page: 1, page_size: 100, pages: 0, total: 0 },
      },
    });
    generated.createProject.mockResolvedValue({
      data: { data: { id: "project-1" } },
    });

    await listProjectsRequest();
    await createProjectRequest({ title: "新作品" });

    expect(generated.listProjects).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          page: 1,
          page_size: 50,
          q: undefined,
          view: "active",
          update_status: undefined,
        },
      }),
    );
    expect(generated.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ body: { title: "新作品" } }),
    );
    await listProjectsRequest("archived", 2, 50, "林墨", "completed");
    expect(generated.listProjects).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: {
          page: 2,
          page_size: 50,
          q: "林墨",
          view: "archived",
          update_status: "completed",
        },
      }),
    );
  });
});
