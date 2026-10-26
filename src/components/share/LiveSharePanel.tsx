"use client";

/**
 * FEAT-SHARE-01: «Del kampen» from the live screen's menu, also before the
 * first ▶. It shows the same link and choices as setup and match details:
 * the share kept on this device for this match when there is one (so the
 * link can be copied offline), otherwise the server's. Opening it never makes
 * a link; turning sharing on does (one token, kept on the device and sent
 * like setup's, src/lib/match/matchShareSync.ts). The match itself is never
 * held up by it.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MatchShareSettingsForm } from "@/components/share/MatchShareSettingsForm";
import { linkStatusOf } from "@/components/share/SetupSharePanel";
import { syncStoredMatchShare, type MatchShareSyncResult } from "@/lib/match/matchShareSync";
import { getStoredMatchSetup } from "@/lib/storage/matchStorage";
import {
  MATCH_SHARE_CHANGED_EVENT,
  getStoredMatchShare,
  saveStoredMatchShare,
  type StoredMatchShare,
} from "@/lib/storage/matchShareStorage";
import { fetchOrNull } from "@/lib/utils/fetchOrNull";
import {
  DEFAULT_SHARE_SETTINGS,
  generateShareToken,
  isShareEnabled,
  isShareToken,
  normalizeShareSettings,
  type MatchShareSettings,
} from "@/domain/matchShare";

interface LiveSharePanelProps {
  /** The running match's server id. */
  matchId: string;
  teamId: string;
  ownerUserId: string;
}

function storedFor(matchId: string, ownerUserId: string): StoredMatchShare | null {
  const stored = getStoredMatchShare();
  return stored?.matchId === matchId && stored.ownerUserId === ownerUserId ? stored : null;
}

/** The device keeps one share; another match's may only be replaced once the server has it. */
function slotIsFree(matchId: string): boolean {
  const stored = getStoredMatchShare();
  return !stored || stored.matchId === matchId || stored.syncedRevision >= stored.revision;
}

export function LiveSharePanel({ matchId, teamId, ownerUserId }: LiveSharePanelProps) {
  const t = useTranslations("matchShare");
  const [record, setRecord] = useState<StoredMatchShare | null>(() => storedFor(matchId, ownerUserId));
  const [loaded, setLoaded] = useState(record !== null);
  const [result, setResult] = useState<MatchShareSyncResult | "sending" | null>(null);

  const reload = useCallback(() => setRecord(storedFor(matchId, ownerUserId)), [matchId, ownerUserId]);

  const sync = useCallback(async () => {
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

  // On open: send a change still waiting, or read the server's share (made
  // on match details or another device) and keep it here as the one to show.
  useEffect(() => {
    let cancelled = false;
    const current = storedFor(matchId, ownerUserId);
    if (current) {
      if (current.syncedRevision < current.revision) {
        void syncStoredMatchShare(ownerUserId).then((outcome) => {
          if (cancelled) return;
          setResult(outcome);
          reload();
        });
      }
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const response = await fetchOrNull(`/api/matches/${encodeURIComponent(matchId)}/share`);
      if (cancelled) return;
      if (!response) setResult("offline");
      else if (response.status === 503) setResult("unavailable");
      else if (response.ok) {
        const body = (await response.json().catch(() => null)) as { share?: Record<string, unknown> | null } | null;
        const share = body?.share;
        if (!cancelled && share && isShareToken(share.token) && slotIsFree(matchId)) {
          saveStoredMatchShare({
            matchId,
            teamId,
            ownerUserId,
            token: share.token,
            settings: normalizeShareSettings(share),
            revision: 1,
            syncedRevision: 1,
            matchCreated: true,
            started: true,
            plannedMatch: true,
            kickoffAt: null,
          });
          reload();
        }
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId, teamId, ownerUserId, reload]);

  const handleChange = async (settings: MatchShareSettings) => {
    if (!record && !slotIsFree(matchId)) {
      // Another match's change is still on its way: send it first.
      await syncStoredMatchShare(ownerUserId);
      if (!slotIsFree(matchId)) {
        setResult("offline");
        return;
      }
    }

    const current = storedFor(matchId, ownerUserId);
    const wasEnabled = current ? isShareEnabled(current.settings) : false;
    // Turning sharing on again makes a new link; the old one was turned off.
    const token = current && wasEnabled ? current.token : generateShareToken();
    if (!token) {
      setResult("failed");
      return;
    }

    const setup = getStoredMatchSetup();
    const rowPending = setup?.serverMatchId === matchId && Boolean(setup.serverLink?.pendingCreate);
    const next: StoredMatchShare = current
      ? { ...current, token, settings, revision: current.revision + 1 }
      : {
          matchId,
          teamId,
          ownerUserId,
          token,
          settings,
          revision: 1,
          syncedRevision: 0,
          matchCreated: !rowPending,
          started: true,
          // The match row's own time is used: a planned match's time, and
          // none for a match created at «Start kampen» (see the migration).
          plannedMatch: true,
          kickoffAt: null,
        };

    if (!saveStoredMatchShare(next)) {
      setResult("failed");
      return;
    }
    setRecord(next);
    void sync();
  };

  if (!loaded) return null;

  const settings = record?.settings ?? DEFAULT_SHARE_SETTINGS;
  const enabled = isShareEnabled(settings);

  return (
    <div data-testid="live-share-panel">
      <p className="px-1 pb-2 text-sm text-fp-ink-2">{t("intro")}</p>
      <div className="overflow-hidden rounded-[14px] border border-fp-rule bg-fp-surface">
        <MatchShareSettingsForm
          settings={settings}
          onChange={(next) => void handleChange(next)}
          token={enabled ? record?.token ?? null : null}
          linkStatus={result === "unavailable" ? "unavailable" : linkStatusOf(record, result)}
          disabled={result === "unavailable"}
          linkFirst
        />
        {!enabled && record ? <p className="px-4 pb-4 text-sm text-fp-ink-2">{t("offNotice")}</p> : null}
      </div>
    </div>
  );
}
