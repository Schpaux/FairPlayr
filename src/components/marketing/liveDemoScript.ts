/**
 * The website's live demo (WEB-01 phase 1, MARKETING.md §8): a scripted,
 * deterministic match moment shown with the app's own live components.
 *
 * Pure: a time `t` (seconds since the loop started) in, a `LiveScreenModel`
 * and the demo's own view facts out. Fictional players, no storage, no
 * network. The numbers follow the product's rules: every on-field player
 * gains a second per second, the bench is least-played first (the Bench
 * component sorts it), the suggestion pairs the outfield player with the most
 * minutes and the bench player with the least, only from a 4-minute gap
 * (DESIGN.md §6.2), and the keeper is never suggested.
 */

import { getFormationSlots } from "@/domain/match";
import type { LiveScreenModel, LiveTokenView } from "@/components/live/liveScreenModel";
import { placeTokens } from "@/components/live/placeTokens";
import { resolveStripKind } from "@/components/live/stripModel";

export const DEMO_FORMAT = "7v7" as const;
export const DEMO_FORMATION = "7v7-2-3-1";
const HALF_MINUTES = 25;
const HALF_SECONDS = HALF_MINUTES * 60;
const SUGGESTION_GAP_SECONDS = 240;

/** Clock at the start of the loop: 16:48 in the first half. */
export const DEMO_START_CLOCK = 16 * 60 + 48;
/** One loop in seconds; the 17:00 minute ticks over inside it. */
export const DEMO_LOOP_SECONDS = 22;

/** Beats of the scripted moment, in loop seconds. */
export const DEMO_BEATS = {
  select: 4.2,
  substitute: 6.6,
  undoEnds: 11.6,
} as const;

interface DemoPlayer {
  id: string;
  name: string;
  number: number;
  /** Playing time at the start of the loop. */
  seconds: number;
  /** Continuous time on the pitch at the start of the loop (the ring). */
  stint: number;
}

// Outfield minutes add up to six field slots × 16:48; the keeper played it all.
const PLAYERS: DemoPlayer[] = [
  { id: "ella", name: "Ella", number: 1, seconds: 1008, stint: 1008 },
  { id: "maja", name: "Maja", number: 7, seconds: 1008, stint: 1008 },
  { id: "sara", name: "Sara", number: 9, seconds: 948, stint: 648 },
  { id: "ida", name: "Ida", number: 8, seconds: 828, stint: 528 },
  { id: "thea", name: "Thea", number: 11, seconds: 768, stint: 468 },
  { id: "nora", name: "Nora", number: 4, seconds: 648, stint: 348 },
  { id: "frida", name: "Frida", number: 10, seconds: 588, stint: 288 },
  { id: "selma", name: "Selma", number: 14, seconds: 288, stint: 0 },
  { id: "emma", name: "Emma", number: 6, seconds: 444, stint: 0 },
  { id: "vilde", name: "Vilde", number: 12, seconds: 528, stint: 0 },
];

const BY_ID = new Map(PLAYERS.map((player) => [player.id, player]));
const KEEPER = "ella";

/** Slot → player at kick-off of the loop (the formation's first slot is the keeper). */
const START_SLOTS: Record<string, string> = {
  "7v7-1": "ella",
  "7v7-2": "nora",
  "7v7-3": "frida",
  "7v7-4": "ida",
  "7v7-5": "sara",
  "7v7-6": "thea",
  "7v7-7": "maja",
};
const START_BENCH = ["selma", "emma", "vilde"];

export type DemoBeat = "suggestion" | "selection" | "undo" | "settled";

export interface DemoLedgerRow {
  id: string;
  name: string;
  minutes: number;
  onField: boolean;
  isKeeper: boolean;
}

export interface DemoFrame {
  beat: DemoBeat;
  model: LiveScreenModel;
  undo: { secondsRemaining: number; expiresAtMs: number } | null;
  /** The player who just came on (lands on the pitch) and who went off (flashes on the bench). */
  landedPlayerId: string | null;
  flashedPlayerId: string | null;
  /** Every player, least-played first (outfield; the keeper last), squad order on ties. */
  ledger: DemoLedgerRow[];
  /** Most minus fewest minutes among outfield players: the fairness gap. */
  spread: number;
  clockSeconds: number;
}

function formatClock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function fatigue(stintSeconds: number): LiveTokenView["fatigue"] {
  const ratio = stintSeconds / HALF_SECONDS;
  if (ratio >= 0.75) return "act";
  if (ratio >= 0.6) return "watch";
  return "fresh";
}

