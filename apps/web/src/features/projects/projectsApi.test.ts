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
      expect.objectContaining({ query: { page: 1, page_size: 100 } }),
    );
    expect(generated.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ body: { title: "新作品" } }),
    );
  });
});
