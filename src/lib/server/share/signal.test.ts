// @vitest-environment node
// FEAT-SHARE-01: the Realtime topic is a hash of the token, never the token,
// and the same rule as match_share_signal_topic in migration 20261027090000
// (keep this vector in the SQL check too).
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("shareSignalTopic", () => {
  it("is 'match-share:' and the SHA-256 of the token in hex", async () => {
    const { shareSignalTopic } = await import("@/lib/server/share/signal");
    const token = "a".repeat(43);
    const topic = shareSignalTopic(token);
    expect(topic).toBe("match-share:66d34fba71f8f450f7e45598853e53bfc23bbd129027cbb131a2f4ffd7878cd0");
    expect(topic).not.toContain(token);
  });
});
