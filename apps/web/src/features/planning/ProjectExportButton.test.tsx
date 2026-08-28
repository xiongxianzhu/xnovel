import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../../shared/i18n";
import { ProjectExportButton } from "./ProjectExportButton";

const api = vi.hoisted(() => ({ exportProjectRequest: vi.fn() }));
vi.mock("./planningApi", () => api);

describe("ProjectExportButton", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("downloads Markdown by default from the export menu", async () => {
    api.exportProjectRequest.mockResolvedValue({
      content: "# 雾城",
      filename: "雾城.md",
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    render(<ProjectExportButton projectId="project-1" />);

    fireEvent.click(screen.getByRole("button", { name: "导出" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Markdown/ }));

    await waitFor(() =>
      expect(api.exportProjectRequest).toHaveBeenCalledWith(
        "project-1",
        "markdown",
      ),
    );
    expect(click).toHaveBeenCalledOnce();
  });
});
