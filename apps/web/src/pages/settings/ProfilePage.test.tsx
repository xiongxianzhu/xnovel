import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AuthContext,
  type AuthContextValue,
} from "../../features/auth/AuthContext";
import type { UserProfileData } from "../../shared/api/generated/types.gen";
import "../../shared/i18n";
import { ProfilePage } from "./ProfilePage";

const authApi = vi.hoisted(() => ({ getProfileRequest: vi.fn() }));
const profileApi = vi.hoisted(() => ({
  deleteAvatarRequest: vi.fn(),
  setAvatarUrlRequest: vi.fn(),
  updateProfileRequest: vi.fn(),
  uploadAvatarRequest: vi.fn(),
}));

vi.mock("../../features/auth/authApi", () => authApi);
vi.mock("../../features/profile/profileApi", () => profileApi);

const profile: UserProfileData = {
  address: "上海",
  avatar_source: "url",
  avatar_url: "/api/v1/media/avatars/example.png",
  birthday: null,
  created_at: "2026-08-30T00:00:00Z",
  email: "writer@example.com",
  email_verified_at: null,
  id: "user-1",
  last_login_at: null,
  must_change_password: false,
  nickname: "作者",
  phone_e164: "+8613800138000",
  phone_verified_at: null,
  role: "user",
  status: "active",
  updated_at: "2026-08-30T00:00:00Z",
  username: "writer",
};

function renderPage() {
  const auth: AuthContextValue = {
    changePassword: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    refreshProfile: vi.fn(async () => profile),
    status: "authenticated",
    user: {
      avatar_url: profile.avatar_url,
      email: profile.email,
      id: profile.id,
      must_change_password: false,
      nickname: profile.nickname,
      phone_e164: profile.phone_e164,
      role: "user",
      status: "active",
      username: profile.username,
    },
  };
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <ProfilePage />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe("ProfilePage", () => {
  beforeEach(() => {
    authApi.getProfileRequest.mockResolvedValue(profile);
    profileApi.updateProfileRequest.mockResolvedValue({
      ...profile,
      email: "new@example.com",
      nickname: "新昵称",
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("previews the avatar and requires the current password for contact changes", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "个人资料" }),
    ).toBeVisible();
    expect(screen.getByText("点击或拖拽上传头像")).toBeVisible();
    expect(screen.queryByLabelText("在线头像地址")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "在线图片" }));
    expect(await screen.findByLabelText("在线头像地址")).toBeVisible();
    expect(screen.getByText("点击或拖拽上传头像")).not.toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "预览头像" }));
    const preview = await screen.findByRole("img", {
      name: "当前头像大图预览",
    });
    expect(preview).toHaveAttribute(
      "src",
      "http://127.0.0.1:8000/api/v1/media/avatars/example.png",
    );

    fireEvent.change(screen.getByLabelText("昵称"), {
      target: { value: "新昵称" },
    });
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(await screen.findByLabelText("当前密码"), {
      target: { value: "Abcdef12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存个人资料" }));

    await waitFor(() =>
      expect(profileApi.updateProfileRequest).toHaveBeenCalledOnce(),
    );
    expect(profileApi.updateProfileRequest.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        current_password: "Abcdef12",
        email: "new@example.com",
        nickname: "新昵称",
        username: "writer",
      }),
    );
  });
});
