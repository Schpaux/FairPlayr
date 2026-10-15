/**
 * The only place that turns live match state into Modern Sideline view props
 * (IMPLEMENTATION-PLAN.md, "useLiveScreenModel").
 *
 * Presentation step only: every number comes from an existing domain reader
 * (`getPlayerAccumulatedSeconds`, `getPlayerStintSeconds`, the existing fatigue
 * thresholds and suggestion).
 * Nothing here computes fairness, changes state or decides an action.
 */

import { getPlayerAccumulatedSeconds, type LiveMatchState } from "@/domain/liveMatch";
import { getFormationSlots } from "@/domain/match";
import { getPlayerFatigue, type FatigueLevel } from "@/domain/playerFatigue";
import { getPlayerStintSeconds } from "@/domain/playerStint";
import type { SubstitutionSuggestion } from "@/domain/substitutionSuggestion";
import type { SubInteractionState } from "@/domain/liveSubInteraction";
import type { Player } from "@/domain/team";
import { isKeeperSlot, placeTokens, tokenDensity, type TokenPlacement } from "@/components/live/placeTokens";
import { resolveStripKind, type StripKind } from "@/components/live/stripModel";

export interface LiveTokenView {
  playerId: string;
  slotId: string;
  name: string;
  /** Shirt number, or two initials when the player has none. */
  discLabel: string;
  hasNumber: boolean;
  /** Total match minutes (the prominent number). */
  minutes: number;
  isKeeper: boolean;
  /** Ring colour, from the same stint as `ringRatio` (not total minutes). */
  fatigue: FatigueLevel;
  /** Arc length 0–1 of the ring: time since last rest over one half. */
  ringRatio: number;
  placement: TokenPlacement;
}

export interface LiveBenchView {
  playerId: string;
  name: string;
  number: string | null;
  minutes: number;
}

export interface LiveEventView {
  id: string;
  kind: "goalUs" | "goalThem" | "substitution";
  minute: number | null;
  primary: string | null;
  secondary: string | null;
}

export interface LiveSuggestionView {
  outgoingPlayerId: string;
  incomingPlayerId: string;
  outgoingName: string;
  incomingName: string;
  outgoingMinutes: number;
  incomingMinutes: number;
}

export interface LiveScreenModel {
  status: LiveMatchState["status"];
  phase: LiveMatchState["phase"];
  halves: 1 | 2;
  halfMinutes: number;
  clock: string;
  inStoppage: boolean;
  teamScore: number;
  opponentScore: number;
  density: ReturnType<typeof tokenDensity>;
  tokens: LiveTokenView[];
  bench: LiveBenchView[];
  selectedFieldPlayerId: string | null;
  draggingBenchPlayerId: string | null;
  /** "Bytt plass": the field player waiting for a position-swap partner. */
  positionSwapSourceId: string | null;
  /** The field player being dragged onto another position. */
  draggingFieldPlayerId: string | null;
  /** The position swap inside its undo window (two players, no substitution). */
  positionSwap: {
    playerIds: [string, string];
    names: [string, string];
  } | null;
  suggestion: LiveSuggestionView | null;
  lastSubstitution: {
    inPlayerId: string | null;
    outPlayerId: string | null;
    inName: string;
    outName: string;
    minute: number | null;
  } | null;
  events: LiveEventView[];
  strip: StripKind;
}

export interface BuildLiveScreenModelInput {
  liveMatch: LiveMatchState;
  nowMs: number;
  clock: string;
  inStoppage: boolean;
  playersById: Map<string, Player>;
  getShortName: (playerId: string) => string;
  suggestion: SubstitutionSuggestion | null;
  interaction: SubInteractionState;
}