export function demoFrame(rawT: number): DemoFrame {
  const t = Math.min(Math.max(0, rawT), DEMO_LOOP_SECONDS);
  const subbed = t >= DEMO_BEATS.substitute;
  const beat: DemoBeat =
    t < DEMO_BEATS.select ? "suggestion" : t < DEMO_BEATS.substitute ? "selection" : t < DEMO_BEATS.undoEnds ? "undo" : "settled";

  const slots = { ...START_SLOTS };
  // While the undo window is open the bench is held: Maja takes Selma's place.
  const bench = START_BENCH.map((id) => (subbed && id === "selma" ? "maja" : id));
  if (subbed) slots["7v7-7"] = "selma";
  const onField = new Set(Object.values(slots));

  const secondsOf = (id: string) => {
    const player = BY_ID.get(id)!;
    if (id === "maja") return player.seconds + Math.min(t, DEMO_BEATS.substitute);
    if (id === "selma") return player.seconds + Math.max(0, t - DEMO_BEATS.substitute);
    return player.seconds + (onField.has(id) ? t : 0);
  };
  const stintOf = (id: string) => {
    if (!onField.has(id)) return 0;
    if (id === "selma") return t - DEMO_BEATS.substitute;
    return BY_ID.get(id)!.stint + t;
  };
  const minutesOf = (id: string) => Math.floor(secondsOf(id) / 60);

  const formationSlots = getFormationSlots(DEMO_FORMAT, DEMO_FORMATION);
  const placements = placeTokens(formationSlots);
  const tokens: LiveTokenView[] = formationSlots.map((slot) => {
    const id = slots[slot.id];
    const player = BY_ID.get(id)!;
    const isKeeper = id === KEEPER;
    return {
      playerId: id,
      slotId: slot.id,
      name: player.name,
      discLabel: String(player.number),
      hasNumber: true,
      minutes: minutesOf(id),
      isKeeper,
      fatigue: isKeeper ? "fresh" : fatigue(stintOf(id)),
      ringRatio: Math.min(1, stintOf(id) / HALF_SECONDS),
      placement: placements[slot.id],
    };
  });

  // The suggestion as the app makes it, from the displayed minutes.
  const outfield = tokens.filter((token) => !token.isKeeper);
  const most = outfield.reduce((best, token) => (secondsOf(token.playerId) > secondsOf(best.playerId) ? token : best));
  const fewest = bench.reduce((best, id) => (secondsOf(id) < secondsOf(best) ? id : best));
  const gap = secondsOf(most.playerId) - secondsOf(fewest);
  const suggestion =
    beat !== "undo" && gap >= SUGGESTION_GAP_SECONDS
      ? {
          outgoingPlayerId: most.playerId,
          incomingPlayerId: fewest,
          outgoingName: most.name,
          incomingName: BY_ID.get(fewest)!.name,
          outgoingMinutes: minutesOf(most.playerId),
          incomingMinutes: minutesOf(fewest),
        }
      : null;

  const selectedFieldPlayerId = beat === "selection" ? "maja" : null;
  const pendingUndo = beat === "undo";
  const clockSeconds = DEMO_START_CLOCK + t;
  const subMinute = Math.floor((DEMO_START_CLOCK + DEMO_BEATS.substitute) / 60) + 1;

  const model: LiveScreenModel = {
    status: "running",
    phase: "first_half",
    halves: 2,
    halfMinutes: HALF_MINUTES,
    clock: formatClock(clockSeconds),
    clockDisplay: { text: formatClock(clockSeconds), regularSeconds: Math.floor(clockSeconds), stoppageSeconds: 0 },
    inStoppage: false,
    teamScore: 1,
    opponentScore: 1,
    density: "regular",
    tokens,
    bench: bench.map((id) => ({
      playerId: id,
      name: BY_ID.get(id)!.name,
      number: String(BY_ID.get(id)!.number),
      minutes: minutesOf(id),
      squadIndex: PLAYERS.findIndex((player) => player.id === id),
    })),
    selectedFieldPlayerId,
    draggingBenchPlayerId: null,
    positionSwapSourceId: null,
    draggingFieldPlayerId: null,
    positionSwap: null,
    suggestion,
    lastSubstitution: subbed
      ? { inPlayerId: "selma", outPlayerId: "maja", inName: "Selma", outName: "Maja", minute: subMinute }
      : null,
    events: [],
    interactionActive: selectedFieldPlayerId !== null || pendingUndo,
    strip: resolveStripKind({
      status: "running",
      phase: "first_half",
      halves: 2,
      inStoppage: false,
      hasPendingUndo: pendingUndo,
      hasSelection: selectedFieldPlayerId !== null,
      isDragging: false,
      hasSuggestion: suggestion !== null,
    }),
  };

  const undoRemaining = DEMO_BEATS.undoEnds - t;
  const ledger: DemoLedgerRow[] = PLAYERS.map((player) => ({
    id: player.id,
    name: player.name,
    minutes: minutesOf(player.id),
    onField: onField.has(player.id),
    isKeeper: player.id === KEEPER,
  })).sort((a, b) => Number(a.isKeeper) - Number(b.isKeeper) || a.minutes - b.minutes);
  const outfieldMinutes = ledger.filter((row) => !row.isKeeper).map((row) => row.minutes);

  return {
    beat,
    model,
    undo: pendingUndo
      ? { secondsRemaining: Math.max(1, Math.ceil(undoRemaining)), expiresAtMs: Math.round(DEMO_BEATS.undoEnds * 1000) }
      : null,
    landedPlayerId: pendingUndo ? "selma" : null,
    flashedPlayerId: pendingUndo ? "maja" : null,
    ledger,
    spread: Math.max(...outfieldMinutes) - Math.min(...outfieldMinutes),
    clockSeconds,
  };
}
