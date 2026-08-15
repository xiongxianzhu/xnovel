import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";
import { AppProviders } from "./providers/AppProviders";

describe("App", () => {
  it("renders the XNovel development entry", () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "XNovel" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Web 工程已准备就绪")).toBeInTheDocument();
  });
});
