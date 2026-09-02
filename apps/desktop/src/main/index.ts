import { app, BrowserWindow, Menu } from "electron";
import electronUpdater from "electron-updater";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createDesktopServices,
  registerIpc,
  type DesktopServices,
} from "./ipc";
import { navigationAllowed, SECURE_WEB_PREFERENCES } from "./security";
import { usesCustomWindowControls, windowChrome } from "./window";

let services: DesktopServices | undefined;

async function createWindow(): Promise<void> {
  if (usesCustomWindowControls(process.platform) && app.isPackaged)
    Menu.setApplicationMenu(null);
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 360,
    minHeight: 600,
    show: false,
    backgroundColor: "#171310",
    ...windowChrome(process.platform),
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      ...SECURE_WEB_PREFERENCES,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    const localRendererRoot = pathToFileURL(
      join(__dirname, "../renderer/"),
    ).href;
    if (
      !navigationAllowed(
        url,
        process.env.ELECTRON_RENDERER_URL,
        localRendererRoot,
      )
    )
      event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );

  const caseFoldingPath = app.isPackaged
    ? join(
        process.resourcesPath,
        "resources",
        "unicode",
        "CaseFolding-17.0.0.txt",
      )
    : join(app.getAppPath(), "resources", "unicode", "CaseFolding-17.0.0.txt");
  services = await createDesktopServices(
    app.getPath("userData"),
    caseFoldingPath,
  );
  registerIpc(window, services, {
    check: checkForUpdates,
    download: downloadUpdate,
    install: installUpdate,
  });
  window.once("ready-to-show", () => window.show());
  if (process.env.ELECTRON_RENDERER_URL)
    await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await window.loadFile(join(__dirname, "../renderer/index.html"));
}

async function checkForUpdates(): Promise<{
  status: string;
  version?: string;
}> {
  if (!app.isPackaged) return { status: "development" };
  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  const result = await autoUpdater.checkForUpdates();
  return result?.updateInfo
    ? { status: "available", version: result.updateInfo.version }
    : { status: "current" };
}

async function downloadUpdate(): Promise<{ status: string }> {
  if (!app.isPackaged) return { status: "development" };
  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  await autoUpdater.downloadUpdate();
  return { status: "downloaded" };
}

async function installUpdate(): Promise<void> {
  if (!app.isPackaged) return;
  electronUpdater.autoUpdater.quitAndInstall(false, true);
}

app
  .whenReady()
  .then(createWindow)
  .catch((error: unknown) => {
    console.error(
      "Desktop initialization failed",
      error instanceof Error ? error.message : "UNKNOWN",
    );
    app.quit();
  });
app.on("window-all-closed", () => {
  services?.store.close();
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
