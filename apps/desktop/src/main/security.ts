import type { WebPreferences } from "electron";

export const SECURE_WEB_PREFERENCES: WebPreferences = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
};

export function navigationAllowed(
  url: string,
  rendererUrl?: string,
  localRendererRoot = "file:///app/renderer/",
): boolean {
  if (!rendererUrl) return url.startsWith(localRendererRoot);
  try {
    return new URL(url).origin === new URL(rendererUrl).origin;
  } catch {
    return false;
  }
}
