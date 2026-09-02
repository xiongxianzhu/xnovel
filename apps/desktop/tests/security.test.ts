import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  navigationAllowed,
  SECURE_WEB_PREFERENCES,
} from "../src/main/security";
import { usesCustomWindowControls, windowChrome } from "../src/main/window";

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

  it("drops the native window frame only on Windows", () => {
    expect(usesCustomWindowControls("win32")).toBe(true);
    expect(windowChrome("win32")).toEqual({ frame: false });
    expect(usesCustomWindowControls("darwin")).toBe(false);
    expect(windowChrome("darwin")).toEqual({ frame: true });
    expect(windowChrome("linux")).toEqual({ frame: true });
  });

  it("builds the sandboxed preload as CommonJS and loads it from that path", async () => {
    const config = await readFile(
      join(process.cwd(), "electron.vite.config.ts"),
      "utf8",
    );
    const main = await readFile(
      join(process.cwd(), "src", "main", "index.ts"),
      "utf8",
    );
    expect(config).toContain('format: "cjs"');
    expect(config).toContain('entryFileNames: "[name].cjs"');
    expect(main).toContain('"../preload/index.cjs"');
    expect(main).not.toContain("index.mjs");
  });
});
