import { clearStoredMatchSetup, getStoredMatchSetup } from "@/lib/storage/matchStorage";
import { clearStoredLiveMatch, getStoredLiveMatch } from "@/lib/storage/liveMatchStorage";

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
