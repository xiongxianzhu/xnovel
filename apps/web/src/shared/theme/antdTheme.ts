import { theme, type ThemeConfig } from "antd";

import type { ColorScheme, ThemePalette } from "../preferences/contracts";
import { themeValues } from "./themeValues";

export function createAntdTheme(
  colorScheme: ColorScheme,
  palette: ThemePalette,
): ThemeConfig {
  const values = themeValues[palette][colorScheme];
  return {
    algorithm:
      colorScheme === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      borderRadius: 2,
      colorBgBase: values.canvas,
      colorBgContainer: values.surface,
      colorBorder: values.border,
      colorError: values.danger,
      colorPrimary: values.accent,
      colorPrimaryText: values.onAccent,
      colorSuccess: values.success,
      colorText: values.text,
      colorTextLightSolid: values.onAccent,
      colorTextSecondary: values.textMuted,
      colorWarning: values.warning,
      controlHeight: 44,
      fontFamily:
        'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
  };
}
