export type DiffLine = { text: string; kind: "same" | "added" | "removed" };
export type TextComparison = {
  before: DiffLine[];
  after: DiffLine[];
  precise: boolean;
};

export function compareText(before: string, after: string): TextComparison {
  const left = before.split("\n");
  const right = after.split("\n");
  if (left.length * right.length > 1_000_000) {
    return {
      before: left.map((text) => ({ text, kind: "same" })),
      after: right.map((text) => ({ text, kind: "same" })),
      precise: false,
    };
  }
  const width = right.length + 1;
  const lengths = new Uint32Array((left.length + 1) * width);
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      lengths[i * width + j] =
        left[i] === right[j]
          ? (lengths[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(
              lengths[(i + 1) * width + j] ?? 0,
              lengths[i * width + j + 1] ?? 0,
            );
    }
  }
  const result: TextComparison = { before: [], after: [], precise: true };
  let i = 0,
    j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      result.before.push({ text: left[i]!, kind: "same" });
      result.after.push({ text: right[j]!, kind: "same" });
      i++;
      j++;
    } else if (
      i < left.length &&
      (j >= right.length ||
        (lengths[(i + 1) * width + j] ?? 0) >=
          (lengths[i * width + j + 1] ?? 0))
    ) {
      result.before.push({ text: left[i]!, kind: "removed" });
      i++;
    } else {
      result.after.push({ text: right[j]!, kind: "added" });
      j++;
    }
  }
  return result;
}
