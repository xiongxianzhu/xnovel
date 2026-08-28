import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

import type { LocalSkill, LocalSkillDetail } from "../shared/contracts";
import type { DesktopDatabase } from "./database";

const MAX_FILES = 500;
const MAX_TOTAL = 50 * 1024 * 1024;
const MAX_SKILL_MD = 1024 * 1024;
const CASE_FOLDING_SHA256 =
  "ff8d8fefbf123574205085d6714c36149eb946d717a0c585c27f0f4ef58c4183";

export class LocalSkillService {
  private fold = new Map<number, string>();

  constructor(
    private readonly root: string,
    private readonly caseFoldingPath: string,
    private readonly store: DesktopDatabase,
  ) {}

  async initialize(): Promise<void> {
    const bytes = await readFile(this.caseFoldingPath);
    if (
      createHash("sha256").update(bytes).digest("hex") !== CASE_FOLDING_SHA256
    )
      throw new Error("CASE_FOLDING_ASSET_INVALID");
    const source = bytes.toString("utf8");
    for (const line of source.split(/\r?\n/)) {
      const match = /^([0-9A-F]+); ([CF]); ([0-9A-F ]+);/.exec(line);
      if (!match?.[1] || !match[3]) continue;
      this.fold.set(
        Number.parseInt(match[1], 16),
        match[3]
          .split(" ")
          .map((item) => String.fromCodePoint(Number.parseInt(item, 16)))
          .join(""),
      );
    }
  }

