import { contextBridge, ipcRenderer } from "electron";

import type { XnovelDesktopApi } from "../shared/contracts";

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>;

const api: XnovelDesktopApi = {
  projects: {
    list: () => invoke("projects:list"),
    create: (title) => invoke("projects:create", title),
    documents: (projectId) => invoke("projects:documents", projectId),
    content: (documentId) => invoke("projects:content", documentId),
    save: (documentId, content, version) =>
      invoke("projects:save", documentId, content, version),
  },
  preferences: {
    get: () => invoke("preferences:get"),
    set: (value) => invoke("preferences:set", value),
  },
  skills: {
    scan: () => invoke("skills:scan"),
    list: () => invoke("skills:list"),
    detail: (key) => invoke("skills:detail", key),
    setEnabled: (key, enabled, fingerprint) =>
      invoke("skills:set-enabled", key, enabled, fingerprint),
  },
  providers: {
    list: () => invoke("providers:list"),
    save: (input) => invoke("providers:save", input),
  },
  ai: {
    run: (input) => invoke("ai:run", input),
    decide: (input) => invoke("ai:decide", input),
  },
  backup: {
    create: () => invoke("backup:create"),
    restoreLatest: () => invoke("backup:restore-latest"),
  },
  update: {
    check: () => invoke("update:check"),
    download: () => invoke("update:download"),
    install: () => invoke("update:install"),
  },
};

contextBridge.exposeInMainWorld("xnovelDesktop", Object.freeze(api));
