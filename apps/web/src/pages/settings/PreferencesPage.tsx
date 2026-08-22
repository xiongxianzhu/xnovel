import { Alert, Button, Radio, Skeleton } from "antd";
import { useTranslation } from "react-i18next";

import {
  locales,
  themeModes,
  themePalettes,
  type Locale,
  type ThemeMode,
  type ThemePalette,
} from "../../shared/preferences/contracts";
import { usePreferences } from "../../features/preferences/usePreferences";

const localeKeys = {
  "en-US": "enUS",
  "zh-CN": "zhCN",
  "zh-TW": "zhTW",
} as const;
const modeKeys = { dark: "dark", light: "light", system: "system" } as const;
const paletteKeys = {
  graphite: "graphite",
  "grape-purple": "grapePurple",
  "harbor-blue": "harborBlue",
  "manuscript-brown": "manuscriptBrown",
  "pine-green": "pineGreen",
} as const;

export function PreferencesPage() {
  const {
    appearance,
    isLoading,
    loadError,
    pendingFields,
    retry,
    saveError,
    setLocale,
    setThemeMode,
    setThemePalette,
  } = usePreferences();
  const { t } = useTranslation(["common", "settings"]);

  if (isLoading) {
    return (
      <main className="settings-page" aria-busy="true">
        <Skeleton active paragraph={{ rows: 8 }} title />
      </main>
    );
  }

  return (
    <main className="settings-page" aria-labelledby="settings-title">
      <header className="page-heading">
        <h1 id="settings-title">{t("settings:title")}</h1>
        <p className="page-description">{t("settings:description")}</p>
      </header>

      {saveError ? (
        <Alert
          className="settings-alert"
          title={t(saveError)}
          showIcon
          type="error"
        />
      ) : null}
      {loadError ? (
        <Alert
          action={
            <Button onClick={retry} size="small">
              {t("common:retry")}
            </Button>
          }
          className="settings-alert"
          showIcon
          title={t("common:loadFailed")}
          type="error"
        />
      ) : null}

      <PreferenceSection
        description={pendingFields.has("locale") ? t("common:saving") : null}
        title={t("settings:language")}
      >
        <Radio.Group
          aria-label={t("settings:language")}
          className="preference-options"
          onChange={(event) => setLocale(event.target.value as Locale)}
          value={appearance.locale}
        >
          {locales.map((locale) => (
            <Radio key={locale} value={locale}>
              {t(`settings:${localeKeys[locale]}`)}
            </Radio>
          ))}
        </Radio.Group>
      </PreferenceSection>

      <PreferenceSection
        description={
          pendingFields.has("themePalette") ? t("common:saving") : null
        }
        title={t("settings:themePalette")}
      >
        <Radio.Group
          aria-label={t("settings:themePalette")}
          className="palette-options"
          onChange={(event) =>
            setThemePalette(event.target.value as ThemePalette)
          }
          value={appearance.themePalette}
        >
          {themePalettes.map((palette) => (
            <Radio className="palette-option" key={palette} value={palette}>
              <span
                aria-hidden
                className="palette-swatch"
                data-palette-preview={palette}
              />
              <span>{t(`settings:${paletteKeys[palette]}`)}</span>
            </Radio>
          ))}
        </Radio.Group>
      </PreferenceSection>

      <PreferenceSection
        description={pendingFields.has("themeMode") ? t("common:saving") : null}
        title={t("settings:themeMode")}
      >
        <Radio.Group
          aria-label={t("settings:themeMode")}
          className="preference-options"
          onChange={(event) => setThemeMode(event.target.value as ThemeMode)}
          value={appearance.themeMode}
        >
          {themeModes.map((mode) => (
            <Radio key={mode} value={mode}>
              {t(`settings:${modeKeys[mode]}`)}
            </Radio>
          ))}
        </Radio.Group>
      </PreferenceSection>
    </main>
  );
}

function PreferenceSection({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string | null;
  title: string;
}) {
  return (
    <section className="preference-section">
      <div className="preference-section-heading">
        <h2>{title}</h2>
        <span aria-live="polite" className="save-state">
          {description}
        </span>
      </div>
      {children}
    </section>
  );
}
