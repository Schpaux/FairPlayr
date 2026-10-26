import "server-only";
import { createHash } from "node:crypto";

/**
 * FEAT-SHARE-01: the private Realtime topic of a share. Same rule as
 * `match_share_signal_topic` in migration 20261027090000: 'match-share:' and
 * the SHA-256 of the token in hex, so the topic never reveals the token.
 */
export function shareSignalTopic(token: string): string {
  return `match-share:${createHash("sha256").update(token, "utf8").digest("hex")}`;
}
