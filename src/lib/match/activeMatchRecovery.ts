import { createLiveMatchFromSetup, endLiveMatch, type LiveMatchState } from "@/domain/liveMatch";
import type { MatchConfig } from "@/domain/match";
import {
  activateMatch,
  clearStoredMatchSetup,
  endMatch,
  getStoredMatchSetup,
  hasActiveStoredMatch,
} from "@/lib/storage/matchStorage";
import {
  clearStoredLiveMatch,
  getStoredLiveMatch,
  saveStoredLiveMatch,
} from "@/lib/storage/liveMatchStorage";
import {
  listPendingMatchCompletionIds,
  type MatchCompletionBody,
  type PendingMatchCompletion,
} from "@/lib/storage/pendingMatchCompletionStorage";

export type CanonicalMatchStatus = "planned" | "live" | "completed" | "cancelled" | "abandoned";

export interface ActiveMatchLike {
  id: string;
  title: string;
  teamId: string;
  status: string;
  runtimeState?: Record<string, unknown> | null;
  /**
   * Only on this device's own match: the server record it was started for
   * (null = local-only, undefined = stored before the field existed) and the
   * local setup id.
   */
  serverMatchId?: string | null;
  setupId?: string;
}

/**
 * FP-P0-F2: the device is authoritative for the match it is running. A server
 * row marked live is only a recovery candidate here; it never becomes this
 * device's active match and the banner never links to it as one.
 */
