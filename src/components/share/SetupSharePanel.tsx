"use client";

/**
 * FEAT-SHARE-01: «Del kampen» in match setup. One summary row until opened,
 * like the match card above it. The link is made on the device and saved
 * there first, so it can be copied offline; it is sent when the network
 * allows (src/lib/match/matchShareSync.ts) and never holds up the start.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/primitives";
import { MatchShareSettingsForm, type ShareLinkStatus } from "@/components/share/MatchShareSettingsForm";
import { teamTextInputClassName } from "@/components/team/styles";
import { newServerMatchId } from "@/lib/match/matchServerCreate";
import { syncStoredMatchShare, usableStoredShare, type MatchShareSyncResult } from "@/lib/match/matchShareSync";
import {
  MATCH_SHARE_CHANGED_EVENT,
  saveStoredMatchShare,
  type StoredMatchShare,
} from "@/lib/storage/matchShareStorage";
import { fetchOrNull } from "@/lib/utils/fetchOrNull";
import type { LiveLineupSnapshot } from "@/domain/liveMatch";
import {
  DEFAULT_SHARE_SETTINGS,
  generateShareToken,
  isShareEnabled,
  isShareToken,
  kickoffFromTimeOfDay,
  normalizeShareSettings,
  samePlannedLineup,
  timeOfDayOf,
  type MatchShareSettings,
} from "@/domain/matchShare";

interface SetupSharePanelProps {
  teamId: string;
  /** The signed-in coach; null for a guest (sharing needs an account). */
  ownerUserId: string | null;
  /** The planned match being set up, if any. */
  plannedMatchId: string | null;
  /**
   * FEAT-SHARE-04: the setup's starting positions and bench now. With «Vis
   * lagoppstilling og benk» on it goes with the share, so the link shows it
   * before «Start kampen»; later setup changes follow the same way.
   */
  plannedLineup: LiveLineupSnapshot | null;
}

/** Setup edits come in bursts (auto-fill, drags); one send after they settle. */
const LINEUP_SYNC_DELAY_MS = 600;

/** The link's status line for a share kept on the device (also the live screen's). */
export function linkStatusOf(record: StoredMatchShare | null, result: MatchShareSyncResult | "sending" | null): ShareLinkStatus {
  if (result === "sending") return "pending";
  if (record && record.syncedRevision >= record.revision && record.matchCreated) return "ready";
  if (result === "unavailable") return "unavailable";
  if (result === "failed") return "failed";
  if (result === "offline" || result === "waiting") return "offline";
  return typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "pending";
}

