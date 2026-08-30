import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AuthContext,
  type AuthContextValue,
} from "../../features/auth/AuthContext";
import "../../shared/i18n";
import { PasswordChangePage } from "./PasswordChangePage";

describe("PasswordChangePage", () => {
  afterEach(cleanup);

  it("accepts an 8-32 character password containing two character types", async () => {
    const changePassword = vi.fn(async () => undefined);
    const auth: AuthContextValue = {
      changePassword,
      login: vi.fn(),
      logout: vi.fn(),
      refreshProfile: vi.fn(),
      status: "authenticated",
      user: {
        avatar_url: null,
        email: "writer@example.com",
        id: "user-1",
        must_change_password: false,
        nickname: "作者",
        phone_e164: null,
        role: "user",
        status: "active",
        username: "writer",
      },
    };
    render(
      <MemoryRouter initialEntries={["/settings/password"]}>
        <AuthContext.Provider value={auth}>
          <Routes>
            <Route path="/settings/password" element={<PasswordChangePage />} />
            <Route path="/settings/profile" element={<div>资料页</div>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("当前密码"), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "Abcdefgh" },
    });
    fireEvent.change(screen.getByLabelText("确认新密码"), {
      target: { value: "Abcdefgh" },
    });
    fireEvent.click(screen.getByRole("button", { name: "修改密码" }));

    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith("old-password", "Abcdefgh"),
    );
    expect(await screen.findByText("资料页")).toBeVisible();
  });
});
