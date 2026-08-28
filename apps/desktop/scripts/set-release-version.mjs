import { readFile, writeFile } from "node:fs/promises";

const tag = process.env.GITHUB_REF_NAME ?? "";
const version = tag.replace(/^v/, "");
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error("Release tag must be a SemVer value prefixed with v");
}
const path = new URL("../package.json", import.meta.url);
const manifest = JSON.parse(await readFile(path, "utf8"));
manifest.version = version;
await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
