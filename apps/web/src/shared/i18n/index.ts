import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import type { Locale } from "../preferences/contracts";
import { resources } from "./resources";

void i18n.use(initReactI18next).init({
  defaultNS: "common",
  fallbackLng: "zh-CN",
  interpolation: { escapeValue: false },
  lng: "zh-CN",
  ns: ["common", "auth", "settings", "errors", "projects", "console"],
  resources,
  returnNull: false,
});

export async function setLocale(locale: Locale): Promise<void> {
  document.documentElement.lang = locale;
  await i18n.changeLanguage(locale);
}

export { i18n };
