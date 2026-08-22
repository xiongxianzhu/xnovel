import { describe, expect, it, vi } from "vitest";

import { refreshSession } from "../../shared/api/generated/sdk.gen";
import { refreshAccessToken } from "./authApi";

vi.mock("../../shared/api/generated/sdk.gen", () => ({
  refreshSession: vi.fn(),
}));

describe("refreshAccessToken", () => {
  it("shares one in-flight refresh across concurrent callers", async () => {
    vi.mocked(refreshSession).mockResolvedValue({
      data: {
        code: 0,
        data: {
          access_token: "renewed-token",
          expires_at: "2026-08-21T12:15:00Z",
          token_type: "Bearer",
        },
        msg: "SUCCESS",
      },
    } as Awaited<ReturnType<typeof refreshSession>>);

    const [first, second] = await Promise.all([
      refreshAccessToken(),
      refreshAccessToken(),
    ]);

    expect(first).toBe("renewed-token");
    expect(second).toBe("renewed-token");
    expect(refreshSession).toHaveBeenCalledOnce();
  });
});
