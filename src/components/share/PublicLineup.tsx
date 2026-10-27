"use client";

/**
 * FEAT-SHARE-04: the lineup and bench on the public match page. The approved
 * pitch (UI-PITCH-04: own half, keeper at the bottom, `placeTokens`) as a
 * plain view: no drag, no taps, no minutes, no rings, no shirt numbers.
 *
 * What it gets is already filtered (database and `sanitizePublicLineup`): a
 * name only at the detailed level for the youth group, otherwise an empty
 * marker per position and bench place. Names are shortened for the pitch
 * the same way the coach's pitch does it (`buildDisplayNameMap`).
 */

import { useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { getFormationPresets, getFormationSlots } from "@/domain/match";
import type { PublicLineup as PublicLineupData } from "@/domain/matchShare";
import { buildDisplayNameMap } from "@/lib/utils/playerName";
import { isKeeperSlot, placeTokens, tokenDensity } from "@/components/live/placeTokens";
import { PitchMarkings, useElementSize, type PitchLineInset } from "@/components/live/PitchMarkings";
import styles from "@/components/live/LiveScreen.module.css";

/** The setup pitch's frame: no dugout over the grass. */
const PUBLIC_LINE_INSET: PitchLineInset = { top: 10, right: 10, bottom: 10, left: 10 };

export function PublicLineup({ lineup }: { lineup: PublicLineupData }) {
  const t = useTranslations("publicMatch.lineup");
  const title =
    lineup.kind === "planned" ? t("plannedTitle") : lineup.kind === "current" ? t("currentTitle") : t("startTitle");

  return (
    <section aria-labelledby="public-lineup-title" className="space-y-2" data-testid="public-match-lineup" data-kind={lineup.kind}>
      <h2 id="public-lineup-title" className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-ink-2">
        {title}
      </h2>
      {lineup.available && lineup.kind === "start" ? (
        <p className="px-1 text-[15px] text-fp-ink-2" data-testid="public-match-lineup-start-note">
          {t("startNote")}
        </p>
      ) : null}
      {lineup.available ? (
        <LineupPitch lineup={lineup} />
      ) : (
        <p className="px-1 text-[15px] text-fp-ink-2" data-testid="public-match-lineup-unavailable">
          {lineup.kind === "planned"
            ? t("plannedUnavailable")
            : lineup.kind === "start"
              ? t("startUnavailable")
              : t("currentUnavailable")}
        </p>
      )}
    </section>
  );
}

function LineupPitch({ lineup }: { lineup: Extract<PublicLineupData, { available: true }> }) {
  const t = useTranslations("publicMatch.lineup");
  const pitchRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(pitchRef);

  // An unknown formation (never expected) falls back to the format's first, as the app does.
  const known = getFormationPresets(lineup.format).some((preset) => preset.id === lineup.formationId);
  const slots = getFormationSlots(lineup.format, lineup.formationId);
  const placements = useMemo(() => placeTokens(slots), [slots]);
  const density = tokenDensity(slots.length);

  // Short names for pitch and bench together, so clashing first names are told apart alike.
  const names = useMemo(() => {
    const people = [
      ...lineup.field.map((entry, index) => ({ id: `f${index}`, name: entry.name ?? "" })),
      ...lineup.bench.map((entry, index) => ({ id: `b${index}`, name: entry.name ?? "" })),
    ].filter((person) => person.name);
    return buildDisplayNameMap(people);
  }, [lineup.field, lineup.bench]);

  const bySlot = new Map(lineup.field.map((entry, index) => [entry.slot, { ...entry, key: `f${index}` }]));
  const benchNames = lineup.bench.map((entry, index) => (entry.name ? (names.get(`b${index}`) ?? entry.name) : null));
  const namedBench = benchNames.every((name) => name !== null);

  return (
    <div className="mx-auto w-full max-w-[420px] space-y-3">
      <div
        ref={pitchRef}
        role="img"
        aria-label={t("pitchLabel")}
        className={cn(styles.setupPitch, density !== "regular" && styles[density])}
        data-testid="public-match-pitch"
      >
        <PitchMarkings width={size.width} height={size.height} inset={PUBLIC_LINE_INSET} />
        <div className={styles.tokenBox} aria-hidden>
          {slots.map((slot) => {
            const entry = known ? bySlot.get(slot.id) : undefined;
            if (!entry) return null;
            const placement = placements[slot.id];
            const isKeeper = isKeeperSlot(lineup.format, slots, slot.id);
            const name = entry.name ? (names.get(entry.key) ?? entry.name) : "";
            const split = name.indexOf(" ");
            const nameHead = split > 0 ? name.slice(0, split) : name;
            const nameSuffix = split > 0 ? name.slice(split + 1) : "";
            return (
              <div
                key={slot.id}
                className={cn(styles.token, isKeeper && styles.keeper)}
                style={{ left: `${placement.x}%`, top: `${placement.y}%`, width: `calc(${placement.room}% - 4px)` }}
                data-testid="public-lineup-token"
              >
                <span className={styles.disc}>
                  {isKeeper ? (
                    <span className={styles.keeperBadge}>K</span>
                  ) : null}
                </span>
                {name ? (
                  <span className={styles.tag}>
                    <span className={styles.tagName}>
                      <span className={styles.tagFirst}>{nameHead}</span>
                      {nameSuffix ? <span className={styles.tagSuffix}>{nameSuffix}</span> : null}
                    </span>
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Read out as a list, since the pitch itself is one image. */}
      <ul className="sr-only">
        {slots.map((slot) => {
          const entry = known ? bySlot.get(slot.id) : undefined;
          if (!entry) return null;
          const keeper = isKeeperSlot(lineup.format, slots, slot.id);
          const name = entry.name ? (names.get(entry.key) ?? entry.name) : t("player");
          return <li key={slot.id}>{keeper ? `${name}, ${t("keeper")}` : name}</li>;
        })}
      </ul>

      <div role="group" aria-labelledby="public-bench-title" data-testid="public-match-bench">
        <h3
          id="public-bench-title"
          className="mb-2 flex items-center justify-between gap-2 px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-ink-2"
        >
          <span>{t("benchTitle")}</span>
          <span className="tabular-nums">{lineup.bench.length}</span>
        </h3>
        {lineup.bench.length === 0 ? (
          <p className="px-1 text-[15px] text-fp-ink-2">{t("benchEmpty")}</p>
        ) : namedBench ? (
          <ul className={styles.setupBench}>
            {benchNames.map((name, index) => (
              <li
                key={index}
                className={cn(styles.setupBenchTile, "inline-flex cursor-default items-center")}
                data-testid="public-bench-player"
              >
                {name}
              </li>
            ))}
          </ul>
        ) : (
          // Anonymous: one quiet marker per place, and the count in words.
          <div className="flex items-center gap-3 px-1">
            <span aria-hidden className="flex flex-wrap gap-1.5">
              {lineup.bench.map((_, index) => (
                <span key={index} className="size-5 rounded-full bg-fp-surface-2 shadow-[inset_0_0_0_1px_var(--fp-rule)]" data-testid="public-bench-marker" />
              ))}
            </span>
            <span className="text-[15px] text-fp-ink-2">{t("benchCount", { count: lineup.bench.length })}</span>
          </div>
        )}
      </div>
    </div>
  );
}
