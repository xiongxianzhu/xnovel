import { app, type BrowserWindow, ipcMain, safeStorage } from "electron";
import { join } from "node:path";

import type { DesktopPreferences, ProviderInput } from "../shared/contracts";
import { DesktopAiService } from "./ai";
import { CredentialStore } from "./credentials";
import { DesktopDatabase } from "./database";
import { LocalSkillService } from "./skills";

export type DesktopServices = {
  store: DesktopDatabase;
  skills: LocalSkillService;
  credentials: CredentialStore;
  ai: DesktopAiService;
};

export async function createDesktopServices(
  userData: string,
  caseFoldingPath: string,
): Promise<DesktopServices> {
  const store = await DesktopDatabase.open(
    join(userData, "xnovel.db"),
    join(userData, "backups"),
  );
  const credentials = new CredentialStore(
    join(userData, "credentials.v1.json"),
    {
      available: () => safeStorage.isEncryptionAvailable(),
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value),
    },
  );
  const skills = new LocalSkillService(
    join(app.getPath("home"), ".agents", "skills"),
    caseFoldingPath,
    store,
  );
  await skills.initialize();
  const storedCredentialIds = new Set(await credentials.ids());
  const referencedCredentialIds = new Set(store.credentialReferences());
  const orphaned = [...storedCredentialIds].filter(
    (id) => !referencedCredentialIds.has(id),
  ).length;
  const missing = [...referencedCredentialIds].filter(
    (id) => !storedCredentialIds.has(id),
  ).length;
  if (orphaned || missing) {
    console.warn("Desktop credential integrity issue", { orphaned, missing });
  }
  return {
    store,
    skills,
    credentials,
    ai: new DesktopAiService(store, credentials, skills),
  };
}

export function registerIpc(
  window: BrowserWindow,
  services: DesktopServices,
  updater: {
    check: () => Promise<{ status: string; version?: string }>;
    download: () => Promise<{ status: string }>;
    install: () => Promise<void>;
  },
): void {
  const handle = (
    channel: string,
    action: (...args: unknown[]) => unknown | Promise<unknown>,
  ) => {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      if (event.senderFrame !== window.webContents.mainFrame)
        throw new Error("IPC_SOURCE_REJECTED");
      return action(...args);
    });
  };

  handle("projects:list", () => services.store.listProjects());
  handle("projects:create", (title) =>
    services.store.createProject(stringValue(title, 200)),
  );
  handle("projects:documents", (projectId) =>
    services.store.listDocuments(stringValue(projectId, 64)),
  );
  handle("projects:content", (documentId) =>
    services.store.getContent(stringValue(documentId, 64)),
  );
  handle("projects:save", (documentId, content, version) =>
    services.store.saveContent(
      stringValue(documentId, 64),
      stringValue(content, 2_000_000, true),
      integerValue(version),
    ),
  );
  handle("preferences:get", () => services.store.getPreferences());
  handle("preferences:set", (value) =>
    services.store.setPreferences(objectValue(value) as DesktopPreferences),
  );
  handle("skills:scan", () => services.skills.scan());
  handle("skills:list", () => services.skills.scan());
  handle("skills:detail", (key) =>
    services.skills.detail(stringValue(key, 500)),
  );
  handle("skills:set-enabled", (key, enabled, fingerprint) =>
    services.skills.setEnabled(
      stringValue(key, 500),
      Boolean(enabled),
      stringValue(fingerprint, 64),
    ),
  );
  handle("providers:list", () => services.store.listProviders());
  handle("providers:save", async (raw) => {
    const input = objectValue(raw) as ProviderInput;
    const previous = input.id
      ? services.store.providerSecretRef(input.id).credentialRef
      : null;
    const next = input.apiKey
      ? await services.credentials.put(input.apiKey)
      : null;
    try {
      const saved = services.store.saveProvider(input, next);
      if (next && previous) await services.credentials.remove(previous);
      return saved;
    } catch (error) {
      if (next) await services.credentials.remove(next);
      throw error;
    }
  });
  handle("ai:run", (raw) =>
    services.ai.run(objectValue(raw) as Parameters<DesktopAiService["run"]>[0]),
  );
  handle("ai:decide", (raw) =>
    services.store.decideAiResult(
      objectValue(raw) as Parameters<DesktopDatabase["decideAiResult"]>[0],
    ),
  );
  handle("backup:create", () =>
    services.store.createBackup(join(app.getPath("userData"), "backups")),
  );
  handle("backup:restore-latest", async () => {
    const restored = await services.store.restoreLatestBackup(
      join(app.getPath("userData"), "backups"),
    );
    if (restored) {
      app.relaunch();
      app.quit();
    }
    return restored;
  });
  handle("update:check", updater.check);
  handle("update:download", updater.download);
  handle("update:install", updater.install);
}

function stringValue(value: unknown, max: number, allowEmpty = false): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!allowEmpty && !value.trim())
  )
    throw new Error("IPC_INPUT_INVALID");
  return value;
}
function integerValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value))
    throw new Error("IPC_INPUT_INVALID");
  return value;
}
function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("IPC_INPUT_INVALID");
  return value as Record<string, unknown>;
}
