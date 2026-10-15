import { createLiveMatchFromSetup, type LiveMatchState } from "@/domain/liveMatch";
import type { MatchConfig } from "@/domain/match";
import {
  activateMatch,
  clearStoredMatchSetup,
  getStoredMatchSetup,
  hasActiveStoredMatch,
} from "@/lib/storage/matchStorage";
import {
  clearStoredLiveMatch,
  getStoredLiveMatch,
  saveStoredLiveMatch,
} from "@/lib/storage/liveMatchStorage";

export type CanonicalMatchStatus = "planned" | "live" | "completed" | "cancelled" | "abandoned";

export interface ActiveMatchLike {
  id: string;
  title: string;
  teamId: string;
  status: string;
  runtimeState?: Record<string, unknown> | null;
}

export interface ActiveMatchResolution {
  activeMatch: ActiveMatchLike | null;
  canonicalStatus: CanonicalMatchStatus | null;
  source: "server" | "server_recovery" | "local" | "none";
  needsRecovery: boolean;
  canContinue: boolean;
  canForceClose: boolean;
  canDiscard: boolean;
  href: string;
}

export function toCanonicalStatus(status: string): CanonicalMatchStatus {
  if (status === "live") {
    return "live";
  }

  if (status === "completed") {
    return "completed";
  }

  if (status === "cancelled") {
    return "cancelled";
  }

  if (status === "abandoned") {
    return "abandoned";
  }

  return "planned";
}

function hasRuntimeState(match: ActiveMatchLike | null): boolean {
  return Boolean(match && match.runtimeState && typeof match.runtimeState === "object");
}

export function resolveActiveMatch(
  serverActive: ActiveMatchLike | null,
  serverRecoverable: ActiveMatchLike | null,
  localActive: ActiveMatchLike | null
): ActiveMatchResolution {
  if (serverActive) {
    const canonicalStatus = toCanonicalStatus(serverActive.status);
    const needsRecovery = canonicalStatus !== "live" || !hasRuntimeState(serverActive);

    return {
      activeMatch: serverActive,
      canonicalStatus,
      source: needsRecovery ? "server_recovery" : "server",
      needsRecovery,
      canContinue: true,
      canForceClose: true,
      canDiscard: true,
      href: `/match/live?matchId=${encodeURIComponent(serverActive.id)}`,
    };
  }

  if (serverRecoverable) {
    return {
      activeMatch: serverRecoverable,
      canonicalStatus: toCanonicalStatus(serverRecoverable.status),
      source: "server_recovery",
      needsRecovery: true,
      canContinue: true,
      canForceClose: true,
      canDiscard: true,
      href: `/match/live?matchId=${encodeURIComponent(serverRecoverable.id)}`,
    };
  }

  if (localActive) {
    return {
      activeMatch: localActive,
      canonicalStatus: "live",
      source: "local",
      needsRecovery: true,
      canContinue: true,
      canForceClose: true,
      canDiscard: true,
      href: localActive.id
        ? `/match/live?matchId=${encodeURIComponent(localActive.id)}`
        : "/match/live?recovery=1",
    };
  }

  return {
    activeMatch: null,
    canonicalStatus: null,
    source: "none",
    needsRecovery: false,
    canContinue: false,
    canForceClose: false,
    canDiscard: false,
    href: "/match/live?recovery=1",
  };
}

export function resolveLocalActiveMatch(): ActiveMatchLike | null {
  const setup = getStoredMatchSetup();

  if (!setup || setup.status !== "active") {
    return null;
  }

  const liveState = getStoredLiveMatch();

  if (!liveState) {
    return {
      id: setup.config.id,
      title: "Live match",
      teamId: setup.config.teamId,
      status: "abandoned",
      runtimeState: null,
    };
  }

  return {
    id: setup.config.id,
    title: "Live match",
    teamId: setup.config.teamId,
    status: "live",
    runtimeState: liveState as unknown as Record<string, unknown>,
  };
}

export function clearLocalActiveState(): void {
  clearStoredLiveMatch();
  clearStoredMatchSetup();
}

/** Live screen route for this device's active match (server-backed or local). */
export function liveHrefFor(serverMatchId: string | null | undefined): string {
  return serverMatchId
    ? `/match/live?matchId=${encodeURIComponent(serverMatchId)}`
    : "/match/live";
}

export type StartLocalMatchResult =
  | { ok: true; liveMatch: LiveMatchState }
  | { ok: false; reason: "active_match" };

/**
 * Starts a match on this device: a fresh live state plus an `active` setup.
 *
 * Refused while another match is active, because starting would wipe its
 * minutes and events. That match must first be ended or discarded through the
 * match lifecycle (live screen, recovery card or start guard).
 */
export function startLocalMatch(
  setup: MatchConfig,
  serverMatchId: string | null
): StartLocalMatchResult {
  if (hasActiveStoredMatch()) {
    return { ok: false, reason: "active_match" };
  }

  clearStoredLiveMatch();
  const liveMatch = createLiveMatchFromSetup(setup);
  saveStoredLiveMatch(liveMatch);
  // Keep the server record with the local setup so the live screen can still
  // sync the completion when it is reopened without ?matchId (e.g. offline).
  activateMatch(setup, serverMatchId);

  return { ok: true, liveMatch };
}

export interface PersistedActionArgs {
  matchId: string | null;
  fetchImpl: typeof fetch;
  mode: "force-close" | "discard";
}

export async function persistActiveMatchCloseAction({
  matchId,
  fetchImpl,
  mode,
}: PersistedActionArgs): Promise<void> {
  if (!matchId) {
    return;
  }

  const response = await fetchImpl(`/api/matches/${encodeURIComponent(matchId)}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      status: "completed",
      runtimeState: null,
      reportStatus: mode === "discard" ? "failed" : undefined,
    }),
  });

  if (!response.ok) {
    throw new Error("ACTIVE_MATCH_CLOSE_FAILED");
  }
}

export function hasActiveConflict(currentMatchId: string | null, resolution: ActiveMatchResolution): boolean {
  if (!resolution.activeMatch) {
    return false;
  }

  if (!currentMatchId) {
    return true;
  }

  return resolution.activeMatch.id !== currentMatchId;
}
