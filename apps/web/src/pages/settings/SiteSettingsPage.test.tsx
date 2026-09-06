import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import "../../shared/i18n";
import { SiteBrand, SiteDocumentTitle } from "../../features/site/SiteBrand";
import { SystemSettingsPage } from "./SiteSettingsPage";

const state = vi.hoisted(() => ({
  role: "admin",
  getSiteSettingsRequest: vi.fn(),
  updateSiteNameRequest: vi.fn(),
  uploadSiteLogoRequest: vi.fn(),
  deleteSiteLogoRequest: vi.fn(),
}));
vi.mock("../../features/site/siteApi", () => state);
vi.mock("../../features/auth/useAuth", () => ({
  useAuth: () => ({ user: { role: state.role } }),
}));
vi.mock("./PreferencesPage", () => ({
  PreferencesPage: () => <p>个人偏好</p>,
}));
const settings = {
  site_name: "墨雨",
  logo_url: null,
  registration_enabled: false,
};

beforeEach(() => {
  state.role = "admin";
  state.getSiteSettingsRequest.mockResolvedValue(settings);
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:logo-preview");
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function mount(brand = false) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ConfigProvider theme={{ token: { motion: false } }}>
        <MemoryRouter>
          {brand ? (
            <>
              <SiteBrand />
              <SiteDocumentTitle />
            </>
          ) : null}
          <SystemSettingsPage />
        </MemoryRouter>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

it("saves a trimmed name and immediately updates the shared brand and browser title", async () => {
  state.updateSiteNameRequest.mockResolvedValue({
    ...settings,
    site_name: "新工作室",
  });
  mount(true);
  fireEvent.change(await screen.findByLabelText("站点名称"), {
    target: { value: "  新工作室  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存名称" }));
  expect(await screen.findByText("站点名称已保存")).toBeVisible();
  expect(state.updateSiteNameRequest).toHaveBeenCalledWith(
    "新工作室",
    expect.anything(),
  );
  expect(screen.getByTitle("新工作室")).toHaveTextContent("新工作室");
  expect(
    within(screen.getByRole("region", { name: "站点 Logo" })).getByText(
      "新工作室",
    ),
  ).toBeVisible();
  expect(document.title).toBe("新工作室");
});

it("rejects blank names and preserves the input after save failure", async () => {
  state.updateSiteNameRequest.mockRejectedValue(new Error("offline"));
  mount();
  const name = await screen.findByLabelText("站点名称");
  fireEvent.change(name, { target: { value: "   " } });
  fireEvent.click(screen.getByRole("button", { name: "保存名称" }));
  await waitFor(() =>
    expect(
      screen.getByText("请输入 1–100 个字符的站点名称，不能只有空格。"),
    ).toBeVisible(),
  );
  expect(state.updateSiteNameRequest).not.toHaveBeenCalled();
  fireEvent.change(name, { target: { value: "保留输入" } });
  fireEvent.click(screen.getByRole("button", { name: "保存名称" }));
  expect(
    await screen.findByText("名称保存失败，输入已保留，请重试。"),
  ).toBeVisible();
  expect(name).toHaveValue("保留输入");
});

it("previews a Logo before explicit upload and retains the preview after failure", async () => {
  state.uploadSiteLogoRequest.mockRejectedValue(new Error("offline"));
  mount();
  const input = await screen.findByLabelText("选择 Logo 文件");
  const file = new File(["png"], "logo.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
  expect(await screen.findByAltText("站点 Logo 预览")).toHaveAttribute(
    "src",
    "blob:logo-preview",
  );
  expect(state.uploadSiteLogoRequest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "保存 Logo" }));
  expect(
    await screen.findByText(
      "Logo 保存失败，请检查图片格式、大小和尺寸后重试。",
    ),
  ).toBeVisible();
  expect(screen.getByAltText("站点 Logo 预览")).toBeVisible();
  expect(state.uploadSiteLogoRequest).toHaveBeenCalledWith(
    file,
    expect.anything(),
  );
});

it("rejects invalid or oversized files without uploading", async () => {
  mount();
  const input = await screen.findByLabelText("选择 Logo 文件");
  for (const file of [
    new File(["svg"], "logo.svg", { type: "image/svg+xml" }),
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", {
      type: "image/png",
    }),
  ]) {
    fireEvent.change(input, { target: { files: [file] } });
    expect(
      await screen.findByText("请选择不超过 5 MiB 的 PNG、JPEG 或 WebP 图片。"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "保存 Logo" })).toBeDisabled();
  }
  expect(state.uploadSiteLogoRequest).not.toHaveBeenCalled();
});

it("requires confirmation before removing the Logo and keeps the site name", async () => {
  state.getSiteSettingsRequest.mockResolvedValue({
    ...settings,
    logo_url: "/api/v1/media/logos/current.png",
  });
  state.deleteSiteLogoRequest.mockImplementation(async () => {
    state.getSiteSettingsRequest.mockResolvedValue(settings);
    return { url: null };
  });
  mount(true);
  fireEvent.click(await screen.findByRole("button", { name: "移除 Logo" }));
  await waitFor(() =>
    expect(
      screen.getByRole("dialog", { name: "移除站点 Logo？" }),
    ).toBeVisible(),
  );
  expect(state.deleteSiteLogoRequest).not.toHaveBeenCalled();
  const buttons = screen.getAllByRole("button", { name: "移除 Logo" });
  fireEvent.click(buttons[1]!);
  expect(await screen.findByText("站点 Logo 已更新")).toBeVisible();
  await waitFor(() =>
    expect(screen.queryByAltText("站点 Logo 预览")).not.toBeInTheDocument(),
  );
  expect(document.title).toBe("墨雨");
});

it("offers retry on load failure without showing editable defaults", async () => {
  state.getSiteSettingsRequest.mockRejectedValueOnce(new Error("offline"));
  mount();
  expect(await screen.findByText("站点设置加载失败，请重试。")).toBeVisible();
  expect(screen.queryByLabelText("站点名称")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));
  expect(await screen.findByLabelText("站点名称")).toHaveValue("墨雨");
});

it("shows only personal preferences to ordinary users", () => {
  state.role = "user";
  mount();
  expect(screen.getByText("个人偏好")).toBeVisible();
  expect(screen.queryByLabelText("站点名称")).not.toBeInTheDocument();
  expect(state.getSiteSettingsRequest).not.toHaveBeenCalled();
});
