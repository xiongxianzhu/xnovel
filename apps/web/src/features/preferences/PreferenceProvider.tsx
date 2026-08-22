import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import zhTW from "antd/locale/zh_TW";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { useAuth } from "../auth/useAuth";
import type { UserPreferenceData } from "../../shared/api/generated/types.gen";
import { setLocale as setI18nLocale } from "../../shared/i18n";
import {
  defaultAppearance,
  isLocale,
  isThemeMode,
  isThemePalette,
  type Appearance,
  type ColorScheme,
  type Locale,
  type ThemeMode,
  type ThemePalette,
} from "../../shared/preferences/contracts";
import {
  loadAppearance,
  saveAppearance,
} from "../../shared/storage/appearance";
import { createAntdTheme } from "../../shared/theme/antdTheme";
import {
  applyAppearance,
  resolveColorScheme,
  subscribeToSystemScheme,
} from "../../shared/theme/appearance";
import {
  PreferenceContext,
  type PreferenceContextValue,
} from "./PreferenceContext";
import {
  getPreferencesRequest,
  updatePreferencesRequest,
} from "./preferencesApi";

type PreferenceField = keyof Appearance;

const antdLocales = {
  "en-US": enUS,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
} as const;

function fromServer(value: {
  locale: unknown;
  theme_mode: unknown;
  theme_palette: unknown;
}): Appearance {
  return {
    locale: isLocale(value.locale) ? value.locale : defaultAppearance.locale,
    themeMode: isThemeMode(value.theme_mode)
      ? value.theme_mode
      : defaultAppearance.themeMode,
    themePalette: isThemePalette(value.theme_palette)
      ? value.theme_palette
      : defaultAppearance.themePalette,
  };
}

export function PreferenceProvider({ children }: PropsWithChildren) {
  const { status, user } = useAuth();
  const queryClient = useQueryClient();
  const [deviceAppearance, setDeviceAppearance] = useState(loadAppearance);
  const [systemScheme, setSystemScheme] = useState<ColorScheme>(() =>
    resolveColorScheme("system"),
  );
  const [pendingFields, setPendingFields] = useState<Set<PreferenceField>>(
    () => new Set(),
  );
  const [pendingValues, setPendingValues] = useState<Partial<Appearance>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const sequenceRef = useRef<Record<PreferenceField, number>>({
    locale: 0,
    themeMode: 0,
    themePalette: 0,
  });

  const queryKey = ["current-user-preferences", user?.id] as const;
  const preferencesQuery = useQuery({
    enabled: status === "authenticated",
    queryFn: async () => {
      const response = await getPreferencesRequest();
      setDeviceAppearance(fromServer(response));
      return response;
    },
    queryKey,
    retry: 1,
  });

  const serverAppearance = useMemo(
    () =>
      preferencesQuery.data
        ? fromServer(preferencesQuery.data)
        : deviceAppearance,
    [deviceAppearance, preferencesQuery.data],
  );
  const appearance = useMemo(
    () => ({ ...serverAppearance, ...pendingValues }),
    [pendingValues, serverAppearance],
  );
  const colorScheme =
    appearance.themeMode === "system" ? systemScheme : appearance.themeMode;

  useEffect(() => {
    saveAppearance(appearance);
    void setI18nLocale(appearance.locale);
  }, [appearance]);

  useEffect(() => {
    applyAppearance(appearance);
    document.documentElement.dataset.colorScheme = colorScheme;
    document.documentElement.style.colorScheme = colorScheme;
  }, [appearance, colorScheme]);

  useEffect(
    () =>
      subscribeToSystemScheme("system", (scheme) => {
        setSystemScheme(scheme);
      }),
    [],
  );

  const updateField = <Field extends PreferenceField>(
    field: Field,
    value: Appearance[Field],
  ) => {
    if (appearance[field] === value) {
      return;
    }
    const sequence = sequenceRef.current[field] + 1;
    sequenceRef.current[field] = sequence;
    setPendingValues((current) => ({ ...current, [field]: value }));
    setDeviceAppearance((current) => ({ ...current, [field]: value }));
    setSaveError(null);
    setPendingFields((current) => new Set(current).add(field));

    const payload =
      field === "locale"
        ? { locale: value as Locale }
        : field === "themeMode"
          ? { theme_mode: value as ThemeMode }
          : { theme_palette: value as ThemePalette };

    void updatePreferencesRequest(payload)
      .then((response) => {
        setDeviceAppearance(fromServer(response));
        queryClient.setQueryData(queryKey, response);
        if (sequenceRef.current[field] === sequence) {
          setPendingValues((current) => {
            const next = { ...current };
            delete next[field];
            return next;
          });
          setPendingFields((current) => {
            const next = new Set(current);
            next.delete(field);
            return next;
          });
        }
      })
      .catch(() => {
        if (sequenceRef.current[field] !== sequence) {
          return;
        }
        setPendingValues((current) => {
          const next = { ...current };
          delete next[field];
          return next;
        });
        const confirmed =
          queryClient.getQueryData<UserPreferenceData>(queryKey);
        setDeviceAppearance(
          confirmed ? fromServer(confirmed) : deviceAppearance,
        );
        setPendingFields((current) => {
          const next = new Set(current);
          next.delete(field);
          return next;
        });
        setSaveError("common:saveFailed");
      });
  };

  const value: PreferenceContextValue = {
    appearance,
    loadError: preferencesQuery.isError,
    isLoading: preferencesQuery.isLoading,
    pendingFields,
    saveError,
    retry: () => void preferencesQuery.refetch(),
    setLocale: (locale) => updateField("locale", locale),
    setThemeMode: (mode) => updateField("themeMode", mode),
    setThemePalette: (palette) => updateField("themePalette", palette),
  };

  return (
    <ConfigProvider
      locale={antdLocales[appearance.locale]}
      theme={createAntdTheme(colorScheme, appearance.themePalette)}
    >
      <PreferenceContext.Provider value={value}>
        {children}
      </PreferenceContext.Provider>
    </ConfigProvider>
  );
}
