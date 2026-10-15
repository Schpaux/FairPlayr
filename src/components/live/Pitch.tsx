"use client";

/**
 * Pitch (DESIGN.md §5.2): grass, markings and one token per field player.
 * Owns placement only. Taps and drop targets are forwarded to the existing
 * substitution hook; `data-slot-id` is what its drag hit-test looks for.
 */

import { useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { LiveScreenModel, LiveTokenView } from "@/components/live/liveScreenModel";
import styles from "@/components/live/LiveScreen.module.css";

const LINE_INSET = { top: 10, right: 10, bottom: 28, left: 10 };
const STRIPES = 14;
/** Space between the first name and its suffix, in px (`.tagSuffix` margin, 0.25em). */
const NAME_GAP = 4;

function PitchMarkings({ width, height }: { width: number; height: number }) {
  if (!width || !height) return null;

  const x0 = LINE_INSET.left;
  const y0 = LINE_INSET.top;
  const x1 = width - LINE_INSET.right;
  const y1 = height - LINE_INSET.bottom;
  const pw = x1 - x0;
  const ph = y1 - y0;
  const cx = x0 + pw / 2;
  const cy = y0 + ph / 2;
  const boxW = pw * 0.58;
  const boxH = Math.min(ph * 0.15, pw * 0.3);
  const sixW = pw * 0.28;
  const sixH = boxH * 0.38;
  const cr = Math.min(pw, ph) * 0.14;
  const arc = cr * 0.75;

  return (
    <svg className={styles.pitchLines} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {Array.from({ length: STRIPES / 2 }, (_, i) => (
        <rect
          key={i}
          className={styles.pitchStripe}
          x={0}
          y={(i * 2 * height) / STRIPES}
          width={width}
          height={height / STRIPES}
        />
      ))}
      <rect x={x0} y={y0} width={pw} height={ph} rx={2} />
      <path d={`M${x0} ${cy}H${x1}`} />
      <circle cx={cx} cy={cy} r={cr} />
      <circle className={styles.pitchSpot} cx={cx} cy={cy} r={2.2} />
      <rect x={cx - boxW / 2} y={y0} width={boxW} height={boxH} />
      <rect x={cx - sixW / 2} y={y0} width={sixW} height={sixH} />
      <rect x={cx - boxW / 2} y={y1 - boxH} width={boxW} height={boxH} />
      <rect x={cx - sixW / 2} y={y1 - sixH} width={sixW} height={sixH} />
      <path d={`M${cx - arc * 0.62} ${y0 + boxH} A${arc} ${arc} 0 0 0 ${cx + arc * 0.62} ${y0 + boxH}`} />
      <path d={`M${cx - arc * 0.62} ${y1 - boxH} A${arc} ${arc} 0 0 1 ${cx + arc * 0.62} ${y1 - boxH}`} />
    </svg>
  );
}

function Ring({ ratio }: { ratio: number }) {
  return (
    <svg className={styles.ring} viewBox="0 0 56 56" aria-hidden>
      <circle className={styles.ringTrack} cx={28} cy={28} r={26} />
      {ratio > 0 ? (
      <circle
        className={styles.ringValue}
        cx={28}
        cy={28}
        r={26}
        pathLength={100}
        strokeDasharray={`${(Math.min(1, ratio) * 100).toFixed(1)} 100`}
      />
      ) : null}
    </svg>
  );
}

interface PlayerTokenProps {
  token: LiveTokenView;
  selected: boolean;
  target: boolean;
  suggested: boolean;
  landed: boolean;
  disabled: boolean;
  onTap: (playerId: string) => void;
}

function PlayerToken({ token, selected, target, suggested, landed, disabled, onTap }: PlayerTokenProps) {
  const t = useTranslations("matchLive.sideline.token");
  const label = [
    token.name,
    token.hasNumber ? t("number", { number: token.discLabel }) : "",
    token.isKeeper ? t("keeper") : "",
    t("minutes", { minutes: token.minutes }),
    token.fatigue === "fresh" ? "" : t(token.fatigue),
  ].join("");
  // The display name's last word tells clashing players apart ("Emma H" /
  // "Emma Hau"), so a cut shortens the first name and keeps it (DESIGN.md §5.2).
  const split = token.name.lastIndexOf(" ");
  const nameHead = split > 0 ? token.name.slice(0, split) : token.name;
  const nameSuffix = split > 0 ? token.name.slice(split + 1) : "";

  return (
    <button
      type="button"
      data-slot-id={token.slotId}
      data-player-id={token.playerId}
      className={cn(
        styles.token,
        styles[token.fatigue],
        token.isKeeper && styles.keeper,
        selected && styles.selected,
        target && styles.target,
        suggested && styles.suggested,
        landed && styles.landed
      )}
      style={{
        left: `${token.placement.x}%`,
        top: `${token.placement.y}%`,
        width: `calc(${token.placement.room}% - 4px)`,
      }}
      aria-label={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onTap(token.playerId);
      }}
    >
      <span className={styles.disc}>
        <Ring ratio={token.ringRatio} />
        <span className={token.hasNumber ? undefined : styles.discInitials}>{token.discLabel}</span>
        {token.isKeeper ? (
          <span className={styles.keeperBadge} aria-hidden>
            K
          </span>
        ) : null}
      </span>
      <span className={styles.tag}>
        <span className={styles.tagName} data-name>
          <span className={styles.tagFirst}>{nameHead}</span>
          {nameSuffix ? <span className={styles.tagSuffix}>{nameSuffix}</span> : null}
        </span>
        <span className={styles.tagMinutes}>{token.minutes}′</span>
      </span>
    </button>
  );
}

