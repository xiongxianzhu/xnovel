import {
  isThemeMode as isSharedThemeMode,
  isThemePalette as isSharedThemePalette,
  themeModes,
  themePalettes,
  type ColorScheme,
  type ThemeMode,
  type ThemePalette,
} from "@xnovel/theme";

export { themeModes, themePalettes };
export type { ColorScheme, ThemeMode, ThemePalette };

export const locales = ["zh-CN", "zh-TW", "en-US"] as const;

export type Locale = (typeof locales)[number];

export interface Appearance {
  locale: Locale;
  themePalette: ThemePalette;
  themeMode: ThemeMode;
}

export const defaultAppearance: Appearance = {
  locale: "zh-CN",
  themePalette: "manuscript-brown",
  themeMode: "system",
};

export function isLocale(value: unknown): value is Locale {
  return locales.includes(value as Locale);
}

export function isThemePalette(value: unknown): value is ThemePalette {
  return isSharedThemePalette(value);
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return isSharedThemeMode(value);
}
