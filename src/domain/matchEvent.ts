export type MatchEventType =
  | "goal"
  | "substitution"
  | "match_started"
  | "match_ended";

export type MatchEventTeamSide = "own" | "opponent";

interface MatchEventBase {
  id: string;
  type: MatchEventType;
  minute: number | null;
  timestampMs: number | null;
  createdAt: string;
}

export interface GoalMatchEvent extends MatchEventBase {
  type: "goal";
  teamSide: MatchEventTeamSide;
  scorerPlayerId: string | null;
  scorerName: string | null;
  assistPlayerId: string | null;
  assistName: string | null;
}

export interface SubstitutionMatchEvent extends MatchEventBase {
  type: "substitution";
  inPlayerId: string | null;
  inPlayerName: string | null;
  outPlayerId: string | null;
  outPlayerName: string | null;
}

export interface MatchStartedEvent extends MatchEventBase {
  type: "match_started";
}

export interface MatchEndedEvent extends MatchEventBase {
  type: "match_ended";
}

export type MatchEvent =
  | GoalMatchEvent
  | SubstitutionMatchEvent
  | MatchStartedEvent
  | MatchEndedEvent;

export interface LegacyLiveScoreEvent {
  id?: unknown;
  type?: unknown;
  minute?: unknown;
  playerName?: unknown;
  outPlayerName?: unknown;
}

interface MatchEventCreateBase {
  id?: string;
  minute?: number | null;
  timestampMs?: number | null;
  createdAt?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeMinute(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.floor(value));
}

function normalizeTimestampMs(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.floor(value));
}

function createBase(input: MatchEventCreateBase): Omit<MatchEventBase, "type"> {
  return {
    id: input.id ?? generateId(),
    minute: normalizeMinute(input.minute),
    timestampMs: normalizeTimestampMs(input.timestampMs),
    createdAt: input.createdAt ?? nowIso(),
  };
}

export function createGoalEvent(
  input: MatchEventCreateBase & {
    teamSide: MatchEventTeamSide;
    scorerPlayerId?: string | null;
    scorerName?: string | null;
    assistPlayerId?: string | null;
    assistName?: string | null;
  }
): GoalMatchEvent {
  return {
    ...createBase(input),
    type: "goal",
    teamSide: input.teamSide,
    scorerPlayerId: input.scorerPlayerId ?? null,
    scorerName: input.scorerName ?? null,
    assistPlayerId: input.assistPlayerId ?? null,
    assistName: input.assistName ?? null,
  };
}

export function createSubstitutionEvent(
  input: MatchEventCreateBase & {
    inPlayerId?: string | null;
    inPlayerName?: string | null;
    outPlayerId?: string | null;
    outPlayerName?: string | null;
  }
): SubstitutionMatchEvent {
  return {
    ...createBase(input),
    type: "substitution",
    inPlayerId: input.inPlayerId ?? null,
    inPlayerName: input.inPlayerName ?? null,
    outPlayerId: input.outPlayerId ?? null,
    outPlayerName: input.outPlayerName ?? null,
  };
}

export function createMatchStartedEvent(input: MatchEventCreateBase = {}): MatchStartedEvent {
  return {
    ...createBase(input),
    type: "match_started",
  };
}

export function createMatchEndedEvent(input: MatchEventCreateBase = {}): MatchEndedEvent {
  return {
    ...createBase(input),
    type: "match_ended",
  };
}

export function updateGoalEventContributors(
  events: MatchEvent[],
  eventId: string,
  updates: {
    scorerPlayerId?: string | null;
    scorerName?: string | null;
    assistPlayerId?: string | null;
    assistName?: string | null;
  }
): MatchEvent[] {
  return events.map((event) => {
    if (event.id !== eventId || event.type !== "goal") {
      return event;
    }

    return {
      ...event,
      scorerPlayerId:
        updates.scorerPlayerId !== undefined ? updates.scorerPlayerId : event.scorerPlayerId,
      scorerName: updates.scorerName !== undefined ? updates.scorerName : event.scorerName,
      assistPlayerId:
        updates.assistPlayerId !== undefined ? updates.assistPlayerId : event.assistPlayerId,
      assistName: updates.assistName !== undefined ? updates.assistName : event.assistName,
    };
  });
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeMatchEvents(value: unknown): MatchEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const events: MatchEvent[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const id = asString(item.id) ?? undefined;
    const minute = asNumber(item.minute);
    const timestampMs = asNumber(item.timestampMs);
    const createdAt = asString(item.createdAt) ?? undefined;

    if (item.type === "goal") {
      const teamSide = item.teamSide === "opponent" ? "opponent" : "own";
      events.push(
        createGoalEvent({
          id,
          minute,
          timestampMs,
          createdAt,
          teamSide,
          scorerPlayerId: asString(item.scorerPlayerId),
          scorerName: asString(item.scorerName),
          assistPlayerId: asString(item.assistPlayerId),
          assistName: asString(item.assistName),
        })
      );
      continue;
    }

    if (item.type === "substitution") {
      events.push(
        createSubstitutionEvent({
          id,
          minute,
          timestampMs,
          createdAt,
          inPlayerId: asString(item.inPlayerId),
          inPlayerName: asString(item.inPlayerName),
          outPlayerId: asString(item.outPlayerId),
          outPlayerName: asString(item.outPlayerName),
        })
      );
      continue;
    }

    if (item.type === "match_started") {
      events.push(createMatchStartedEvent({ id, minute, timestampMs, createdAt }));
      continue;
    }

    if (item.type === "match_ended") {
      events.push(createMatchEndedEvent({ id, minute, timestampMs, createdAt }));
    }
  }

  return events;
}

export function migrateLegacyLiveEvents(value: unknown): MatchEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const migrated: MatchEvent[] = [];

  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const legacy = item as LegacyLiveScoreEvent;
    const type = legacy.type;
    const minute = asNumber(legacy.minute);
    const id = asString(legacy.id) ?? undefined;

    if (type === "goal_for") {
      migrated.push(
        createGoalEvent({
          id,
          minute,
          teamSide: "own",
          scorerName: asString(legacy.playerName),
        })
      );
      continue;
    }

    if (type === "goal_against") {
      migrated.push(
        createGoalEvent({
          id,
          minute,
          teamSide: "opponent",
          scorerName: asString(legacy.playerName),
        })
      );
      continue;
    }

    if (type === "substitution") {
      migrated.push(
        createSubstitutionEvent({
          id,
          minute,
          inPlayerName: asString(legacy.playerName),
          outPlayerName: asString(legacy.outPlayerName),
        })
      );
    }
  }

  return migrated;
}
