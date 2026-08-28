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

  it("localizes AI and Skill workspaces in every supported locale", async () => {
    await setLocale("zh-CN");
    expect(i18n.t("ai:assistantTitle")).toBe("AI 助手");
    await setLocale("zh-TW");
    expect(i18n.t("skills:adminTitle")).toBe("Skill 安全管理");
    await setLocale("en-US");
    expect(i18n.t("ai:providersTitle")).toBe("Model connections");
  });
});
