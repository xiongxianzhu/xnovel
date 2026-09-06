import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./useAuth";

vi.mock("./authApi", () => ({
  getProfileRequest: vi.fn(),
  changePasswordRequest: vi.fn(),
  refreshAccessToken: vi.fn(async () => {
    throw new Error("no session");
  }),
  logoutRequest: vi.fn(async () => undefined),
  loginRequest: vi.fn(async ({ identifier }: { identifier: string }) => ({
    accessToken: `token-${identifier}`,
    user: {
      id: identifier,
      username: identifier,
      nickname: identifier,
      role: "user",
      status: "active",
      must_change_password: false,
    },
  })),
}));
afterEach(cleanup);

it("does not expose the previous account cache, including late responses", async () => {
  const clients = new Map<string, QueryClient>();
  function Probe() {
    const { user, status, login, logout } = useAuth();
    const client = useQueryClient();
    const data = useQuery({
      queryKey: ["private"],
      queryFn: async () => "",
      enabled: false,
    });
    return (
      <>
        <p>{status}</p>
        <p>{user?.id ?? "anonymous"}</p>
        <p>{data.data ?? "empty"}</p>
        <button onClick={() => void login("user-a", "test")}>登录甲</button>
        <button onClick={() => void login("user-b", "test")}>登录乙</button>
        <button
          onClick={() => {
            if (user) clients.set(user.id, client);
            client.setQueryData(["private"], "甲的私有正文");
          }}
        >
          缓存正文
        </button>
        <button onClick={() => void logout()}>退出</button>
      </>
    );
  }
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await screen.findByText("anonymous");
  fireEvent.click(screen.getByRole("button", { name: "登录甲" }));
  await screen.findByText("user-a");
  fireEvent.click(screen.getByRole("button", { name: "缓存正文" }));
  expect(await screen.findByText("甲的私有正文")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "退出" }));
  await waitFor(() =>
    expect(screen.queryByText("甲的私有正文")).not.toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: "登录乙" }));
  await screen.findByText("user-b");
  clients.get("user-a")!.setQueryData(["private"], "甲的迟到响应");
  expect(screen.queryByText("甲的迟到响应")).not.toBeInTheDocument();
  expect(screen.getByText("empty")).toBeVisible();
});
