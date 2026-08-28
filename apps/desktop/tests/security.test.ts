import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  navigationAllowed,
  SECURE_WEB_PREFERENCES,
} from "../src/main/security";

describe("Desktop security boundary", () => {
  it("keeps Node and arbitrary navigation out of the renderer", () => {
    expect(SECURE_WEB_PREFERENCES).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    });
    expect(
      navigationAllowed(
        "file:///app/renderer/index.html",
        undefined,
        "file:///app/renderer/",
      ),
    ).toBe(true);
    expect(
      navigationAllowed(
        "file:///private/secret.txt",
        undefined,
        "file:///app/renderer/",
      ),
    ).toBe(false);
    expect(navigationAllowed("https://attacker.example/")).toBe(false);
    expect(
      navigationAllowed("http://127.0.0.1:5173/", "http://127.0.0.1:5173"),
    ).toBe(true);
    expect(
      navigationAllowed("http://127.0.0.1:51730/", "http://127.0.0.1:5173"),
    ).toBe(false);
  });

  it("preload exposes only the named domain adapter, never ipcRenderer", async () => {
    const source = await readFile(
      join(process.cwd(), "src", "preload", "index.ts"),
      "utf8",
    );
    expect(source).toContain('exposeInMainWorld("xnovelDesktop"');
    expect(source).not.toMatch(/exposeInMainWorld\([^,]+,\s*ipcRenderer/);
    expect(source).not.toContain("sendSync");
  });

  it("registers the ready-to-show listener before loading renderer content", async () => {
    const source = await readFile(
      join(process.cwd(), "src", "main", "index.ts"),
      "utf8",
    );
    expect(source.indexOf('window.once("ready-to-show"')).toBeGreaterThan(-1);
    expect(source.indexOf('window.once("ready-to-show"')).toBeLessThan(
      source.indexOf("window.loadFile"),
    );
  });

  it("bundles the shared TypeScript theme into the packaged main process", async () => {
    const source = await readFile(
      join(process.cwd(), "electron.vite.config.ts"),
      "utf8",
    );
    expect(source).toContain('exclude: ["@xnovel/theme"]');
  });
});
