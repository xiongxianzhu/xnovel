import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import "../../shared/i18n";
import { PreferencesPage } from "../../pages/settings/PreferencesPage";
import { HeaderPreferences } from "./HeaderPreferences";
import {
  PreferenceContext,
  type PreferenceContextValue,
} from "./PreferenceContext";

afterEach(cleanup);
function mount(
  overrides: Partial<PreferenceContextValue> = {},
  page = <HeaderPreferences />,
) {
  const value: PreferenceContextValue = {
    appearance: {
      locale: "zh-CN",
      themeMode: "system",
      themePalette: "manuscript-brown",
    },
    isLoading: false,
    loadError: false,
    saveError: null,
    pendingFields: new Set(),
    retry: vi.fn(),
    setLocale: vi.fn(),
    setThemeMode: vi.fn(),
    setThemePalette: vi.fn(),
    ...overrides,
  };
  render(
    <PreferenceContext.Provider value={value}>
      {page}
    </PreferenceContext.Provider>,
  );
  return value;
}
it("routes language selection through the existing preference persistence", async () => {
  const value = mount();
  expect(screen.getByRole("button", { name: "外观" }).textContent).toBe("");
  expect(screen.getByRole("button", { name: "界面语言" })).toHaveTextContent(
    "中",
  );
  expect(screen.queryByText("简体中文")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "界面语言" }));
  fireEvent.click(await screen.findByText("English"));
  expect(value.setLocale).toHaveBeenCalledWith("en-US");
});
it("supports palette and display mode without confusing their values", async () => {
  const value = mount();
  fireEvent.click(screen.getByRole("button", { name: "外观" }));
  fireEvent.click(await screen.findByText("松林绿"));
  expect(value.setThemePalette).toHaveBeenCalledWith("pine-green");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "外观" })).toHaveAttribute(
      "aria-expanded",
      "false",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "外观" }));
  fireEvent.click(await screen.findByText("深色"));
  expect(value.setThemeMode).toHaveBeenCalledWith("dark");
});
it("reports failed saves visibly", () => {
  mount({ saveError: "common:saveFailed" });
  expect(screen.getByRole("alert")).toHaveTextContent("保存失败");
});

it("shows five selectable theme previews in preferences and preserves saving", () => {
  const value = mount({}, <PreferencesPage />);
  const group = screen.getByRole("radiogroup", { name: "主题家族" });
  expect(within(group).getAllByRole("radio")).toHaveLength(5);
  expect(within(group).getByRole("radio", { name: "手稿棕" })).toBeChecked();
  fireEvent.click(within(group).getByRole("radio", { name: "港湾蓝" }));
  expect(value.setThemePalette).toHaveBeenCalledWith("harbor-blue");
});
