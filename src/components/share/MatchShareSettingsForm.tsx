"use client";

/**
 * FEAT-SHARE-01: the coach's share settings for one match, used in setup
 * and on match details. «Del live» and «Del oppsummering» are separate
 * switches (both off by default) and share one detail level. The age group
 * guides the level; names are locked for 12 and under and unknown age (v1).
 * The public summary is its own text, separate from the internal AI report.
 * Pure presentation: the caller stores and sends the settings.
 */

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Copy, Lock, Share2 } from "lucide-react";
import { Button, Notice } from "@/components/ui/primitives";
import { getPathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  SHARE_AGE_GROUPS,
  SHARE_DETAIL_LEVELS,
  allowedDetailLevels,
  isShareEnabled,
  sharePath,
  withAgeGroup,
  type MatchShareSettings,
  type ShareAgeGroup,
  type ShareDetailLevel,
} from "@/domain/matchShare";

export type ShareLinkStatus = "ready" | "pending" | "offline" | "failed" | "unavailable";

interface MatchShareSettingsFormProps {
  settings: MatchShareSettings;
  onChange: (settings: MatchShareSettings) => void;
  /** The share token, once there is a link (also before the server has it). */
  token: string | null;
  linkStatus: ShareLinkStatus;
  disabled?: boolean;
  /** Shown while sharing is on, just above the link (setup's kick-off field). */
  beforeLink?: ReactNode;
  /** The link (copy, share) first, above the switches: the live screen's sheet. */
  linkFirst?: boolean;
}

