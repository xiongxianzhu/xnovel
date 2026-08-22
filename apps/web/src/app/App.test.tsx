import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { AppProviders } from "./providers/AppProviders";

vi.mock("../features/auth/authApi", () => ({
  getProfileRequest: vi.fn(),
  loginRequest: vi.fn(),
  logoutRequest: vi.fn(),
  refreshAccessToken: vi.fn().mockRejectedValue(new Error("no session")),
}));

describe("App", () => {
  it("routes an anonymous visitor to login", async () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: "登录 xnovel" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("用户名、邮箱或手机号")).toBeInTheDocument();
  });
});
