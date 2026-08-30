import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
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
    <QueryClientProvider client={client}>{children}</QueryClientProvider>,
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
    expect(screen.getByRole("button", { name: "创建用户" })).toBeEnabled();
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
    expect(screen.getByText("只读")).toBeInTheDocument();
  });
});
