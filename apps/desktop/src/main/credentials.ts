import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";

type CredentialFile = {
  version: 1;
  items: Record<string, { cipherText: string; updatedAt: string }>;
};
export type CredentialCipher = {
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
  available(): boolean;
};

export class CredentialStore {
  constructor(
    private readonly path: string,
    private readonly cipher: CredentialCipher,
  ) {}

  async put(secret: string): Promise<string> {
    if (!this.cipher.available()) throw new Error("SAFE_STORAGE_UNAVAILABLE");
    if (!secret || secret.length > 4096) throw new Error("INVALID_CREDENTIAL");
    const data = await this.read();
    const id = randomUUID();
    data.items[id] = {
      cipherText: this.cipher.encrypt(secret).toString("base64"),
      updatedAt: new Date().toISOString(),
    };
    await this.write(data);
    return id;
  }

  async get(id: string): Promise<string> {
    if (!this.cipher.available()) throw new Error("SAFE_STORAGE_UNAVAILABLE");
    const entry = (await this.read()).items[id];
    if (!entry) throw new Error("CREDENTIAL_NOT_FOUND");
    try {
      return this.cipher.decrypt(Buffer.from(entry.cipherText, "base64"));
    } catch {
      throw new Error("CREDENTIAL_DECRYPT_FAILED");
    }
  }

  async remove(id: string): Promise<void> {
    const data = await this.read();
    delete data.items[id];
    await this.write(data);
  }

  async ids(): Promise<string[]> {
    return Object.keys((await this.read()).items);
  }

  private async read(): Promise<CredentialFile> {
    try {
      const value = JSON.parse(
        await readFile(this.path, "utf8"),
      ) as CredentialFile;
      if (value.version !== 1 || typeof value.items !== "object")
        throw new Error("CREDENTIAL_FILE_INVALID");
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { version: 1, items: {} };
      throw error;
    }
  }

  private async write(value: CredentialFile): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(value), {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(temporary, 0o600).catch(() => undefined);
    try {
      await rename(temporary, this.path);
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}
