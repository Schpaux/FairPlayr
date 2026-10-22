"use client";

import { Fragment, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ListGroup, ListRow } from "@/components/ui/primitives";
import type { MatchPlayingTimeSummary } from "@/domain/matchPlayingTime";
import { DEFAULT_SUGGESTION_MIN_GAP_SECONDS } from "@/domain/substitutionSuggestion";

/** A gap is called out from the same 4′ the live suggestion uses (DESIGN.md §6.2). */
const NOTABLE_GAP_MINUTES = DEFAULT_SUGGESTION_MIN_GAP_SECONDS / 60;

export interface MatchPlayingTimeProps {
  /** Null when the match recorded no playing time. */
  summary: MatchPlayingTimeSummary | null;
  /** Player id → name; ids without a name show as an unnamed player. */
  names: ReadonlyMap<string, string>;
  /** A live match's minutes are provisional. */
  isLive?: boolean;
  titleAs?: "h2" | "h3";
}

/**
 * Playing time for a recorded match (UI-DETAIL-01): every squad player,
 * including those who never came on (0′), least played first, against the
 * match's fair share. Only what the stored match records is shown.
 */
/** Visible shorthand (′, ×, ÷, ·) with a spoken equivalent for screen readers. */
function Spoken({ shown, said }: { shown: ReactNode; said: string }) {
  return (
    <>
      <span aria-hidden>{shown}</span>
      <span className="sr-only">{said}</span>
    </>
  );
}

export function MatchPlayingTime({ summary, names, isLive = false, titleAs: Heading = "h2" }: MatchPlayingTimeProps) {
  const t = useTranslations("matchPlanner");

  const minMinutes = summary?.players[0]?.minutes ?? 0;
  const maxMinutes = summary?.players.at(-1)?.minutes ?? 0;
  const notes = summary ? summary.gaps.map((gap) => t(`playingTime.gaps.${gap}`)) : [];
  // C4: the bars share one scale, the minutes the match was played (or the
  // most anyone played without a fair share), so 0′ is an empty track and a
  // full match a full one. The tick marks the fair share. Decorative: the
  // number beside it is what is read.
  const scaleMinutes = summary?.fairShare?.playedMinutes || maxMinutes;
  const fairShareAt =
    summary?.fairShare && scaleMinutes > 0 ? Math.min(1, summary.fairShare.minutes / scaleMinutes) : null;

  return (
    <div className="space-y-2" data-testid="match-playing-time">
      <Heading className="px-1 text-[13px] font-semibold uppercase leading-tight tracking-[0.06em] text-fp-ink-2">
        {t("playingTimeTitle")}
      </Heading>

      {!summary ? (
        <p className="px-1 text-sm text-fp-ink-2">{t("playingTime.unavailable")}</p>
      ) : (
        <>
          {/* Provisional numbers are qualified before they are read. */}
          {isLive ? <p className="px-1 text-sm text-fp-ink-2">{t("playingTime.live")}</p> : null}

          {summary.fairShare ? (
            <div className="px-1" data-testid="match-fair-share">
              <p className="text-base font-semibold text-fp-ink">
                <Spoken
                  shown={t("playingTime.fairShare", { minutes: summary.fairShare.minutes })}
                  said={t("playingTime.fairShareA11y", { minutes: summary.fairShare.minutes })}
                />
              </p>
              <p className="text-sm text-fp-ink-2">
                <Spoken
                  shown={t("playingTime.fairShareBasis", {
                    fieldSlots: summary.fairShare.fieldSlots,
                    playedMinutes: summary.fairShare.playedMinutes,
                    squadSize: summary.fairShare.squadSize,
                  })}
                  said={t("playingTime.fairShareBasisA11y", {
                    fieldSlots: summary.fairShare.fieldSlots,
                    playedMinutes: summary.fairShare.playedMinutes,
                    squadSize: summary.fairShare.squadSize,
                  })}
                />
              </p>
            </div>
          ) : null}

          {/* The bars are decorative, so is their key. */}
          {fairShareAt !== null ? (
            <p aria-hidden className="px-1 text-sm text-fp-ink-2">
              {t("playingTime.barLegend")}
            </p>
          ) : null}

          <ListGroup aria-label={t("playingTime.listLabel")}>
            {summary.players.map((player) => {
              const isLeast = maxMinutes > minMinutes && player.minutes === minMinutes;
              const below = player.gapMinutes !== null && player.gapMinutes <= -NOTABLE_GAP_MINUTES ? -player.gapMinutes : null;
              const details: ReactNode[] = [];

              if (player.role !== "unknown") details.push(t(`playingTime.role.${player.role}`));
              if (isLeast) {
                details.push(<span className="font-semibold text-fp-ink">{t("playingTime.leastPlayed")}</span>);
              }
              if (below !== null) {
                details.push(
                  <span className="text-fp-warn-text">
                    <Spoken
                      shown={t("playingTime.belowFairShare", { minutes: below })}
                      said={t("playingTime.belowFairShareA11y", { minutes: below })}
                    />
                  </span>
                );
              }

              const bar =
                scaleMinutes > 0 ? (
                  <span aria-hidden className="relative mt-2 block h-1.5 rounded-full bg-fp-surface-3" data-testid="playing-time-bar">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-fp-ink-2"
                      style={{ width: `${Math.min(100, (player.minutes / scaleMinutes) * 100)}%` }}
                    />
                    {fairShareAt !== null ? (
                      <span
                        className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-fp-ink"
                        style={{ left: `${fairShareAt * 100}%` }}
                      />
                    ) : null}
                  </span>
                ) : null;

              return (
                <ListRow
                  key={player.playerId}
                  testId={`playing-time-${player.playerId}`}
                  label={names.get(player.playerId) ?? t("playingTime.unknownPlayer")}
                  description={
                    details.length > 0 || bar ? (
                      <>
                        {details.map((detail, index) => (
                          <Fragment key={index}>
                            {index > 0 ? <Spoken shown=" · " said=", " /> : null}
                            {detail}
                          </Fragment>
                        ))}
                        {bar}
                      </>
                    ) : undefined
                  }
                  trailing={
                    <span className="inline-block min-w-[4ch] text-right text-base font-bold tabular-nums text-fp-ink">
                      <Spoken
                        shown={`${player.minutes}′`}
                        said={t("playingTime.minutesA11y", { minutes: player.minutes })}
                      />
                    </span>
                  }
                />
              );
            })}
          </ListGroup>

          {notes.length > 0 ? (
            <ul role="list" aria-label={t("playingTime.notesLabel")} className="space-y-1 px-1 text-sm text-fp-ink-2">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
