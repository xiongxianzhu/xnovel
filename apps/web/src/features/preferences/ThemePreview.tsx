import type { ThemePalette } from "../../shared/preferences/contracts";
import { themeValues } from "../../shared/theme/themeValues";
import "./theme-picker.css";

export function ThemePreview({
  palette,
  compact = false,
}: {
  palette: ThemePalette;
  compact?: boolean;
}) {
  const colors = themeValues[palette].light;
  if (compact)
    return (
      <svg aria-hidden="true" className="theme-dual-swatch" viewBox="0 0 32 32">
        <rect width="22" height="32" fill={colors.ink} />
        <rect x="22" width="10" height="32" fill={colors.accent} />
      </svg>
    );
  return (
    <svg
      aria-hidden="true"
      className="theme-layout-preview"
      viewBox="0 0 300 96"
      preserveAspectRatio="none"
    >
      <rect width="300" height="96" fill={colors.canvas} />
      <rect width="70" height="96" fill={colors.ink} />
      <rect x="14" y="14" width="42" height="5" fill={colors.accent} />
      <rect x="70" width="230" height="16" fill={colors.surfaceMuted} />
      <rect x="86" y="32" width="88" height="48" fill={colors.surface} />
      <rect x="188" y="32" width="98" height="48" fill={colors.surface} />
      <rect x="96" y="65" width="66" height="5" fill={colors.accent} />
    </svg>
  );
}
