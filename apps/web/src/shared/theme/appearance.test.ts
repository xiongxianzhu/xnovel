import { beforeEach, describe, expect, it } from "vitest";

import { defaultAppearance } from "../preferences/contracts";
import { loadAppearance, saveAppearance } from "../storage/appearance";
import { applyAppearance, resolveColorScheme } from "./appearance";
import { themeValues } from "./themeValues";

describe("appearance bootstrap", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme-palette");
    document.documentElement.removeAttribute("data-color-scheme");
  });

  it("uses safe defaults for missing or damaged cache", () => {
    expect(loadAppearance()).toEqual(defaultAppearance);
    window.localStorage.setItem("xnovel:appearance:v1", "{damaged");
    expect(loadAppearance()).toEqual(defaultAppearance);
    expect(window.localStorage.getItem("xnovel:appearance:v1")).toBeNull();
  });

  it("round trips a versioned appearance cache", () => {
    const appearance = {
      locale: "zh-TW",
      themeMode: "dark",
      themePalette: "pine-green",
    } as const;
    saveAppearance(appearance);
    expect(loadAppearance()).toEqual(appearance);
  });

  it("applies root attributes before React renders", () => {
    const scheme = applyAppearance({
      locale: "en-US",
      themeMode: "dark",
      themePalette: "graphite",
    });

    expect(scheme).toBe("dark");
    expect(document.documentElement.lang).toBe("en-US");
    expect(document.documentElement.dataset.themePalette).toBe("graphite");
    expect(document.documentElement.dataset.colorScheme).toBe("dark");
  });

  it("resolves system mode from the media query", () => {
    expect(resolveColorScheme("system", false)).toBe("light");
    expect(resolveColorScheme("system", true)).toBe("dark");
    expect(resolveColorScheme("light", true)).toBe("light");
  });

  it("defines complete light and dark values for every theme family", () => {
    for (const palette of Object.values(themeValues)) {
      for (const scheme of [palette.light, palette.dark]) {
        expect(Object.keys(scheme)).toHaveLength(14);
        expect(Object.values(scheme).every(Boolean)).toBe(true);
      }
    }
  });
});
