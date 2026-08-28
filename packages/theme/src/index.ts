export const themePalettes = [
  "manuscript-brown",
  "pine-green",
  "harbor-blue",
  "grape-purple",
  "graphite",
] as const;
export const themeModes = ["system", "light", "dark"] as const;
export type ThemePalette = (typeof themePalettes)[number];
export type ThemeMode = (typeof themeModes)[number];
export type ColorScheme = "light" | "dark";

export interface ThemeValues {
  accent: string;
  aiAccent: string;
  aiSurface: string;
  border: string;
  canvas: string;
  danger: string;
  ink: string;
  onAccent: string;
  surface: string;
  surfaceMuted: string;
  success: string;
  text: string;
  textMuted: string;
  warning: string;
}

export const themeValues: Record<
  ThemePalette,
  Record<ColorScheme, ThemeValues>
> = {
  "manuscript-brown": {
    light: {
      accent: "#8a4b2a",
      aiAccent: "#66577a",
      aiSurface: "#f0ebe4",
      border: "#d8cdc2",
      canvas: "#f7f3eb",
      danger: "#9a3f3f",
      ink: "#261a14",
      onAccent: "#ffffff",
      surface: "#fffdf8",
      surfaceMuted: "#ebe2d8",
      success: "#416a50",
      text: "#3f332c",
      textMuted: "#6b5b52",
      warning: "#9a651f",
    },
    dark: {
      accent: "#d28b5c",
      aiAccent: "#bda7d3",
      aiSurface: "#28232d",
      border: "#4a3b32",
      canvas: "#171310",
      danger: "#e88484",
      ink: "#f8f0e6",
      onAccent: "#21130b",
      surface: "#211b17",
      surfaceMuted: "#2c241e",
      success: "#77b58a",
      text: "#e6d8ca",
      textMuted: "#a99584",
      warning: "#e3b15b",
    },
  },
  "pine-green": {
    light: {
      accent: "#3f6b4d",
      aiAccent: "#5c6f63",
      aiSurface: "#e9eee7",
      border: "#cbd4c6",
      canvas: "#f3f5ef",
      danger: "#934747",
      ink: "#172019",
      onAccent: "#ffffff",
      surface: "#fcfdf9",
      surfaceMuted: "#e3e9dc",
      success: "#3f6b4d",
      text: "#29352c",
      textMuted: "#5b685f",
      warning: "#8b681f",
    },
    dark: {
      accent: "#78b48a",
      aiAccent: "#9db8aa",
      aiSurface: "#1d2925",
      border: "#39483c",
      canvas: "#111712",
      danger: "#e18585",
      ink: "#eff7f0",
      onAccent: "#0e2114",
      surface: "#182019",
      surfaceMuted: "#222c23",
      success: "#78b48a",
      text: "#d9e7db",
      textMuted: "#96aa9a",
      warning: "#dfb45e",
    },
  },
  "harbor-blue": {
    light: {
      accent: "#2f6682",
      aiAccent: "#526b86",
      aiSurface: "#e5edf2",
      border: "#c6d3da",
      canvas: "#f1f5f7",
      danger: "#974545",
      ink: "#13212b",
      onAccent: "#ffffff",
      surface: "#fbfdfe",
      surfaceMuted: "#dfe8ed",
      success: "#3d7057",
      text: "#243743",
      textMuted: "#586b76",
      warning: "#8b681f",
    },
    dark: {
      accent: "#70acd0",
      aiAccent: "#9db4d0",
      aiSurface: "#1c2832",
      border: "#344852",
      canvas: "#10171c",
      danger: "#e48686",
      ink: "#edf6fa",
      onAccent: "#0a1b26",
      surface: "#172129",
      surfaceMuted: "#202d36",
      success: "#73b48e",
      text: "#d4e5ed",
      textMuted: "#8ca7b4",
      warning: "#dfb45e",
    },
  },
  "grape-purple": {
    light: {
      accent: "#75517f",
      aiAccent: "#6a5682",
      aiSurface: "#eee6f0",
      border: "#d5c8d8",
      canvas: "#f6f2f7",
      danger: "#984747",
      ink: "#241827",
      onAccent: "#ffffff",
      surface: "#fefbff",
      surfaceMuted: "#e9e0eb",
      success: "#4d7458",
      text: "#3b2b3f",
      textMuted: "#705f74",
      warning: "#8d671d",
    },
    dark: {
      accent: "#bc8bc8",
      aiAccent: "#baa5d2",
      aiSurface: "#28202e",
      border: "#4a394e",
      canvas: "#181219",
      danger: "#e48686",
      ink: "#f7eff8",
      onAccent: "#241128",
      surface: "#211923",
      surfaceMuted: "#2c2230",
      success: "#79b58a",
      text: "#e8d9eb",
      textMuted: "#aa91b0",
      warning: "#dfb45e",
    },
  },
  graphite: {
    light: {
      accent: "#505b5e",
      aiAccent: "#5e6170",
      aiSurface: "#e9e9e7",
      border: "#cdcfcc",
      canvas: "#f4f4f2",
      danger: "#974747",
      ink: "#1c1d1d",
      onAccent: "#ffffff",
      surface: "#fdfdfc",
      surfaceMuted: "#e6e6e2",
      success: "#4c7258",
      text: "#303333",
      textMuted: "#626666",
      warning: "#8d681f",
    },
    dark: {
      accent: "#9eabad",
      aiAccent: "#a9adbe",
      aiSurface: "#232629",
      border: "#3d4443",
      canvas: "#131515",
      danger: "#e48686",
      ink: "#f3f5f4",
      onAccent: "#111617",
      surface: "#1b1e1e",
      surfaceMuted: "#252929",
      success: "#78b48a",
      text: "#dde2e0",
      textMuted: "#9aa5a1",
      warning: "#dfb45e",
    },
  },
};

export function isThemePalette(value: unknown): value is ThemePalette {
  return themePalettes.includes(value as ThemePalette);
}
export function isThemeMode(value: unknown): value is ThemeMode {
  return themeModes.includes(value as ThemeMode);
}