export function MatchShareSettingsForm({
  settings,
  onChange,
  token,
  linkStatus,
  disabled,
  beforeLink,
  linkFirst = false,
}: MatchShareSettingsFormProps) {
  const t = useTranslations("matchShare");
  const uid = useId();
  const enabled = isShareEnabled(settings);
  const levels = allowedDetailLevels(settings.ageGroup);

  return (
    <div className="divide-y divide-fp-rule" data-testid="match-share-form">
      {linkFirst && enabled && token ? (
        <div className="p-4">
          <ShareLink token={token} status={linkStatus} />
        </div>
      ) : null}
      <ShareSwitch
        id={`${uid}-live`}
        label={t("liveToggle")}
        help={t("liveHelp")}
        checked={settings.live}
        disabled={disabled}
        // Turning «Del live» off hides the lineup too (FEAT-SHARE-04).
        onToggle={() => onChange({ ...settings, live: !settings.live, lineup: settings.live ? false : settings.lineup })}
      />
      {settings.live ? (
        <ShareSwitch
          id={`${uid}-lineup`}
          label={t("lineupToggle")}
          help={t("lineupHelp")}
          checked={settings.lineup}
          disabled={disabled}
          nested
          onToggle={() => onChange({ ...settings, lineup: !settings.lineup })}
        />
      ) : null}
      <ShareSwitch
        id={`${uid}-summary`}
        label={t("summaryToggle")}
        help={t("summaryHelp")}
        checked={settings.summary}
        disabled={disabled}
        onToggle={() => onChange({ ...settings, summary: !settings.summary })}
      />

      {enabled ? (
        <div className="space-y-5 p-4">
          <RadioList<ShareAgeGroup>
            legend={t("ageGroup")}
            help={t("ageGroupHelp")}
            name={`${uid}-age`}
            value={settings.ageGroup}
            disabled={disabled}
            options={SHARE_AGE_GROUPS.map((group) => ({ value: group, label: t(`ageGroups.${group}`) }))}
            onChange={(ageGroup) => onChange(withAgeGroup(settings, ageGroup))}
            testId="match-share-age"
          />

          {settings.ageGroup !== "youth" ? (
            <Notice tone="info" announce="off">
              {t("nffGuidance")}
            </Notice>
          ) : null}

          <RadioList<ShareDetailLevel>
            legend={t("detailLevel")}
            name={`${uid}-level`}
            value={settings.detailLevel}
            disabled={disabled}
            options={SHARE_DETAIL_LEVELS.map((level) => ({
              value: level,
              label: t(`levels.${level}`),
              help: levels.includes(level) ? t(`levels.${level}Help`) : t("levels.detailedLocked"),
              locked: !levels.includes(level),
            }))}
            onChange={(detailLevel) => onChange({ ...settings, detailLevel })}
            testId="match-share-level"
          />

          {beforeLink}

          {token && !linkFirst ? <ShareLink token={token} status={linkStatus} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** One switch row; the whole row is the target (as the report switch in setup). */
function ShareSwitch({
  id,
  label,
  help,
  checked,
  disabled,
  nested = false,
  onToggle,
}: {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  disabled?: boolean;
  /** An option under the switch above it, indented. */
  nested?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-help`}
      disabled={disabled}
      onClick={onToggle}
      data-testid={nested ? "match-share-lineup" : undefined}
      className={cn(
        "flex min-h-16 w-full items-center gap-4 p-4 text-left transition-colors duration-(--fp-d-quick) focus-visible:ring-inset focus-visible:ring-offset-0 active:bg-fp-surface-2 disabled:opacity-60",
        nested && "border-l-2 border-l-fp-rule pl-8"
      )}
    >
      <span className="min-w-0 flex-1">
        <span id={`${id}-label`} className="block text-base font-semibold text-fp-ink">
          {label}
        </span>
        <span id={`${id}-help`} className="mt-1 block text-sm text-fp-ink-2">
          {help}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full border border-fp-control-line transition-colors duration-(--fp-d-quick)",
          checked ? "bg-fp-lime" : "bg-fp-surface-2"
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] left-[3px] h-5 w-5 rounded-full transition-transform duration-(--fp-d-base) ease-fp-out",
            checked ? "translate-x-5 bg-fp-on-lime" : "translate-x-0 bg-fp-ink-2"
          )}
        />
      </span>
    </button>
  );
}

interface RadioOption<T extends string> {
  value: T;
  label: string;
  help?: string;
  locked?: boolean;
}

function RadioList<T extends string>({
  legend,
  help,
  name,
  value,
  options,
  disabled,
  onChange,
  testId,
}: {
  legend: string;
  help?: string;
  name: string;
  value: T;
  options: RadioOption<T>[];
  disabled?: boolean;
  onChange: (value: T) => void;
  testId?: string;
}) {
  return (
    <fieldset disabled={disabled} data-testid={testId}>
      <legend className="mb-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-ink-2">{legend}</legend>
      {help ? <p className="mb-2 text-sm text-fp-ink-2">{help}</p> : null}
      <div className="overflow-hidden rounded-[14px] border border-fp-rule">
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5",
                index > 0 && "border-t border-fp-rule",
                selected && "bg-fp-surface-2",
                option.locked && "cursor-not-allowed"
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                disabled={option.locked}
                onChange={() => onChange(option.value)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] peer-focus-visible:ring-2 peer-focus-visible:ring-fp-focus",
                  selected ? "border-fp-lime bg-fp-lime text-fp-on-lime" : "border-fp-control-line"
                )}
              >
                {selected ? <Check size={14} strokeWidth={2.5} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("flex items-center gap-1.5 text-base font-semibold", option.locked ? "text-fp-ink-2" : "text-fp-ink")}>
                  {option.locked ? <Lock aria-hidden size={14} className="shrink-0" /> : null}
                  {option.label}
                </span>
                {option.help ? <span className="mt-0.5 block text-sm text-fp-ink-2">{option.help}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const noSubscription = () => () => {};

function ShareLink({ token, status }: { token: string; status: ShareLinkStatus }) {
  const t = useTranslations("matchShare");
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const path = getPathname({ href: sharePath(token), locale });
  // Known in the browser only; the server renders the path, never a guess.
  const origin = useSyncExternalStore(noSubscription, () => window.location.origin, () => "");
  const canShare = useSyncExternalStore(noSubscription, () => typeof navigator.share === "function", () => false);
  const url = `${origin}${path}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const statusText =
    status === "ready"
      ? t("ready")
      : status === "offline"
        ? t("pendingOffline")
        : status === "pending"
          ? t("pending")
          : status === "unavailable"
            ? t("unavailable")
            : t("failed");

  return (
    <div className="space-y-2" data-testid="match-share-link">
      <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-fp-ink-2">{t("linkLabel")}</p>
      <p className="rounded-[10px] border border-fp-rule bg-fp-surface-2 px-3 py-2.5 font-mono text-[13px] text-fp-ink [overflow-wrap:anywhere]">
        {url}
      </p>
      <p
        role="status"
        className={cn("text-sm", status === "ready" ? "text-fp-ok-text" : status === "pending" ? "text-fp-ink-2" : "text-fp-warn-text")}
        data-testid="match-share-status"
      >
        {statusText}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={copy}>
          <Copy aria-hidden size={16} />
          {copied ? t("copied") : t("copy")}
        </Button>
        {canShare ? (
          <Button
            size="sm"
            onClick={() => {
              void navigator.share({ title: t("shareText"), url }).catch(() => undefined);
            }}
          >
            <Share2 aria-hidden size={16} />
            {t("share")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