  async scan(): Promise<LocalSkill[]> {
    const preferences = new Map(
      this.store.skillPreferences().map((item) => [item.directoryKey, item]),
    );
    const output: LocalSkill[] = [];
    let directories: string[] = [];
    try {
      directories = (await readdir(this.root, { withFileTypes: true }))
        .filter((item) => item.isDirectory() && !item.isSymbolicLink())
        .map((item) => item.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    for (const directoryName of directories.sort((a, b) =>
      a.localeCompare(b),
    )) {
      const directoryKey = this.caseFold(directoryName.normalize("NFC"));
      try {
        const inspected = await this.inspect(join(this.root, directoryName));
        const preference = preferences.get(directoryKey);
        const changed = Boolean(
          preference?.enabled &&
          preference.contentFingerprint !== inspected.fingerprint,
        );
        if (changed) this.store.disableSkill(directoryKey);
        output.push({
          directoryKey,
          directoryName,
          name: inspected.name,
          description: inspected.description,
          enabled: Boolean(preference?.enabled && !changed),
          contentFingerprint: inspected.fingerprint,
          status: changed ? "changed" : "ready",
        });
        preferences.delete(directoryKey);
      } catch (error) {
        this.store.disableSkill(directoryKey);
        output.push({
          directoryKey,
          directoryName,
          name: directoryName,
          description: "",
          enabled: false,
          contentFingerprint: "",
          status: "invalid",
          error: error instanceof Error ? error.message : "SKILL_INVALID",
        });
      }
    }
    for (const preference of preferences.values())
      output.push({
        directoryKey: preference.directoryKey,
        directoryName: preference.directoryName,
        name: preference.directoryName,
        description: "",
        enabled: false,
        contentFingerprint: preference.contentFingerprint,
        status: "missing",
      });
    return output;
  }

  async setEnabled(
    directoryKey: string,
    enabled: boolean,
    fingerprint: string,
  ): Promise<LocalSkill[]> {
    const skills = await this.scan();
    const skill = skills.find((item) => item.directoryKey === directoryKey);
    if (
      !skill ||
      skill.status !== "ready" ||
      (enabled && skill.contentFingerprint !== fingerprint)
    )
      throw new Error("SKILL_CHANGED");
    this.store.saveSkillPreference(
      skill.directoryKey,
      skill.directoryName,
      enabled,
      skill.contentFingerprint,
    );
    return this.scan();
  }

  async detail(directoryKey: string): Promise<LocalSkillDetail> {
    const skills = await this.scan();
    const skill = skills.find((item) => item.directoryKey === directoryKey);
    if (!skill || !["ready", "changed"].includes(skill.status))
      throw new Error("SKILL_NOT_FOUND");
    const skillMarkdown = await readFile(
      join(this.root, skill.directoryName, "SKILL.md"),
      "utf8",
    );
    return { skill, skillMarkdown };
  }

  async verified(
    keys: string[],
  ): Promise<
    Array<{ name: string; fingerprint: string; instructions: string }>
  > {
    const skills = await this.scan();
    const selected: Array<{
      name: string;
      fingerprint: string;
      instructions: string;
    }> = [];
    for (const key of new Set(keys)) {
      const skill = skills.find((item) => item.directoryKey === key);
      if (!skill?.enabled || skill.status !== "ready")
        throw new Error("SKILL_NOT_ENABLED");
      const content = await readFile(
        join(this.root, skill.directoryName, "SKILL.md"),
        "utf8",
      );
      selected.push({
        name: skill.name,
        fingerprint: skill.contentFingerprint,
        instructions: content,
      });
    }
    return selected;
  }

  private async inspect(
    root: string,
  ): Promise<{ fingerprint: string; name: string; description: string }> {
    const files: Array<{ path: string; bytes: Buffer }> = [];
    const collisions = new Set<string>();
    const registerPath = (normalized: string): void => {
      const key = this.caseFold(normalized);
      if (collisions.has(key)) throw new Error("SKILL_PATH_COLLISION");
      collisions.add(key);
    };
    const walk = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const absolute = join(directory, entry.name);
        const info = await lstat(absolute);
        if (info.isSymbolicLink()) throw new Error("SKILL_LINK_NOT_ALLOWED");
        const normalized = relative(root, absolute)
          .split(sep)
          .map((item) => item.normalize("NFC"))
          .join("/");
        if (
          !normalized ||
          normalized.startsWith("../") ||
          resolve(root, normalized) !== resolve(absolute)
        )
          throw new Error("SKILL_PATH_INVALID");
        registerPath(normalized);
        if (info.isDirectory()) {
          await walk(absolute);
          continue;
        }
        if (!info.isFile() || info.nlink > 1)
          throw new Error("SKILL_SPECIAL_FILE_NOT_ALLOWED");
        const bytes = await readFile(absolute);
        if (basename(normalized) === "SKILL.md" && bytes.length > MAX_SKILL_MD)
          throw new Error("SKILL_MD_TOO_LARGE");
        files.push({ path: normalized, bytes });
        if (
          files.length > MAX_FILES ||
          files.reduce((sum, item) => sum + item.bytes.length, 0) > MAX_TOTAL
        )
          throw new Error("SKILL_LIMIT_EXCEEDED");
      }
    };
    await walk(root);
    const skillMd = files.find((item) => item.path === "SKILL.md");
    if (!skillMd) throw new Error("SKILL_MD_REQUIRED");
    files.sort((a, b) => Buffer.from(a.path).compare(Buffer.from(b.path)));
    const hash = createHash("sha256");
    for (const item of files) {
      const pathBytes = Buffer.from(item.path);
      const length = Buffer.alloc(8);
      length.writeBigUInt64BE(BigInt(pathBytes.length));
      const size = Buffer.alloc(8);
      size.writeBigUInt64BE(BigInt(item.bytes.length));
      hash.update(length).update(pathBytes).update(size).update(item.bytes);
    }
    const text = skillMd.bytes.toString("utf8");
    const name =
      /^name:\s*["']?([^\r\n"']+)/m.exec(text)?.[1]?.trim() || basename(root);
    const description =
      /^description:\s*["']?([^\r\n"']+)/m.exec(text)?.[1]?.trim() || "";
    return { fingerprint: hash.digest("hex"), name, description };
  }

  private caseFold(value: string): string {
    return [...value]
      .map((character) => this.fold.get(character.codePointAt(0)!) ?? character)
      .join("")
      .normalize("NFC");
  }
}