interface PitchProps {
  model: LiveScreenModel;
  disabled: boolean;
  landedPlayerId: string | null;
  onTapFieldPlayer: (playerId: string) => void;
  onBackgroundTap: () => void;
  children?: React.ReactNode;
}

export function Pitch({ model, disabled, landedPlayerId, onTapFieldPlayer, onBackgroundTap, children }: PitchProps) {
  const t = useTranslations("matchLive.sideline.pitch");
  const pitchRef = useRef<HTMLDivElement>(null);
  const tokenBoxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = pitchRef.current;
    if (!element) return;

    const measure = () => {
      const box = element.getBoundingClientRect();
      setSize((previous) =>
        previous.width === Math.round(box.width) && previous.height === Math.round(box.height)
          ? previous
          : { width: Math.round(box.width), height: Math.round(box.height) }
      );
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A regular or roomy tag that cannot fit name and minutes on one line stacks
  // them, but only if the taller tag stays clear of every other token
  // (prototype fitTokens). Measured after every commit (at most 11 tokens)
  // and set on the DOM, so React does not own the attribute.
  useLayoutEffect(() => {
    const box = tokenBoxRef.current;
    if (!box) return;
    const all = [...box.querySelectorAll<HTMLElement>("[data-player-id]")];
    const rect = (element: Element) => element.getBoundingClientRect();
    const overlaps = (a: DOMRect, b: { left: number; right: number; top: number; bottom: number }) =>
      a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2;
    const footprint = (element: Element) => {
      const disc = rect(element.firstElementChild ?? element);
      const tag = rect(element.lastElementChild ?? element);
      return {
        left: Math.min(disc.left, tag.left),
        right: Math.max(disc.right, tag.right),
        top: disc.top - 6,
        bottom: tag.bottom,
      };
    };
    // One-line tag: padding 2 × 8px + 6px gap; cap from the tag's max-width.
    const tagCap = model.density === "roomy" ? 168 : 128;

    // The name's parts can shrink, so its own scrollWidth is not its natural width.
    const naturalWidth = (name: HTMLElement) =>
      [...name.children].reduce((sum, part) => sum + part.scrollWidth, 0) +
      (name.children.length > 1 ? NAME_GAP : 0);

    for (const element of all) {
      const name = element.querySelector<HTMLElement>("[data-name]");
      const minutes = element.lastElementChild?.lastElementChild;
      // Intrinsic widths do not depend on whether the tag is stacked.
      const needsStack =
        model.density !== "compact" &&
        name !== null &&
        minutes !== null &&
        minutes !== undefined &&
        naturalWidth(name) + rect(minutes).width + 22 > Math.min(tagCap, element.clientWidth) + 1;

      if (!needsStack) {
        if (element.hasAttribute("data-stack")) element.removeAttribute("data-stack");
        continue;
      }

      if (!element.hasAttribute("data-stack")) element.setAttribute("data-stack", "true");
      const tag = rect(element.lastElementChild ?? element);
      if (all.some((other) => other !== element && overlaps(tag, footprint(other)))) {
        element.removeAttribute("data-stack");
      }
    }
  });

  return (
    <div
      ref={pitchRef}
      className={styles.pitch}
      role="group"
      aria-label={t("label")}
      onClick={onBackgroundTap}
    >
      <PitchMarkings width={size.width} height={size.height} />
      <div ref={tokenBoxRef} className={styles.tokenBox}>
        {model.tokens.map((token) => (
          <PlayerToken
            key={token.slotId}
            token={token}
            selected={token.playerId === model.selectedFieldPlayerId}
            target={model.draggingBenchPlayerId !== null}
            suggested={
              model.strip === "suggestion" && token.playerId === model.suggestion?.outgoingPlayerId
            }
            landed={token.playerId === landedPlayerId}
            disabled={disabled}
            onTap={onTapFieldPlayer}
          />
        ))}
      </div>
      {children}
    </div>
  );
}