export function SetupSharePanel({ teamId, ownerUserId, plannedMatchId, plannedLineup: lineupNow }: SetupSharePanelProps) {
  const t = useTranslations("matchShare");
  const uid = useId();
  const [open, setOpen] = useState(false);
  const scope = { teamId, ownerUserId, plannedMatchId };
  // Rendered only after hydration (setup waits for it), so reading storage here is safe.
  const [record, setRecord] = useState<StoredMatchShare | null>(() => usableStoredShare(scope));
  const [result, setResult] = useState<MatchShareSyncResult | "sending" | null>(null);
  // The setup hands a new object every render; only a real change counts.
  const lineupKey = lineupNow ? JSON.stringify(lineupNow) : null;
  const plannedLineup = useMemo(() => (lineupKey ? (JSON.parse(lineupKey) as LiveLineupSnapshot) : null), [lineupKey]);

  const reload = useCallback(() => {
    setRecord(usableStoredShare({ teamId, ownerUserId, plannedMatchId }));
  }, [teamId, ownerUserId, plannedMatchId]);

  const sync = useCallback(async () => {
    if (!ownerUserId) return;
    setResult("sending");
    const outcome = await syncStoredMatchShare(ownerUserId);
    setResult(outcome);
    reload();
  }, [ownerUserId, reload]);

  useEffect(() => {
    window.addEventListener(MATCH_SHARE_CHANGED_EVENT, reload);
    window.addEventListener("online", sync);
    return () => {
      window.removeEventListener(MATCH_SHARE_CHANGED_EVENT, reload);
      window.removeEventListener("online", sync);
    };
  }, [reload, sync]);

  // On open: send a change still waiting, or pick up a planned match's share
  // made elsewhere (match details), so the link shown is the server's.
  useEffect(() => {
    if (!ownerUserId) return;
    let cancelled = false;
    const current = usableStoredShare({ teamId, ownerUserId, plannedMatchId });
    if (current && current.syncedRevision < current.revision) {
      void syncStoredMatchShare(ownerUserId).then((outcome) => {
        if (cancelled) return;
        setResult(outcome);
        reload();
      });
      return () => {
        cancelled = true;
      };
    }
    if (current || !plannedMatchId) return;

    void (async () => {
      const response = await fetchOrNull(`/api/matches/${encodeURIComponent(plannedMatchId)}/share`);
      if (cancelled || !response?.ok) return;
      const body = (await response.json().catch(() => null)) as { share?: Record<string, unknown> | null } | null;
      const share = body?.share;
      if (!share || !isShareToken(share.token)) return;
      saveStoredMatchShare({
        matchId: plannedMatchId,
        teamId,
        ownerUserId,
        token: share.token,
        settings: normalizeShareSettings(share),
        revision: 1,
        syncedRevision: 1,
        matchCreated: true,
        started: false,
        plannedMatch: true,
        kickoffAt: null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, ownerUserId, plannedMatchId, reload]);

  // FEAT-SHARE-04: a setup change while the lineup is shared is a share
  // change: saved on the device at once (a new revision), then sent by the
  // same sync, which waits offline and runs again when the network is back.
  // Only the send waits for the burst to settle; leaving the setup before it
  // fires keeps the revision pending for the next sync.
  const lineupRevision = useRef<number | null>(null);
  useEffect(() => {
    if (!ownerUserId || !record?.settings.lineup || !plannedLineup) return;
    if (samePlannedLineup(record.plannedLineup ?? null, plannedLineup)) return;
    const current = usableStoredShare({ teamId, ownerUserId, plannedMatchId });
    if (!current?.settings.lineup || samePlannedLineup(current.plannedLineup ?? null, plannedLineup)) return;
    const next: StoredMatchShare = { ...current, plannedLineup, revision: current.revision + 1 };
    // Saving announces the change, which reloads `record` here.
    if (saveStoredMatchShare(next)) lineupRevision.current = next.revision;
  }, [teamId, ownerUserId, plannedMatchId, plannedLineup, record]);

  const pendingLineupRevision =
    record && record.syncedRevision < record.revision && record.settings.lineup ? record.revision : null;
  useEffect(() => {
    if (pendingLineupRevision === null || lineupRevision.current !== pendingLineupRevision) return;
    const timer = window.setTimeout(() => void sync(), LINEUP_SYNC_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pendingLineupRevision, sync]);

  const handleChange = (settings: MatchShareSettings, kickoffAt: string | null = record?.kickoffAt ?? null) => {
    if (!ownerUserId) return;
    const wasEnabled = record ? isShareEnabled(record.settings) : false;
    // Kept on the device only while the lineup is shared.
    const lineupFor = (next: MatchShareSettings) => (next.lineup ? plannedLineup : null);
    // Turning sharing on again makes a new link; the old one was turned off.
    const token = record && wasEnabled ? record.token : generateShareToken();
    const matchId = record?.matchId ?? plannedMatchId ?? newServerMatchId();
    if (!token || !matchId) {
      setResult("failed");
      return;
    }

    const next: StoredMatchShare = record
      ? { ...record, token, settings, kickoffAt, plannedLineup: lineupFor(settings), revision: record.revision + 1 }
      : {
          matchId,
          teamId,
          ownerUserId,
          token,
          settings,
          revision: 1,
          syncedRevision: 0,
          matchCreated: plannedMatchId !== null,
          started: false,
          plannedMatch: plannedMatchId !== null,
          kickoffAt: plannedMatchId === null ? kickoffAt : null,
          plannedLineup: lineupFor(settings),
        };

    if (!saveStoredMatchShare(next)) {
      setResult("failed");
      return;
    }
    setRecord(next);
    void sync();
  };

  const settings = record?.settings ?? DEFAULT_SHARE_SETTINGS;
  const enabled = isShareEnabled(settings);
  const what = settings.live && settings.summary ? t("compactBoth") : settings.live ? t("compactLive") : t("compactSummary");
  const summary = enabled ? t("compactOn", { what, level: t(`levels.${settings.detailLevel}`) }) : t("compactOff");

  return (
    <section
      aria-labelledby={`${uid}-share`}
      className="overflow-hidden rounded-[14px] border border-fp-rule bg-fp-surface"
      data-testid="setup-share-panel"
    >
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 id={`${uid}-share`} className="text-base font-semibold text-fp-ink">
            {t("title")}
          </h2>
          <p className="mt-0.5 text-sm font-medium text-fp-ink-2">{ownerUserId ? summary : t("signInRequired")}</p>
        </div>
        {ownerUserId ? (
          <Button
            size="sm"
            className="shrink-0"
            aria-expanded={open}
            aria-controls={open ? `${uid}-share-panel` : undefined}
            onClick={() => setOpen((value) => !value)}
          >
            {t("edit")}
          </Button>
        ) : null}
      </div>

      {open && ownerUserId ? (
        <div id={`${uid}-share-panel`} className="border-t border-fp-rule">
          <p className="px-4 pt-4 text-sm text-fp-ink-2">{t("intro")}</p>
          <MatchShareSettingsForm
            settings={settings}
            onChange={handleChange}
            token={enabled ? record?.token ?? null : null}
            linkStatus={linkStatusOf(record, result)}
            beforeLink={
              // A planned match has its own time; a new one may get a kick-off here.
              plannedMatchId === null ? (
                <div className="space-y-1.5">
                  <label htmlFor={`${uid}-kickoff`} className="block text-base font-semibold text-fp-ink">
                    {t("kickoffLabel")}
                  </label>
                  <input
                    id={`${uid}-kickoff`}
                    type="time"
                    value={timeOfDayOf(record?.kickoffAt ?? null)}
                    onChange={(event) => handleChange(settings, kickoffFromTimeOfDay(event.target.value, new Date()))}
                    aria-describedby={`${uid}-kickoff-help`}
                    className={teamTextInputClassName}
                    data-testid="setup-share-kickoff"
                  />
                  <p id={`${uid}-kickoff-help`} className="text-sm text-fp-ink-2">
                    {t("kickoffHelp")}
                  </p>
                </div>
              ) : null
            }
          />
          {!enabled && record ? <p className="px-4 pb-4 text-sm text-fp-ink-2">{t("offNotice")}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
