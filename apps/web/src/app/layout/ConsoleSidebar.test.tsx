import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../../shared/i18n";
import {
  AuthContext,
  type AuthContextValue,
} from "../../features/auth/AuthContext";
import { ConsoleSidebar } from "./ConsoleSidebar";

function renderSidebar(role: "admin" | "user") {
  const auth: AuthContextValue = {
    changePassword: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    status: "authenticated",
    user: {
      email: null,
      id: "user-1",
      must_change_password: false,
      nickname: "作者",
      phone_e164: null,
      role,
      status: "active",
      username: "writer",
    },
  };

  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AuthContext.Provider value={auth}>
        <ConsoleSidebar />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe("ConsoleSidebar", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows administration navigation only to administrators", () => {
    renderSidebar("user");
    expect(screen.queryByText("用户")).not.toBeInTheDocument();

    cleanup();
    renderSidebar("admin");
    expect(screen.getByText("用户")).toBeInTheDocument();
    expect(screen.getByText("审计日志")).toBeInTheDocument();
  });

  it("expands the audit submenu", () => {
    renderSidebar("admin");
    fireEvent.click(screen.getByRole("button", { name: "审计日志" }));
    expect(screen.getByText("登录日志")).toBeInTheDocument();
    expect(screen.getByText("操作日志")).toBeInTheDocument();
  });

  it("uses directional chevrons and exposes sidebar state", () => {
    renderSidebar("user");
    const toggle = screen.getByRole("button", { name: "收起导航" });

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle.querySelector("svg")).toHaveClass("lucide-chevron-left");

    fireEvent.click(toggle);

    const expandButton = screen.getByRole("button", { name: "展开导航" });
    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    expect(expandButton.querySelector("svg")).toHaveClass(
      "lucide-chevron-right",
    );
  });

  it("exposes audit submenu state", () => {
    renderSidebar("admin");
    const auditButton = screen.getByRole("button", { name: "审计日志" });

    expect(auditButton).toHaveAttribute("aria-expanded", "false");
    expect(auditButton.querySelector("svg:last-of-type")).toHaveClass(
      "lucide-chevron-right",
    );

    fireEvent.click(auditButton);

    expect(auditButton).toHaveAttribute("aria-expanded", "true");
    expect(auditButton.querySelector("svg:last-of-type")).toHaveClass(
      "lucide-chevron-down",
    );
  });
});
