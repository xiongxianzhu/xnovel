import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import "../../shared/i18n";
import { SkillsWorkspacePage } from "./SkillsWorkspacePage";

const state = vi.hoisted(() => ({
  role: "admin",
  listSkillsRequest: vi.fn(),
  listAdminSkillsRequest: vi.fn(),
}));
vi.mock("../../features/auth/useAuth", () => ({
  useAuth: () => ({ user: { role: state.role } }),
}));
vi.mock("../../features/skills/skillsApi", () => ({
  listSkillsRequest: state.listSkillsRequest,
  listAdminSkillsRequest: state.listAdminSkillsRequest,
  deleteSkillRequest: vi.fn(),
  getSkillResourceRequest: vi.fn(),
  setSkillEnabledRequest: vi.fn(),
  updateSkillMarkdownRequest: vi.fn(),
  uploadSkillRequest: vi.fn(),
  quarantineSkillRequest: vi.fn(),
  releaseSkillRequest: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Location() {
  const location = useLocation();
  return (
    <output aria-label="当前地址">
      {location.pathname}
      {location.search}
    </output>
  );
}

function mount(role = "admin", path = "/skills") {
  state.role = role;
  state.listSkillsRequest.mockResolvedValue({ items: [] });
  state.listAdminSkillsRequest.mockResolvedValue({ items: [] });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <SkillsWorkspacePage />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("keeps security within Skills and loads it only when selected", async () => {
  mount();
  expect(await screen.findByRole("heading", { name: "Skills" })).toBeVisible();
  expect(state.listAdminSkillsRequest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("tab", { name: "安全管理" }));
  expect(
    await screen.findByRole("heading", { name: "Skill 安全管理" }),
  ).toBeVisible();
  expect(state.listAdminSkillsRequest).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("当前地址")).toHaveTextContent(
    "/skills?tab=security",
  );
  fireEvent.click(screen.getByRole("tab", { name: "个人 Skills" }));
  expect(await screen.findByRole("heading", { name: "Skills" })).toBeVisible();
});

it("restores the administrator security tab from the URL", async () => {
  mount("admin", "/skills?tab=security");
  expect(
    await screen.findByRole("heading", { name: "Skill 安全管理" }),
  ).toBeVisible();
  expect(screen.getByRole("tab", { name: "安全管理" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(state.listSkillsRequest).not.toHaveBeenCalled();
});

it("never exposes or requests administrator data for ordinary users", async () => {
  mount("user", "/skills?tab=security");
  expect(await screen.findByRole("heading", { name: "Skills" })).toBeVisible();
  expect(
    screen.queryByRole("tab", { name: "安全管理" }),
  ).not.toBeInTheDocument();
  expect(state.listAdminSkillsRequest).not.toHaveBeenCalled();
});
