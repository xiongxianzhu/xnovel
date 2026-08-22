export const locales = ["zh-CN", "zh-TW", "en-US"] as const;
export const themePalettes = [
  "manuscript-brown",
  "pine-green",
  "harbor-blue",
  "grape-purple",
  "graphite",
] as const;
export const themeModes = ["system", "light", "dark"] as const;

export type Locale = (typeof locales)[number];
export type ThemePalette = (typeof themePalettes)[number];
export type ThemeMode = (typeof themeModes)[number];
export type ColorScheme = "light" | "dark";

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
  return themePalettes.includes(value as ThemePalette);
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return themeModes.includes(value as ThemeMode);
}
