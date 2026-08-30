import { describe, expect, it } from "vitest";

import { resolveMediaUrl } from "./mediaUrl";

describe("resolveMediaUrl", () => {
  it("resolves uploaded media against the API origin", () => {
    expect(resolveMediaUrl("/api/v1/media/avatars/example.png")).toBe(
      "http://127.0.0.1:8000/api/v1/media/avatars/example.png",
    );
  });

  it("preserves external HTTPS avatar URLs", () => {
    expect(resolveMediaUrl("https://images.example.com/avatar.png")).toBe(
      "https://images.example.com/avatar.png",
    );
  });
});
