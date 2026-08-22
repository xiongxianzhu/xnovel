import type { ColorScheme, ThemePalette } from "../preferences/contracts";

export interface ThemeValues {
  accent: string;
  border: string;
  canvas: string;
  danger: string;
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
      border: "#d8cdc2",
      canvas: "#f7f3eb",
      danger: "#9a3f3f",
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
      border: "#4a3b32",
      canvas: "#171310",
      danger: "#e88484",
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
      border: "#cbd4c6",
      canvas: "#f3f5ef",
      danger: "#934747",
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
      border: "#39483c",
      canvas: "#111712",
      danger: "#e18585",
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
      border: "#c6d3da",
      canvas: "#f1f5f7",
      danger: "#974545",
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
      border: "#344852",
      canvas: "#10171c",
      danger: "#e48686",
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
      border: "#d5c8d8",
      canvas: "#f6f2f7",
      danger: "#984747",
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
      border: "#4a394e",
      canvas: "#181219",
      danger: "#e48686",
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
      border: "#cdcfcc",
      canvas: "#f4f4f2",
      danger: "#974747",
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
      border: "#3d4443",
      canvas: "#131515",
      danger: "#e48686",
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
