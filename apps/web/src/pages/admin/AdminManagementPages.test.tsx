import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../../shared/i18n";
import {
  listLoginAuditsRequest,
  listOperationAuditsRequest,
  listUsersRequest,
} from "../../features/admin/adminApi";
import { AdminLoginAuditPage } from "./AdminAuditPage";
import { AdminUsersPage } from "./AdminUsersPage";

vi.mock("../../features/auth/useAuth", () => ({
  useAuth: () => ({ user: { id: "admin-1", role: "admin" } }),
}));

vi.mock("../../features/admin/adminApi", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../features/admin/adminApi")>();
  return {
    ...original,
    createUserRequest: vi.fn(),
    disableUserRequest: vi.fn(),
    listLoginAuditsRequest: vi.fn(),
    listOperationAuditsRequest: vi.fn(),
    listUsersRequest: vi.fn(),
    updateUserRequest: vi.fn(),
  };
});

function renderPage(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("admin management pages", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(listLoginAuditsRequest).mockReset();
    vi.mocked(listOperationAuditsRequest).mockReset();
    vi.mocked(listUsersRequest).mockReset();
  });

  it("renders users returned by the administration API", async () => {
    vi.mocked(listUsersRequest).mockResolvedValue({
      items: [
        {
          created_at: "2026-08-28T10:00:00Z",
          email_masked: "w***@example.com",
          id: "user-1",
          last_login_at: null,
          must_change_password: false,
          nickname: "林遥",
          phone_masked: null,
          role: "user",
          status: "active",
          updated_at: "2026-08-28T10:00:00Z",
          username: "linyao",
        },
      ],
      limit: 20,
      offset: 0,
      total: 1,
    });

    renderPage(<AdminUsersPage />);

    expect(await screen.findByText("林遥")).toBeInTheDocument();
    expect(screen.getByText("w***@example.com")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual([
      "用户名",
      "昵称",
      "角色",
      "状态",
      "邮箱",
      "手机号",
      "创建时间",
      "最近登录",
      "操作",
    ]);
    expect(
      within(table).getByRole("cell", { name: "linyao" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("cell", { name: "林遥" }),
    ).toBeInTheDocument();
    const edit = screen.getByRole("link", { name: "编辑 林遥" });
    expect(edit.textContent).toBe("");
    fireEvent.focus(edit);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("编辑 林遥");
    fireEvent.blur(edit);
    fireEvent.click(screen.getByRole("button", { name: "角色" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "管理员" }));
    await waitFor(() =>
      expect(listUsersRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({ role: "admin", offset: 0 }),
      ),
    );
    expect(screen.getByRole("link", { name: "创建用户" })).toHaveAttribute(
      "href",
      "/admin/users/new",
    );
  });

  it("shows a recoverable users error state", async () => {
    vi.mocked(listUsersRequest).mockRejectedValue(new Error("offline"));

    renderPage(<AdminUsersPage />);

    expect(
      await screen.findByText("用户列表加载失败，请重试"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /重\s*试/ })).toBeEnabled();
  });

  it("shows an explicit empty login audit state", async () => {
    vi.mocked(listLoginAuditsRequest).mockResolvedValue({
      items: [],
      limit: 20,
      offset: 0,
      total: 0,
    });

    renderPage(<AdminLoginAuditPage />);

    expect(
      await screen.findByText("没有符合条件的审计记录"),
    ).toBeInTheDocument();
    expect(screen.queryByText("只读")).not.toBeInTheDocument();
  });
});

it("separates login audit fields into columns with a read-only detail link", async () => {
  vi.mocked(listLoginAuditsRequest).mockResolvedValue({
    items: [
      {
        id: "session-1",
        user_id: "user-1",
        username: "linyao",
        nickname: "林遥",
        created_ip: "192.0.2.1",
        last_ip: "192.0.2.2",
        created_at: "2026-09-01T10:00:00Z",
        last_used_at: "2026-09-02T10:00:00Z",
        expires_at: "2026-09-03T10:00:00Z",
        revoked_at: null,
        revoke_reason: null,
        user_agent: "Synthetic browser",
      },
    ],
    total: 1,
    offset: 0,
    limit: 50,
  });
  renderPage(<AdminLoginAuditPage />);
  const table = await screen.findByRole("table");
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent),
  ).toEqual([
    "用户名",
    "昵称",
    "登录 IP",
    "最近 IP",
    "登录时间",
    "最后使用",
    "会话状态",
    "操作",
  ]);
  for (const value of ["linyao", "林遥", "192.0.2.1", "192.0.2.2"])
    expect(
      within(table).getByRole("cell", { name: value }),
    ).toBeInTheDocument();
  expect(within(table).getByRole("link", { name: "详情" })).toHaveAttribute(
    "href",
    "/admin/audit/login/session-1",
  );
  cleanup();
});
