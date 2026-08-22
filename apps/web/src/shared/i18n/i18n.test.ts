import { afterEach, describe, expect, it } from "vitest";

import { i18n, setLocale } from ".";

afterEach(async () => {
  await setLocale("zh-CN");
});

describe("i18n", () => {
  it("switches all three first-release locales", async () => {
    await setLocale("zh-TW");
    expect(i18n.t("auth:submit")).toBe("登入");

    await setLocale("en-US");
    expect(i18n.t("settings:title")).toBe("Preferences");
    expect(document.documentElement.lang).toBe("en-US");
  });

  it("configures simplified Chinese as the fallback", () => {
    expect(i18n.options.fallbackLng).toContain("zh-CN");
  });
});
