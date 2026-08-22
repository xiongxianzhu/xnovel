import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useTranslation } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { UserPreferenceData } from "../../shared/api/generated/types.gen";
import { AuthContext, type AuthContextValue } from "../auth/AuthContext";
import { PreferenceProvider } from "./PreferenceProvider";
import {
  getPreferencesRequest,
  updatePreferencesRequest,
} from "./preferencesApi";
import { usePreferences } from "./usePreferences";

vi.mock("./preferencesApi", () => ({
  getPreferencesRequest: vi.fn(),
  updatePreferencesRequest: vi.fn(),
}));

const auth: AuthContextValue = {
  changePassword: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  status: "authenticated",
  user: {
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

const serverPreference: UserPreferenceData = {
  created_at: "2026-08-21T12:00:00Z",
  locale: "zh-CN",
  theme_mode: "system",
  theme_palette: "manuscript-brown",
  updated_at: "2026-08-21T12:00:00Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

function Consumer() {
  const { appearance, saveError, setThemeMode } = usePreferences();
  const { t } = useTranslation("common");
  return (
    <>
      <output aria-label="mode">{appearance.themeMode}</output>
      <button type="button" onClick={() => setThemeMode("dark")}>
        dark
      </button>
      <button type="button" onClick={() => setThemeMode("light")}>
        light
      </button>
      {saveError ? <p role="alert">{t("saveFailed")}</p> : null}
    </>
  );
}

describe("PreferenceProvider", () => {
  it("keeps the newest choice and rolls it back to the latest server result", async () => {
    vi.mocked(getPreferencesRequest).mockResolvedValue(serverPreference);
    const first = deferred<typeof serverPreference>();
    const second = deferred<typeof serverPreference>();
    vi.mocked(updatePreferencesRequest)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })
        }
      >
        <AuthContext.Provider value={auth}>
          <PreferenceProvider>
            <Consumer />
          </PreferenceProvider>
        </AuthContext.Provider>
      </QueryClientProvider>,
    );

    expect(await screen.findByLabelText("mode")).toHaveTextContent("system");
    fireEvent.click(screen.getByRole("button", { name: "dark" }));
    fireEvent.click(screen.getByRole("button", { name: "light" }));
    expect(screen.getByLabelText("mode")).toHaveTextContent("light");

    await act(async () => {
      first.resolve({ ...serverPreference, theme_mode: "dark" });
      await first.promise;
    });
    expect(screen.getByLabelText("mode")).toHaveTextContent("light");

    await act(async () => {
      second.reject(new Error("save failed"));
      await second.promise.catch(() => undefined);
    });
    expect(screen.getByLabelText("mode")).toHaveTextContent("dark");
    expect(screen.getByRole("alert")).toHaveTextContent("保存失败，请重试");
  });
});
