import type { MatchFormat } from "@/domain/match";
import { getLineupSlots } from "@/domain/lineupLayouts";

export interface LineupDraft {
  id: string;
  teamId: string;
  format: MatchFormat;
  selectedPlayerIds: string[];
  slotAssignments: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
}

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function createSlotAssignments(format: MatchFormat): Record<string, string | null> {
  const assignments: Record<string, string | null> = {};

  for (const slot of getLineupSlots(format)) {
    assignments[slot.id] = null;
  }

  return assignments;
}

export function createLineupDraft(teamId: string, format: MatchFormat): LineupDraft {
  const timestamp = nowIso();

  return {
    id: generateId(),
    teamId,
    format,
    selectedPlayerIds: [],
    slotAssignments: createSlotAssignments(format),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function setLineupFormat(draft: LineupDraft, format: MatchFormat): LineupDraft {
  if (draft.format === format) {
    return draft;
  }

  return {
    ...draft,
    format,
    slotAssignments: createSlotAssignments(format),
    updatedAt: nowIso(),
  };
}

export function setSelectedPlayers(
  draft: LineupDraft,
  selectedPlayerIds: string[]
): LineupDraft {
  const selected = Array.from(new Set(selectedPlayerIds));
  const nextAssignments: Record<string, string | null> = {};

  for (const [slotId, playerId] of Object.entries(draft.slotAssignments)) {
    nextAssignments[slotId] = playerId && selected.includes(playerId) ? playerId : null;
  }

  return {
    ...draft,
    selectedPlayerIds: selected,
    slotAssignments: nextAssignments,
    updatedAt: nowIso(),
  };
}

export function toggleSelectedPlayer(draft: LineupDraft, playerId: string): LineupDraft {
  if (draft.selectedPlayerIds.includes(playerId)) {
    return setSelectedPlayers(
      draft,
      draft.selectedPlayerIds.filter((id) => id !== playerId)
    );
  }

  return setSelectedPlayers(draft, [...draft.selectedPlayerIds, playerId]);
}

export function assignPlayerToSlot(
  draft: LineupDraft,
  slotId: string,
  playerId: string
): LineupDraft {
  if (!(slotId in draft.slotAssignments)) {
    return draft;
  }

  if (!draft.selectedPlayerIds.includes(playerId)) {
    return draft;
  }

  const nextAssignments = { ...draft.slotAssignments };

  for (const [id, assignedPlayerId] of Object.entries(nextAssignments)) {
    if (assignedPlayerId === playerId) {
      nextAssignments[id] = null;
    }
  }

  nextAssignments[slotId] = playerId;

  return {
    ...draft,
    slotAssignments: nextAssignments,
    updatedAt: nowIso(),
  };
}

export function clearSlotAssignment(draft: LineupDraft, slotId: string): LineupDraft {
  if (!(slotId in draft.slotAssignments)) {
    return draft;
  }

  if (!draft.slotAssignments[slotId]) {
    return draft;
  }

  return {
    ...draft,
    slotAssignments: {
      ...draft.slotAssignments,
      [slotId]: null,
    },
    updatedAt: nowIso(),
  };
}

export function reconcileLineupWithTeam(
  draft: LineupDraft,
  playerIds: string[]
): LineupDraft {
  const allowed = new Set(playerIds);
  const selectedPlayerIds = draft.selectedPlayerIds.filter((id) => allowed.has(id));
  const nextAssignments: Record<string, string | null> = {};

  for (const slot of getLineupSlots(draft.format)) {
    const assigned = draft.slotAssignments[slot.id] ?? null;
    nextAssignments[slot.id] = assigned && allowed.has(assigned) ? assigned : null;
  }

  const selectedUnchanged =
    selectedPlayerIds.length === draft.selectedPlayerIds.length &&
    selectedPlayerIds.every((id, index) => draft.selectedPlayerIds[index] === id);

  const assignmentKeys = Object.keys(nextAssignments);
  const assignmentsUnchanged =
    assignmentKeys.length === Object.keys(draft.slotAssignments).length &&
    assignmentKeys.every((slotId) => nextAssignments[slotId] === draft.slotAssignments[slotId]);

  if (selectedUnchanged && assignmentsUnchanged) {
    return draft;
  }

  return {
    ...draft,
    selectedPlayerIds,
    slotAssignments: nextAssignments,
    updatedAt: nowIso(),
  };
}

export function getAssignedPlayerIds(draft: LineupDraft): string[] {
  return Object.values(draft.slotAssignments).filter(
    (id): id is string => typeof id === "string"
  );
}

export function getRemainingSelectedPlayerIds(draft: LineupDraft): string[] {
  const assigned = new Set(getAssignedPlayerIds(draft));

  return draft.selectedPlayerIds.filter((playerId) => !assigned.has(playerId));
}