export interface ActiveMatchResolution {
  /** The match genuinely active on this device, or null. */
  activeMatch: ActiveMatchLike | null;
  canonicalStatus: CanonicalMatchStatus | null;
  source: "device" | "server_recovery" | "none";
  /** True when there is something to resolve but nothing running here. */
  needsRecovery: boolean;
  /** A server match left open that this device is not running. */
  recoveryMatch: ActiveMatchLike | null;
  /** Where the coach resolves `recoveryMatch`: its own details page. */
  recoveryHref: string | null;
  /** `recoveryMatch` has a live server snapshot this device could resume. */
  canContinue: boolean;
  /** Live screen route for `activeMatch`. */
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

/** True when a server row is the record of this device's own match. */
export function isDeviceMatch(server: ActiveMatchLike, local: ActiveMatchLike): boolean {
  if (local.serverMatchId) {
    return server.id === local.serverMatchId;
  }

  // A setup stored before its server id was recorded only pairs with a row
  // whose runtime state names this setup; never guessed otherwise.
  return (
    local.serverMatchId === undefined &&
    Boolean(local.setupId) &&
    server.runtimeState?.setupId === local.setupId
  );
}

export function recoveryHrefFor(matchId: string): string {
  return `/match/${encodeURIComponent(matchId)}`;
}

/**
 * @param closedOnDevice server match ids this device has already ended (a
 *   completion is pending or its stored setup is ended). A stale server row
 *   for one of them is neither active nor a recovery candidate.
 */
export function resolveActiveMatch(
  serverActive: ActiveMatchLike | null,
  serverRecoverable: ActiveMatchLike | null,
  localActive: ActiveMatchLike | null,
  closedOnDevice: ReadonlySet<string> = new Set()
): ActiveMatchResolution {
  const serverCandidates = [serverActive, serverRecoverable].filter(
    (match): match is ActiveMatchLike =>
      Boolean(match) && match!.status !== "completed" && !closedOnDevice.has(match!.id)
  );

  const ownServerRow = localActive
    ? serverCandidates.find((match) => isDeviceMatch(match, localActive)) ?? null
    : null;

  const activeMatch = localActive
    ? {
        ...localActive,
        id: ownServerRow?.id ?? localActive.id,
        serverMatchId: localActive.serverMatchId ?? ownServerRow?.id ?? localActive.serverMatchId,
        title: ownServerRow?.title ?? localActive.title,
      }
    : null;

  const recoveryMatch = serverCandidates.find((match) => match !== ownServerRow) ?? null;
  const canContinue = Boolean(
    !activeMatch && recoveryMatch && recoveryMatch.status === "live" && hasRuntimeState(recoveryMatch)
  );

  return {
    activeMatch,
    canonicalStatus: activeMatch
      ? toCanonicalStatus(activeMatch.status)
      : recoveryMatch
        ? toCanonicalStatus(recoveryMatch.status)
        : null,
    source: activeMatch ? "device" : recoveryMatch ? "server_recovery" : "none",
    needsRecovery: activeMatch ? activeMatch.status !== "live" : Boolean(recoveryMatch),
    recoveryMatch,
    recoveryHref: recoveryMatch ? recoveryHrefFor(recoveryMatch.id) : null,
    canContinue,
    href: activeMatch
      ? liveHrefFor(activeMatch.serverMatchId)
      : "/match/live?recovery=1",
  };
}

export function resolveLocalActiveMatch(): ActiveMatchLike | null {
  const setup = getStoredMatchSetup();

  if (!setup || setup.status !== "active") {
    return null;
  }

  const liveState = getStoredLiveMatch();
  const ownLiveState = liveState && liveState.setupId === setup.config.id ? liveState : null;

  return {
    id: setup.serverMatchId || setup.config.id,
    // Filled from the server row when known; the UI shows a generic name.
    title: "",
    teamId: setup.config.teamId,
    status: ownLiveState ? "live" : "abandoned",
    runtimeState: ownLiveState as unknown as Record<string, unknown> | null,
    serverMatchId: setup.serverMatchId,
    setupId: setup.config.id,
  };
}

/** Server match ids this device has ended but whose server row may be stale. */
export function resolveClosedOnDevice(): Set<string> {
  const closed = new Set(listPendingMatchCompletionIds());
  const setup = getStoredMatchSetup();

  if (setup?.status === "ended" && setup.serverMatchId) {
    closed.add(setup.serverMatchId);
  }

  return closed;
}

export function clearLocalActiveState(): void {
  clearStoredLiveMatch();
  clearStoredMatchSetup();
}

/**
 * Clears this device's match only when it is the given match (by server id,
 * or by local setup id for a local-only match). Returns whether it did.
 * Recovery actions for another match must never touch the device's own.
 */
export function clearLocalActiveStateFor(matchId: string): boolean {
  const setup = getStoredMatchSetup();

  if (!setup) {
    return false;
  }

  const isSame = setup.serverMatchId ? setup.serverMatchId === matchId : setup.config.id === matchId;

  if (!isSame) {
    return false;
  }

  clearLocalActiveState();
  return true;
}

export interface LocalMatchEnd {
  serverMatchId: string | null;
  endedLiveMatch: LiveMatchState | null;
  /** The completion to send, when the match has a server record. */
  completion: PendingMatchCompletion | null;
}

/**
 * Ends this device's active match now, the way the live screen's End does:
 * the clock stops and the ended state is stored before anything is sent.
 *
 * With `onlyServerMatchId`, it does nothing unless the device's match is that
 * server match. Returns null when nothing was ended.
 */
export function endLocalActiveMatch(options: {
  nowMs?: number;
  reportEnabled?: boolean;
  onlyServerMatchId?: string;
} = {}): LocalMatchEnd | null {
  const setup = getStoredMatchSetup();

  if (!setup || setup.status !== "active") {
    return null;
  }

  if (options.onlyServerMatchId !== undefined && setup.serverMatchId !== options.onlyServerMatchId) {
    return null;
  }

  const nowMs = options.nowMs ?? Date.now();
  const stored = getStoredLiveMatch();
  const endedLiveMatch =
    stored && stored.setupId === setup.config.id ? endLiveMatch(stored, nowMs) : null;

  if (endedLiveMatch) {
    saveStoredLiveMatch(endedLiveMatch);
  }
  endMatch(setup.config);

  const serverMatchId = setup.serverMatchId ?? null;

  if (!serverMatchId) {
    return { serverMatchId: null, endedLiveMatch, completion: null };
  }

  const body: MatchCompletionBody = {
    status: "completed",
    scoreFor: endedLiveMatch?.teamScore ?? 0,
    scoreAgainst: endedLiveMatch?.opponentScore ?? 0,
    reportEnabled: options.reportEnabled ?? setup.config.reportEnabled,
    // Without a local live state the server keeps its last snapshot.
    ...(endedLiveMatch ? { runtimeState: endedLiveMatch } : {}),
  };

  return {
    serverMatchId,
    endedLiveMatch,
    completion: { matchId: serverMatchId, body, endedAt: new Date(nowMs).toISOString() },
  };
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
    // Finishing keeps the last runtime snapshot (events, minutes) for the
    // history; only an explicit discard clears it.
    body: JSON.stringify(
      mode === "discard"
        ? { status: "completed", runtimeState: null, reportStatus: "failed" }
        : { status: "completed" }
    ),
  });

  if (!response.ok) {
    throw new Error("ACTIVE_MATCH_CLOSE_FAILED");
  }
}

export function hasActiveConflict(currentMatchId: string | null, resolution: ActiveMatchResolution): boolean {
  // This device already runs a match: only that same match may be (re)started.
  if (resolution.activeMatch) {
    return !currentMatchId || resolution.activeMatch.serverMatchId !== currentMatchId;
  }

  // Another match is live on the server: the server would refuse a second one.
  const recovery = resolution.recoveryMatch;
  return Boolean(recovery && recovery.status === "live" && recovery.id !== currentMatchId);
}
