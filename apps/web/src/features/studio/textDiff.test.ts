import { compareText } from "@xnovel/text-diff";
import { expect, it } from "vitest";

it("compares changed lines without marking unchanged middle lines as changes", () => {
  const before = "开头\n旧句\n保留的中间句\n删去\n结尾";
  const after = "开头\n新句\n保留的中间句\n增加\n结尾";
  const result = compareText(before, after);
  expect(result.before.map((line) => line.text).join("\n")).toBe(before);
  expect(result.after.map((line) => line.text).join("\n")).toBe(after);
  expect(result.before.find((line) => line.text === "保留的中间句")?.kind).toBe(
    "same",
  );
  expect(result.after.find((line) => line.text === "新句")?.kind).toBe("added");
  expect(result.before.find((line) => line.text === "旧句")?.kind).toBe(
    "removed",
  );
});
it("bounds comparison memory for large documents without dropping text", () => {
  const before = Array.from({ length: 1100 }, (_, i) => `旧段${i}`).join("\n");
  const after = before.replace("旧段500", "新段500");
  const result = compareText(before, after);
  expect(result.precise).toBe(false);
  expect(result.before.map((line) => line.text).join("\n")).toBe(before);
  expect(result.after.map((line) => line.text).join("\n")).toBe(after);
});
