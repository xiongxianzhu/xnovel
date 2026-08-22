import {
  defaultAppearance,
  isLocale,
  isThemeMode,
  isThemePalette,
  type Appearance,
} from "../preferences/contracts";

const storageKey = "xnovel:appearance:v1";

interface StoredAppearance {
  locale: unknown;
  themeMode: unknown;
  themePalette: unknown;
  version: unknown;
}

export function loadAppearance(
  storage: Storage | undefined = window.localStorage,
): Appearance {
  if (!storage) {
    return defaultAppearance;
  }
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return defaultAppearance;
    }
    const parsed = JSON.parse(raw) as StoredAppearance;
    if (
      parsed.version !== 1 ||
      !isLocale(parsed.locale) ||
      !isThemePalette(parsed.themePalette) ||
      !isThemeMode(parsed.themeMode)
    ) {
      storage.removeItem(storageKey);
      return defaultAppearance;
    }
    return {
      locale: parsed.locale,
      themePalette: parsed.themePalette,
      themeMode: parsed.themeMode,
    };
  } catch {
    storage.removeItem(storageKey);
    return defaultAppearance;
  }
}

export function saveAppearance(
  appearance: Appearance,
  storage: Storage | undefined = window.localStorage,
): void {
  if (!storage) {
    return;
  }
  storage.setItem(storageKey, JSON.stringify({ version: 1, ...appearance }));
}
