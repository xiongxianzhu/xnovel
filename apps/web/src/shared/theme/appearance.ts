import type {
  Appearance,
  ColorScheme,
  ThemeMode,
} from "../preferences/contracts";
import { themeValues } from "./themeValues";

const darkSchemeQuery = "(prefers-color-scheme: dark)";

export function resolveColorScheme(
  mode: ThemeMode,
  matchesDark = window.matchMedia(darkSchemeQuery).matches,
): ColorScheme {
  if (mode === "system") {
    return matchesDark ? "dark" : "light";
  }
  return mode;
}

export function applyAppearance(
  appearance: Appearance,
  root: HTMLElement = document.documentElement,
): ColorScheme {
  const colorScheme = resolveColorScheme(appearance.themeMode);
  root.lang = appearance.locale;
  root.dataset.themePalette = appearance.themePalette;
  root.dataset.colorScheme = colorScheme;
  root.style.colorScheme = colorScheme;
  const values = themeValues[appearance.themePalette][colorScheme];
  for (const [name, value] of Object.entries(values)) {
    root.style.setProperty(
      `--color-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      value,
    );
  }
  return colorScheme;
}

export function subscribeToSystemScheme(
  mode: ThemeMode,
  onChange: (scheme: ColorScheme) => void,
): () => void {
  if (mode !== "system") {
    return () => undefined;
  }
  const media = window.matchMedia(darkSchemeQuery);
  const listener = (event: MediaQueryListEvent) => {
    onChange(event.matches ? "dark" : "light");
  };
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
