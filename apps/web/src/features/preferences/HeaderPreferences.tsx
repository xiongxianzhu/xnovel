import { Alert, Button, Dropdown, type MenuProps } from "antd";
import { Check, Languages, Monitor, Moon, Palette, Sun } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePreferences } from "./usePreferences";
import {
  locales,
  themeModes,
  themePalettes,
} from "../../shared/preferences/contracts";
import "./header-preferences.css";

const paletteKeys = {
  graphite: "graphite",
  "grape-purple": "grapePurple",
  "harbor-blue": "harborBlue",
  "manuscript-brown": "manuscriptBrown",
  "pine-green": "pineGreen",
} as const;
const localeLabels = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  "en-US": "English",
} as const;
const modeIcons = { light: Sun, dark: Moon, system: Monitor };

export function HeaderPreferences() {
  const preferences = usePreferences();
  const { t } = useTranslation(["settings", "common"]);
  const [openMenu, setOpenMenu] = useState<"appearance" | "language" | null>(
    null,
  );
  const { appearance, isLoading, loadError, saveError, pendingFields } =
    preferences;
  const busy = isLoading || pendingFields.size > 0;
  const appearanceItems: MenuProps["items"] = [
    {
      key: "palettes",
      type: "group",
      label: t("themePalette"),
      children: themePalettes.map((palette) => ({
        key: palette,
        label: (
          <span className="preference-menu-label">
            <span
              aria-hidden
              className="palette-swatch"
              data-palette-preview={palette}
            />
            {t(paletteKeys[palette])}
            {appearance.themePalette === palette ? (
              <Check aria-hidden size={16} />
            ) : null}
          </span>
        ),
        disabled: busy || loadError,
        onClick: () => preferences.setThemePalette(palette),
      })),
    },
    { type: "divider" },
    {
      key: "modes",
      type: "group",
      label: t("themeMode"),
      children: themeModes.map((mode) => {
        const Icon = modeIcons[mode];
        return {
          key: mode,
          icon: <Icon aria-hidden size={17} />,
          label: t(mode),
          disabled: busy || loadError,
          onClick: () => preferences.setThemeMode(mode),
        };
      }),
    },
  ];
  return (
    <div className="header-preferences">
      <Dropdown
        open={openMenu === "appearance"}
        onOpenChange={(open) => setOpenMenu(open ? "appearance" : null)}
        align={{ offset: [0, 1] }}
        placement="bottomRight"
        trigger={["click"]}
        menu={{
          items: appearanceItems,
          selectable: true,
          selectedKeys: [appearance.themePalette, appearance.themeMode],
        }}
        classNames={{ root: "header-preference-menu" }}
      >
        <div className="header-preference-anchor">
          <Button
            type="text"
            aria-label={t("appearanceMenu")}
            aria-expanded={openMenu === "appearance"}
            aria-haspopup="menu"
            icon={<Palette aria-hidden size={19} />}
          >
            <span className="header-preference-text">
              {t("appearanceMenu")}
            </span>
          </Button>
        </div>
      </Dropdown>
      <Dropdown
        open={openMenu === "language"}
        onOpenChange={(open) => setOpenMenu(open ? "language" : null)}
        align={{ offset: [0, 1] }}
        placement="bottomRight"
        trigger={["click"]}
        menu={{
          selectable: true,
          selectedKeys: [appearance.locale],
          items: locales.map((locale) => ({
            key: locale,
            label: localeLabels[locale],
            disabled: busy || loadError,
            onClick: () => preferences.setLocale(locale),
          })),
        }}
        classNames={{ root: "header-preference-menu" }}
      >
        <div className="header-preference-anchor">
          <Button
            type="text"
            aria-label={t("language")}
            aria-expanded={openMenu === "language"}
            aria-haspopup="menu"
            icon={<Languages aria-hidden size={19} />}
          >
            <span className="header-preference-text">
              {localeLabels[appearance.locale]}
            </span>
          </Button>
        </div>
      </Dropdown>
      <span role="status" className="sr-only">
        {busy ? t("common:saving") : ""}
      </span>
      {saveError || loadError ? (
        <Alert
          className="header-preference-error"
          role="alert"
          type="error"
          showIcon
          title={saveError ? t(saveError) : t("common:loadFailed")}
          action={
            loadError ? (
              <Button onClick={preferences.retry}>{t("common:retry")}</Button>
            ) : undefined
          }
        />
      ) : null}
    </div>
  );
}
