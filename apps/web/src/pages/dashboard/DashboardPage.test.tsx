import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import "../../shared/i18n";
import { DashboardPage } from "./DashboardPage";

const api = vi.hoisted(() => ({ listProjectsRequest: vi.fn() }));
vi.mock("../../features/projects/projectsApi", () => api);
vi.mock("../../features/auth/useAuth", () => ({
  useAuth: () => ({ user: { id: "author", nickname: "作者" } }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it("shows real recent works and replaces a broken cover with the title", async () => {
  api.listProjectsRequest.mockResolvedValue({
    items: [
      {
        id: "book-1",
        title: "雨城",
        author: "林墨",
        description: "雨夜故事",
        chapter_count: 3,
        word_count: 1000,
        cover_url: "https://example.com/cover.png",
      },
    ],
  });
  mount();
  const coverLink = await screen.findByRole("link", { name: "继续写作 雨城" });
  expect(coverLink).toHaveAttribute("href", "/projects/book-1");
  expect(api.listProjectsRequest).toHaveBeenCalledWith("active", 1, 4);
  fireEvent.error(coverLink.querySelector("img")!);
  expect(coverLink).toHaveTextContent("雨城");
  expect(screen.getByText("3 章 · 1000 字")).toBeVisible();
});
it("offers creation without a fabricated resume item when there are no works", async () => {
  api.listProjectsRequest.mockResolvedValue({ items: [] });
  mount();
  expect(await screen.findByText("你的第一部作品，从这里开始")).toBeVisible();
  expect(screen.getByRole("link", { name: "创建作品" })).toHaveAttribute(
    "href",
    "/projects/new",
  );
  expect(
    screen.queryByRole("link", { name: "继续写作" }),
  ).not.toBeInTheDocument();
});
it("shows an actionable error instead of reporting an empty library", async () => {
  api.listProjectsRequest.mockRejectedValue(new Error("offline"));
  mount();
  expect(await screen.findByRole("button", { name: /重\s*试/ })).toBeVisible();
  expect(
    screen.queryByText("你的第一部作品，从这里开始"),
  ).not.toBeInTheDocument();
});
