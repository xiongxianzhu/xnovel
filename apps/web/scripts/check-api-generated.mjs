import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedDir = join(webRoot, "src", "shared", "api", "generated");
const temporaryDir = mkdtempSync(join(tmpdir(), "xnovel-api-client-"));

function listFiles(root) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .sort();
}

function fail(message) {
  process.stderr.write(
    `${message}\n请运行 pnpm api:generate 并提交生成结果。\n`,
  );
  process.exitCode = 1;
}

try {
  const result = spawnSync(
    process.execPath,
    [
      join(webRoot, "node_modules", "@hey-api", "openapi-ts", "bin", "run.js"),
      "--file",
      join(webRoot, "openapi-ts.config.ts"),
      "--output",
      temporaryDir,
      "--no-log-file",
      "--silent",
    ],
    { cwd: webRoot, encoding: "utf8" },
  );

  if (result.status !== 0) {
    process.stderr.write(
      result.stderr || result.stdout || "API 客户端生成失败。\n",
    );
    process.exitCode = result.status ?? 1;
  } else {
    const expectedFiles = listFiles(expectedDir);
    const generatedFiles = listFiles(temporaryDir);

    if (JSON.stringify(expectedFiles) !== JSON.stringify(generatedFiles)) {
      fail("生成目录的文件清单与 OpenAPI 契约不一致。");
    } else {
      const changedFile = expectedFiles.find(
        (file) =>
          !readFileSync(join(expectedDir, file)).equals(
            readFileSync(join(temporaryDir, file)),
          ),
      );
      if (changedFile) {
        fail(`生成文件已过期：${changedFile}`);
      }
    }
  }
} finally {
  rmSync(temporaryDir, { force: true, recursive: true });
}
