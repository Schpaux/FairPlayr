/**
 * Match domain — types and pure functions.
 *
 * Single source of truth for match setup + lineup configuration.
 */

export type MatchFormat = "3v3" | "5v5" | "7v7" | "9v9" | "11v11";

export type MatchDurationPresetId =
  | "2x10"
  | "2x15"
  | "2x20"
  | "2x25"
  | "2x30";

export interface FieldSlot {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface FormationPreset {
  id: string;
  shape: string;
  slots: FieldSlot[];
}

export interface MatchDurationConfig {
  mode: "preset" | "custom";
  presetId: MatchDurationPresetId | null;
  halves: number;
  minutesPerHalf: number;
  totalMinutes: number;
}

export const FORMAT_FIELD_COUNT: Record<MatchFormat, number> = {
  "3v3": 3,
  "5v5": 5,
  "7v7": 7,
  "9v9": 9,
  "11v11": 11,
};

export const ALL_FORMATS: readonly MatchFormat[] = [
  "3v3",
  "5v5",
  "7v7",
  "9v9",
  "11v11",
];

export const MATCH_DURATION_PRESETS: Record<
  MatchDurationPresetId,
  { halves: number; minutesPerHalf: number; totalMinutes: number }
> = {
  "2x10": { halves: 2, minutesPerHalf: 10, totalMinutes: 20 },
  "2x15": { halves: 2, minutesPerHalf: 15, totalMinutes: 30 },
  "2x20": { halves: 2, minutesPerHalf: 20, totalMinutes: 40 },
  "2x25": { halves: 2, minutesPerHalf: 25, totalMinutes: 50 },
  "2x30": { halves: 2, minutesPerHalf: 30, totalMinutes: 60 },
};

export const ALL_DURATION_PRESETS = Object.keys(
  MATCH_DURATION_PRESETS
) as MatchDurationPresetId[];

export const FORMAT_DEFAULT_DURATION_PRESET: Record<
  MatchFormat,
  MatchDurationPresetId
> = {
  "3v3": "2x10",
  "5v5": "2x15",
  "7v7": "2x20",
  "9v9": "2x25",
  "11v11": "2x30",
};

const FORMATION_PRESETS: Record<MatchFormat, FormationPreset[]> = {
  "3v3": [
    {
      id: "3v3-balanced",
      shape: "1-1",
      slots: [
        { id: "3v3-1", label: "1", x: 50, y: 82 },
        { id: "3v3-2", label: "2", x: 30, y: 48 },
        { id: "3v3-3", label: "3", x: 70, y: 48 },
      ],
    },
  ],
  "5v5": [
    {
      id: "5v5-2-2",
      shape: "2-2",
      slots: [
        { id: "5v5-1", label: "1", x: 50, y: 84 },
        { id: "5v5-2", label: "2", x: 32, y: 58 },
        { id: "5v5-3", label: "3", x: 68, y: 58 },
        { id: "5v5-4", label: "4", x: 36, y: 32 },
        { id: "5v5-5", label: "5", x: 64, y: 32 },
      ],
    },
    {
      id: "5v5-1-2-1",
      shape: "1-2-1",
      slots: [
        { id: "5v5-1", label: "1", x: 50, y: 84 },
        { id: "5v5-2", label: "2", x: 50, y: 60 },
        { id: "5v5-3", label: "3", x: 34, y: 44 },
        { id: "5v5-4", label: "4", x: 66, y: 44 },
        { id: "5v5-5", label: "5", x: 50, y: 26 },
      ],
    },
    {
      id: "5v5-2-1-1",
      shape: "2-1-1",
      slots: [
        { id: "5v5-1", label: "1", x: 50, y: 84 },
        { id: "5v5-2", label: "2", x: 32, y: 60 },
        { id: "5v5-3", label: "3", x: 68, y: 60 },
        { id: "5v5-4", label: "4", x: 50, y: 40 },
        { id: "5v5-5", label: "5", x: 50, y: 24 },
      ],
    },
  ],
  "7v7": [
    {
      id: "7v7-2-3-1",
      shape: "2-3-1",
      slots: [
        { id: "7v7-1", label: "1", x: 50, y: 85 },
        { id: "7v7-2", label: "2", x: 34, y: 66 },
        { id: "7v7-3", label: "3", x: 66, y: 66 },
        { id: "7v7-4", label: "4", x: 24, y: 48 },
        { id: "7v7-5", label: "5", x: 50, y: 44 },
        { id: "7v7-6", label: "6", x: 76, y: 48 },
        { id: "7v7-7", label: "7", x: 50, y: 24 },
      ],
    },
    {
      id: "7v7-3-2-1",
      shape: "3-2-1",
      slots: [
        { id: "7v7-1", label: "1", x: 50, y: 85 },
        { id: "7v7-2", label: "2", x: 24, y: 66 },
        { id: "7v7-3", label: "3", x: 50, y: 64 },
        { id: "7v7-4", label: "4", x: 76, y: 66 },
        { id: "7v7-5", label: "5", x: 36, y: 42 },
        { id: "7v7-6", label: "6", x: 64, y: 42 },
        { id: "7v7-7", label: "7", x: 50, y: 22 },
      ],
    },
    {
      id: "7v7-2-2-2",
      shape: "2-2-2",
      slots: [
        { id: "7v7-1", label: "1", x: 50, y: 85 },
        { id: "7v7-2", label: "2", x: 34, y: 66 },
        { id: "7v7-3", label: "3", x: 66, y: 66 },
        { id: "7v7-4", label: "4", x: 34, y: 44 },
        { id: "7v7-5", label: "5", x: 66, y: 44 },
        { id: "7v7-6", label: "6", x: 38, y: 24 },
        { id: "7v7-7", label: "7", x: 62, y: 24 },
      ],
    },
  ],
  "9v9": [
    {
      id: "9v9-3-3-2",
      shape: "3-3-2",
      slots: [
        { id: "9v9-1", label: "1", x: 50, y: 86 },
        { id: "9v9-2", label: "2", x: 24, y: 68 },
        { id: "9v9-3", label: "3", x: 50, y: 66 },
        { id: "9v9-4", label: "4", x: 76, y: 68 },
        { id: "9v9-5", label: "5", x: 24, y: 46 },
        { id: "9v9-6", label: "6", x: 50, y: 44 },
        { id: "9v9-7", label: "7", x: 76, y: 46 },
        { id: "9v9-8", label: "8", x: 40, y: 24 },
        { id: "9v9-9", label: "9", x: 60, y: 24 },
      ],
    },
    {
      id: "9v9-2-4-2",
      shape: "2-4-2",
      slots: [
        { id: "9v9-1", label: "1", x: 50, y: 86 },
        { id: "9v9-2", label: "2", x: 35, y: 68 },
        { id: "9v9-3", label: "3", x: 65, y: 68 },
        { id: "9v9-4", label: "4", x: 18, y: 48 },
        { id: "9v9-5", label: "5", x: 40, y: 44 },
        { id: "9v9-6", label: "6", x: 60, y: 44 },
        { id: "9v9-7", label: "7", x: 82, y: 48 },
        { id: "9v9-8", label: "8", x: 40, y: 24 },
        { id: "9v9-9", label: "9", x: 60, y: 24 },
      ],
    },
  ],
  "11v11": [
    {
      id: "11v11-4-3-3",
      shape: "4-3-3",
      slots: [
        { id: "11v11-1", label: "1", x: 50, y: 88 },
        { id: "11v11-2", label: "2", x: 16, y: 72 },
        { id: "11v11-3", label: "3", x: 38, y: 72 },
        { id: "11v11-4", label: "4", x: 62, y: 72 },
        { id: "11v11-5", label: "5", x: 84, y: 72 },
        { id: "11v11-6", label: "6", x: 28, y: 50 },
        { id: "11v11-7", label: "7", x: 50, y: 46 },
        { id: "11v11-8", label: "8", x: 72, y: 50 },
        { id: "11v11-9", label: "9", x: 24, y: 24 },
        { id: "11v11-10", label: "10", x: 50, y: 20 },
        { id: "11v11-11", label: "11", x: 76, y: 24 },
      ],
    },
    {
      id: "11v11-4-4-2",
      shape: "4-4-2",
      slots: [
        { id: "11v11-1", label: "1", x: 50, y: 88 },
        { id: "11v11-2", label: "2", x: 16, y: 72 },
        { id: "11v11-3", label: "3", x: 38, y: 72 },
        { id: "11v11-4", label: "4", x: 62, y: 72 },
        { id: "11v11-5", label: "5", x: 84, y: 72 },
        { id: "11v11-6", label: "6", x: 16, y: 50 },
        { id: "11v11-7", label: "7", x: 38, y: 48 },
        { id: "11v11-8", label: "8", x: 62, y: 48 },
        { id: "11v11-9", label: "9", x: 84, y: 50 },
        { id: "11v11-10", label: "10", x: 40, y: 22 },
        { id: "11v11-11", label: "11", x: 60, y: 22 },
      ],
    },
  ],
};

export interface MatchConfig {
  id: string;
  teamId: string;
  format: MatchFormat;
  reportEnabled: boolean;
  formationId: string;
  duration: MatchDurationConfig;
  selectedPlayerIds: string[];
  startingPlayerIds: string[];
  slotAssignments: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
}

export type MatchSetup = MatchConfig;

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `match-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getDefaultDurationPreset(format: MatchFormat): MatchDurationPresetId {
  return FORMAT_DEFAULT_DURATION_PRESET[format];
}

function createDurationFromPreset(presetId: MatchDurationPresetId): MatchDurationConfig {
  const preset = MATCH_DURATION_PRESETS[presetId];
  return {
    mode: "preset",
    presetId,
    halves: preset.halves,
    minutesPerHalf: preset.minutesPerHalf,
    totalMinutes: preset.totalMinutes,
  };
}

export function createCustomDuration(totalMinutes: number): MatchDurationConfig {
  const safeMinutes = Math.max(5, Math.min(240, Math.round(totalMinutes)));
  return {
    mode: "custom",
    presetId: null,
    halves: 2,
    minutesPerHalf: Math.max(1, Math.round(safeMinutes / 2)),
    totalMinutes: safeMinutes,
  };
}

function withUpdatedConfig(config: MatchConfig, patch: Partial<MatchConfig>): MatchConfig {
  return {
    ...config,
    ...patch,
    updatedAt: nowIso(),
  };
}

export function getFormationPresets(format: MatchFormat): FormationPreset[] {
  return FORMATION_PRESETS[format];
}

export function getFormationSlots(format: MatchFormat, formationId: string): FieldSlot[] {
  const presets = getFormationPresets(format);
  const formation = presets.find((preset) => preset.id === formationId) ?? presets[0];
  return formation.slots;
}

function createEmptySlotAssignments(
  format: MatchFormat,
  formationId: string
): Record<string, string | null> {
  const assignments: Record<string, string | null> = {};

  for (const slot of getFormationSlots(format, formationId)) {
    assignments[slot.id] = null;
  }

  return assignments;
}

function deriveStartingPlayerIds(
  slotAssignments: Record<string, string | null>,
  slotOrder: FieldSlot[]
): string[] {
  return slotOrder
    .map((slot) => slotAssignments[slot.id])
    .filter((playerId): playerId is string => typeof playerId === "string");
}

function normalizeSlotAssignments(
  config: MatchConfig,
  selectedPlayerIds: string[]
): Record<string, string | null> {
  const slots = getFormationSlots(config.format, config.formationId);
  const selectedSet = new Set(selectedPlayerIds);
  const nextAssignments: Record<string, string | null> = {};
  const used = new Set<string>();

  for (const slot of slots) {
    const assigned = config.slotAssignments[slot.id] ?? null;

    if (assigned && selectedSet.has(assigned) && !used.has(assigned)) {
      nextAssignments[slot.id] = assigned;
      used.add(assigned);
    } else {
      nextAssignments[slot.id] = null;
    }
  }

  return nextAssignments;
}

export function createMatchSetup(
  teamId: string,
  format: MatchFormat = "5v5"
): MatchConfig {
  const now = nowIso();
  const formation = getFormationPresets(format)[0];

  return {
    id: generateId(),
    teamId,
    format,
    reportEnabled: false,
    formationId: formation.id,
    duration: createDurationFromPreset(getDefaultDurationPreset(format)),
    selectedPlayerIds: [],
    startingPlayerIds: [],
    slotAssignments: createEmptySlotAssignments(format, formation.id),
    createdAt: now,
    updatedAt: now,
  };
}

export function setReportEnabled(setup: MatchConfig, enabled: boolean): MatchConfig {
  if (setup.reportEnabled === enabled) {
    return setup;
  }

  return withUpdatedConfig(setup, {
    reportEnabled: enabled,
  });
}

export function setMatchFormat(setup: MatchConfig, format: MatchFormat): MatchConfig {
  if (setup.format === format) {
    return setup;
  }

  const formation = getFormationPresets(format)[0];
  const slots = getFormationSlots(format, formation.id);
  const nextStarting = setup.startingPlayerIds
    .filter((id) => setup.selectedPlayerIds.includes(id))
    .slice(0, FORMAT_FIELD_COUNT[format]);
  const nextAssignments = createEmptySlotAssignments(format, formation.id);

  nextStarting.forEach((playerId, index) => {
    const slot = slots[index];
    if (slot) {
      nextAssignments[slot.id] = playerId;
    }
  });

  return withUpdatedConfig(setup, {
    format,
    formationId: formation.id,
    duration: createDurationFromPreset(getDefaultDurationPreset(format)),
    startingPlayerIds: nextStarting,
    slotAssignments: nextAssignments,
  });
}

export function setMatchDuration(setup: MatchConfig, durationMinutes: number): MatchConfig {
  return withUpdatedConfig(setup, {
    duration: createCustomDuration(durationMinutes),
  });
}

export function setMatchHalves(setup: MatchConfig, halves: 1 | 2): MatchConfig {
  const safeHalves: 1 | 2 = halves === 2 ? 2 : 1;
  const totalMinutes = Math.max(5, setup.duration.totalMinutes);

  return withUpdatedConfig(setup, {
    duration: {
      ...setup.duration,
      halves: safeHalves,
      minutesPerHalf:
        safeHalves === 2
          ? Math.max(1, Math.round(totalMinutes / 2))
          : totalMinutes,
    },
  });
}

export function setDurationFromLegacy(
  setup: MatchConfig,
  durationMinutes: number
): MatchConfig {
  return setMatchDuration(setup, durationMinutes);
}

export function setMatchDurationPreset(
  setup: MatchConfig,
  presetId: MatchDurationPresetId
): MatchConfig {
  return withUpdatedConfig(setup, {
    duration: createDurationFromPreset(presetId),
  });
}

export function setMatchFormation(setup: MatchConfig, formationId: string): MatchConfig {
  const presets = getFormationPresets(setup.format);

  if (!presets.some((preset) => preset.id === formationId) || setup.formationId === formationId) {
    return setup;
  }

  const nextSlots = getFormationSlots(setup.format, formationId);
  const nextAssignments = createEmptySlotAssignments(setup.format, formationId);

  setup.startingPlayerIds.forEach((playerId, index) => {
    const slot = nextSlots[index];
    if (slot) {
      nextAssignments[slot.id] = playerId;
    }
  });

  return withUpdatedConfig(setup, {
    formationId,
    slotAssignments: nextAssignments,
  });
}

export function toggleSquadPlayer(setup: MatchConfig, playerId: string): MatchConfig {
  if (setup.selectedPlayerIds.includes(playerId)) {
    return setSelectedSquad(
      setup,
      setup.selectedPlayerIds.filter((id) => id !== playerId)
    );
  }

  return setSelectedSquad(setup, [...setup.selectedPlayerIds, playerId]);
}

export function setSelectedSquad(
  setup: MatchConfig,
  selectedPlayerIds: string[]
): MatchConfig {
  const deduped = Array.from(new Set(selectedPlayerIds));
  const nextAssignments = normalizeSlotAssignments(setup, deduped);
  const slotOrder = getFormationSlots(setup.format, setup.formationId);
  const nextStarting = deriveStartingPlayerIds(nextAssignments, slotOrder);

  return withUpdatedConfig(setup, {
    selectedPlayerIds: deduped,
    slotAssignments: nextAssignments,
    startingPlayerIds: nextStarting,
  });
}

export function selectAllSquad(setup: MatchConfig, playerIds: string[]): MatchConfig {
  return setSelectedSquad(setup, playerIds);
}

export function promoteToStarter(setup: MatchConfig, playerId: string): MatchConfig {
  const fieldCount = FORMAT_FIELD_COUNT[setup.format];
  if (
    setup.startingPlayerIds.includes(playerId) ||
    !setup.selectedPlayerIds.includes(playerId) ||
    setup.startingPlayerIds.length >= fieldCount
  ) {
    return setup;
  }

  const slots = getFormationSlots(setup.format, setup.formationId);
  const nextAssignments = { ...setup.slotAssignments };
  const firstEmpty = slots.find((slot) => !nextAssignments[slot.id]);

  if (!firstEmpty) {
    return setup;
  }

  for (const slot of slots) {
    if (nextAssignments[slot.id] === playerId) {
      nextAssignments[slot.id] = null;
    }
  }

  nextAssignments[firstEmpty.id] = playerId;

  return withUpdatedConfig(setup, {
    slotAssignments: nextAssignments,
    startingPlayerIds: deriveStartingPlayerIds(nextAssignments, slots),
  });
}

export function demoteToBench(setup: MatchConfig, playerId: string): MatchConfig {
  if (!setup.startingPlayerIds.includes(playerId)) {
    return setup;
  }

  const slots = getFormationSlots(setup.format, setup.formationId);
  const nextAssignments = { ...setup.slotAssignments };

  for (const slot of slots) {
    if (nextAssignments[slot.id] === playerId) {
      nextAssignments[slot.id] = null;
    }
  }

  return withUpdatedConfig(setup, {
    slotAssignments: nextAssignments,
    startingPlayerIds: deriveStartingPlayerIds(nextAssignments, slots),
  });
}

export function assignStarterToSlot(
  setup: MatchConfig,
  slotId: string,
  playerId: string
): MatchConfig {
  const slots = getFormationSlots(setup.format, setup.formationId);

  if (!slots.some((slot) => slot.id === slotId)) {
    return setup;
  }

  if (!setup.selectedPlayerIds.includes(playerId)) {
    return setup;
  }

  const nextAssignments = { ...setup.slotAssignments };

  for (const slot of slots) {
    if (nextAssignments[slot.id] === playerId) {
      nextAssignments[slot.id] = null;
    }
  }

  nextAssignments[slotId] = playerId;

  return withUpdatedConfig(setup, {
    slotAssignments: nextAssignments,
    startingPlayerIds: deriveStartingPlayerIds(nextAssignments, slots),
  });
}

export function clearStarterSlot(setup: MatchConfig, slotId: string): MatchConfig {
  const slots = getFormationSlots(setup.format, setup.formationId);

  if (!slots.some((slot) => slot.id === slotId) || !setup.slotAssignments[slotId]) {
    return setup;
  }

  const nextAssignments = {
    ...setup.slotAssignments,
    [slotId]: null,
  };

  return withUpdatedConfig(setup, {
    slotAssignments: nextAssignments,
    startingPlayerIds: deriveStartingPlayerIds(nextAssignments, slots),
  });
}

export function autoFillLineup(setup: MatchConfig): MatchConfig {
  const slots = getFormationSlots(setup.format, setup.formationId);
  const nextAssignments = createEmptySlotAssignments(setup.format, setup.formationId);
  const starters = setup.selectedPlayerIds.slice(0, slots.length);

  starters.forEach((playerId, index) => {
    const slot = slots[index];
    if (slot) {
      nextAssignments[slot.id] = playerId;
    }
  });

  return withUpdatedConfig(setup, {
    slotAssignments: nextAssignments,
    startingPlayerIds: deriveStartingPlayerIds(nextAssignments, slots),
  });
}

export function getBenchPlayerIds(setup: MatchConfig): string[] {
  return setup.selectedPlayerIds.filter((id) => !setup.startingPlayerIds.includes(id));
}

export function getRequiredStarters(setup: MatchConfig): number {
  return FORMAT_FIELD_COUNT[setup.format];
}

export function getStarterDeficit(setup: MatchConfig): number {
  return FORMAT_FIELD_COUNT[setup.format] - setup.startingPlayerIds.length;
}

export function canStartMatch(setup: MatchConfig): boolean {
  return (
    setup.duration.totalMinutes > 0 &&
    setup.startingPlayerIds.length === FORMAT_FIELD_COUNT[setup.format] &&
    setup.startingPlayerIds.every((id) => setup.selectedPlayerIds.includes(id))
  );
}

export function reconcileWithTeam(
  setup: MatchConfig,
  currentPlayerIds: string[]
): MatchConfig {
  const idSet = new Set(currentPlayerIds);
  const validSelected = setup.selectedPlayerIds.filter((id) => idSet.has(id));
  const nextAssignments = normalizeSlotAssignments(setup, validSelected);
  const slotOrder = getFormationSlots(setup.format, setup.formationId);
  const nextStarting = deriveStartingPlayerIds(nextAssignments, slotOrder);

  const selectedUnchanged =
    validSelected.length === setup.selectedPlayerIds.length &&
    validSelected.every((id, index) => setup.selectedPlayerIds[index] === id);

  const assignmentKeys = Object.keys(nextAssignments);
  const assignmentsUnchanged =
    assignmentKeys.length === Object.keys(setup.slotAssignments).length &&
    assignmentKeys.every((slotId) => nextAssignments[slotId] === setup.slotAssignments[slotId]);

  const startingUnchanged =
    nextStarting.length === setup.startingPlayerIds.length &&
    nextStarting.every((id, index) => setup.startingPlayerIds[index] === id);

  if (selectedUnchanged && assignmentsUnchanged && startingUnchanged) {
    return setup;
  }

  return withUpdatedConfig(setup, {
    selectedPlayerIds: validSelected,
    slotAssignments: nextAssignments,
    startingPlayerIds: nextStarting,
  });
}