export function discLabel(player: Pick<Player, "name" | "number"> | undefined): string {
  if (player?.number !== undefined && player.number !== null) {
    return String(player.number);
  }

  const words = (player?.name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return `${first}${last}`.toLocaleUpperCase();
}

function wholeMinutes(seconds: number): number {
  return Math.floor(Math.max(0, seconds) / 60);
}

export function buildLiveScreenModel({
  liveMatch,
  nowMs,
  clock,
  inStoppage,
  playersById,
  getShortName,
  suggestion,
  interaction,
}: BuildLiveScreenModelInput): LiveScreenModel {
  const slots = getFormationSlots(liveMatch.format, liveMatch.formationId);
  const placements = placeTokens(slots);
  const onField = new Set(liveMatch.onFieldPlayerIds);
  const halfSeconds = liveMatch.regularSecondsPerHalf;
  const secondsOf = (playerId: string) => getPlayerAccumulatedSeconds(liveMatch, playerId, nowMs);

  const tokens: LiveTokenView[] = [];
  for (const slot of slots) {
    const playerId = liveMatch.liveSlotAssignments[slot.id] ?? null;
    if (!playerId || !onField.has(playerId)) continue;

    const player = playersById.get(playerId);
    const seconds = secondsOf(playerId);
    const isKeeper = isKeeperSlot(liveMatch.format, slots, slot.id);
    const stintSeconds = getPlayerStintSeconds(liveMatch, playerId, nowMs);

    tokens.push({
      playerId,
      slotId: slot.id,
      name: getShortName(playerId),
      discLabel: discLabel(player),
      hasNumber: player?.number !== undefined && player?.number !== null,
      minutes: wholeMinutes(seconds),
      isKeeper,
      // The keeper is not rotated on fatigue, so its ring never escalates.
      fatigue: isKeeper ? "fresh" : getPlayerFatigue(stintSeconds, halfSeconds),
      ringRatio: halfSeconds > 0 ? Math.min(1, stintSeconds / halfSeconds) : 0,
      placement: placements[slot.id],
    });
  }

  const bench: LiveBenchView[] = liveMatch.benchPlayerIds.map((playerId) => {
    const player = playersById.get(playerId);
    return {
      playerId,
      name: getShortName(playerId),
      number: player?.number !== undefined && player?.number !== null ? String(player.number) : null,
      minutes: wholeMinutes(secondsOf(playerId)),
    };
  });

  const suggestionView: LiveSuggestionView | null = suggestion
    ? {
        outgoingPlayerId: suggestion.outgoingPlayerId,
        incomingPlayerId: suggestion.incomingPlayerId,
        outgoingName: getShortName(suggestion.outgoingPlayerId),
        incomingName: getShortName(suggestion.incomingPlayerId),
        outgoingMinutes: wholeMinutes(suggestion.outgoingSeconds),
        incomingMinutes: wholeMinutes(suggestion.incomingSeconds),
      }
    : null;

  const lastSubEvent = [...liveMatch.events].reverse().find((event) => event.type === "substitution");
  const lastSubstitution =
    lastSubEvent && lastSubEvent.type === "substitution"
      ? {
          inPlayerId: lastSubEvent.inPlayerId,
          outPlayerId: lastSubEvent.outPlayerId,
          inName: lastSubEvent.inPlayerId
            ? getShortName(lastSubEvent.inPlayerId)
            : (lastSubEvent.inPlayerName ?? ""),
          outName: lastSubEvent.outPlayerId
            ? getShortName(lastSubEvent.outPlayerId)
            : (lastSubEvent.outPlayerName ?? ""),
          minute: lastSubEvent.minute,
        }
      : null;

  const events: LiveEventView[] = [];
  for (const event of liveMatch.events) {
    if (event.type === "goal") {
      events.push({
        id: event.id,
        kind: event.teamSide === "own" ? "goalUs" : "goalThem",
        minute: event.minute,
        primary: event.scorerName,
        secondary: event.assistName,
      });
    } else if (event.type === "substitution") {
      events.push({
        id: event.id,
        kind: "substitution",
        minute: event.minute,
        primary: event.inPlayerName,
        secondary: event.outPlayerName,
      });
    }
  }

  const selectedFieldPlayerId =
    interaction.kind === "fieldPlayerSelected" ? interaction.fieldPlayerId : null;
  const draggingBenchPlayerId =
    interaction.kind === "draggingBenchPlayer" ? interaction.benchPlayerId : null;
  const positionSwapSourceId =
    interaction.kind === "positionSwapSource" ? interaction.fieldPlayerId : null;
  const draggingFieldPlayerId =
    interaction.kind === "draggingFieldPlayer" ? interaction.fieldPlayerId : null;
  const positionSwap =
    interaction.kind === "pendingPositionUndo"
      ? {
          playerIds: [interaction.swap.fromPlayerId, interaction.swap.toPlayerId] as [string, string],
          names: [getShortName(interaction.swap.fromPlayerId), getShortName(interaction.swap.toPlayerId)] as [
            string,
            string,
          ],
        }
      : null;

  return {
    status: liveMatch.status,
    phase: liveMatch.phase,
    halves: liveMatch.halves,
    halfMinutes: Math.round(halfSeconds / 60),
    clock,
    inStoppage,
    teamScore: liveMatch.teamScore,
    opponentScore: liveMatch.opponentScore,
    density: tokenDensity(slots.length),
    tokens,
    bench,
    selectedFieldPlayerId,
    draggingBenchPlayerId,
    positionSwapSourceId,
    draggingFieldPlayerId,
    positionSwap,
    suggestion: suggestionView,
    lastSubstitution,
    events,
    strip: resolveStripKind({
      status: liveMatch.status,
      phase: liveMatch.phase,
      halves: liveMatch.halves,
      inStoppage,
      hasPendingUndo: interaction.kind === "pendingUndo",
      hasSelection: selectedFieldPlayerId !== null,
      isDragging: draggingBenchPlayerId !== null,
      hasSuggestion: suggestionView !== null,
      hasPendingPositionUndo: positionSwap !== null,
      isDraggingPosition: draggingFieldPlayerId !== null,
      isChoosingSwapTarget: positionSwapSourceId !== null,
    }),
  };
}
