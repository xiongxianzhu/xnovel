import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../../shared/i18n";
import "../../shared/styles/global.css";
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
    refreshProfile: vi.fn(),
    status: "authenticated",
    user: {
      email: null,
      avatar_url: null,
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
    localStorage.clear();
  });

  it("shows administration navigation only to administrators", () => {
    renderSidebar("user");
    expect(screen.queryByText("用户")).not.toBeInTheDocument();

    cleanup();
    renderSidebar("admin");
    expect(screen.getByText("用户")).toBeInTheDocument();
    expect(screen.getByText("审计日志")).toBeInTheDocument();
  });

  it("omits redundant sidebar and group headings", () => {
    renderSidebar("admin");
    expect(screen.queryByText("控制台导航")).not.toBeInTheDocument();
    expect(screen.queryByText("工作台")).not.toBeInTheDocument();
    expect(screen.queryByText("管理")).not.toBeInTheDocument();
    const groups = document.querySelectorAll<HTMLElement>(
      ".console-navigation-group",
    );
    expect(groups).toHaveLength(2);
    expect(getComputedStyle(groups[0]!).marginBottom).toBe("0px");
    expect(
      getComputedStyle(screen.getByRole("link", { name: "仪表盘" })).minHeight,
    ).toBe("46px");
  });

  it("expands the audit submenu", () => {
    renderSidebar("admin");
    fireEvent.click(screen.getByRole("button", { name: "审计日志" }));
    expect(screen.getByText("登录日志")).toBeInTheDocument();
    expect(screen.getByText("操作日志")).toBeInTheDocument();
  });

  it("uses directional chevrons and renders collapsed labels in a portal", async () => {
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
    const dashboard = screen.getByRole("link", { name: "仪表盘" });
    expect(dashboard.querySelector("span")).not.toBeInTheDocument();
    fireEvent.mouseEnter(dashboard);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("仪表盘");
    expect(localStorage.getItem("xnovel:console-sidebar:v1:user-1")).toBe(
      "collapsed",
    );
  });

  it("renders the collapsed audit submenu outside the sidebar scroll area", async () => {
    renderSidebar("admin");
    fireEvent.click(screen.getByRole("button", { name: "收起导航" }));
    const auditButton = screen.getByRole("button", { name: "审计日志" });

    fireEvent.click(auditButton);

    const loginLogs = await screen.findByRole("link", { name: "登录日志" });
    expect(loginLogs.closest(".console-sidebar-content")).toBeNull();
    expect(document.body).toContainElement(loginLogs);
    expect(auditButton).toHaveAttribute("aria-expanded", "true");
  });

  it("allows only vertical scrolling in the sidebar content", () => {
    renderSidebar("user");
    const content = document.querySelector<HTMLElement>(
      ".console-sidebar-content",
    );
    expect(content).not.toBeNull();
    expect(getComputedStyle(content!).overflowX).toBe("hidden");
    expect(getComputedStyle(content!).overflowY).toBe("auto");
  });

  it("restores the locally persisted collapsed state", () => {
    localStorage.setItem("xnovel:console-sidebar:v1:user-1", "collapsed");
    renderSidebar("user");
    expect(
      screen.getByRole("button", { name: "展开导航" }),
    ).toBeInTheDocument();
  });

  it("closes the mobile navigation with Escape and restores focus", async () => {
    renderSidebar("user");
    const trigger = screen.getByRole("button", { name: "打开导航" });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
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
