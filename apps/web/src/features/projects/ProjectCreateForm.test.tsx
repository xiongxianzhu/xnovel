import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProjectCreateForm } from "./ProjectCreateForm";
import "../../shared/i18n";

describe("ProjectCreateForm", () => {
  it("validates the title and submits the normalized value", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectCreateForm
        error={null}
        isSubmitting={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "创建作品" }));
    expect(screen.getByText("请输入作品名")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("作品名"), {
      target: { value: "  新作品  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建作品" }));

    expect(onSubmit).toHaveBeenCalledWith("新作品");
  });
});
