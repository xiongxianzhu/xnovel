import { createContext } from "react";

import type {
  Appearance,
  Locale,
  ThemeMode,
  ThemePalette,
} from "../../shared/preferences/contracts";

export interface PreferenceContextValue {
  appearance: Appearance;
  loadError: boolean;
  isLoading: boolean;
  pendingFields: ReadonlySet<keyof Appearance>;
  saveError: string | null;
  retry: () => void;
  setLocale: (value: Locale) => void;
  setThemeMode: (value: ThemeMode) => void;
  setThemePalette: (value: ThemePalette) => void;
}

export const PreferenceContext = createContext<PreferenceContextValue | null>(
  null,
);
