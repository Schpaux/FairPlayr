"use client";

/**
 * FEAT-SHARE-01: «Del kampen» on match details, for changing the level or
 * turning sharing off during and after the match. It talks to the server
 * directly (the share lives there once made); turning both switches off
 * deletes the share, so the old link stops working at once.
 */

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { MatchShareSettingsForm, type ShareLinkStatus } from "@/components/share/MatchShareSettingsForm";
import { getStoredMatchShare, updateStoredMatchShare } from "@/lib/storage/matchShareStorage";
import { fetchOrNull } from "@/lib/utils/fetchOrNull";
import {
  DEFAULT_SHARE_SETTINGS,
  isShareEnabled,
  isShareToken,
  normalizeShareSettings,
  type MatchShareSettings,
} from "@/domain/matchShare";

interface ServerShare {
  token: string;
  settings: MatchShareSettings;
}

function parseShare(value: unknown): ServerShare | null {
  if (typeof value !== "object" || value === null) return null;
  const share = value as Record<string, unknown>;
  if (!isShareToken(share.token)) return null;
  return { token: share.token, settings: normalizeShareSettings(share) };
}

export function MatchDetailsSharePanel({ matchId }: { matchId: string }) {
  const t = useTranslations("matchShare");
  const uid = useId();
  const [loaded, setLoaded] = useState(false);
  const [share, setShare] = useState<ServerShare | null>(null);
  const [settings, setSettings] = useState<MatchShareSettings>(DEFAULT_SHARE_SETTINGS);
  const [status, setStatus] = useState<ShareLinkStatus>("ready");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetchOrNull(`/api/matches/${encodeURIComponent(matchId)}/share`);
      if (cancelled) return;
      if (response?.status === 503) setStatus("unavailable");
      else if (!response) setStatus("offline");
      else if (!response.ok) setStatus("failed");
      if (response?.ok) {
        const body = (await response.json().catch(() => null)) as { share?: unknown } | null;
        if (cancelled) return;
        const next = parseShare(body?.share);
        setShare(next);
        setSettings(next?.settings ?? DEFAULT_SHARE_SETTINGS);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const handleChange = async (next: MatchShareSettings) => {
    setSettings(next);
    setSaving(true);
    setStatus("pending");
    const response = await fetchOrNull(`/api/matches/${encodeURIComponent(matchId)}/share`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    setSaving(false);

    if (!response) {
      setStatus("offline");
      return;
    }
    if (!response.ok) {
      setStatus(response.status === 503 ? "unavailable" : "failed");
      return;
    }

    const body = (await response.json().catch(() => null)) as { share?: unknown } | null;
    const saved = parseShare(body?.share);
    setShare(saved);
    setSettings(saved?.settings ?? next);
    setStatus("ready");

    // A change here wins over an older one this device still has to send.
    const stored = getStoredMatchShare();
    if (stored?.matchId === matchId) {
      updateStoredMatchShare(matchId, (current) => ({
        ...current,
        token: saved?.token ?? current.token,
        settings: saved?.settings ?? next,
        syncedRevision: current.revision,
      }));
    }
  };

  if (!loaded) return null;

  const enabled = isShareEnabled(settings);

  return (
    <section
      aria-labelledby={`${uid}-share`}
      className="overflow-hidden rounded-[14px] border border-fp-rule bg-fp-surface"
      data-testid="details-share-panel"
    >
      <div className="p-4 pb-0">
        <h2 id={`${uid}-share`} className="text-base font-semibold text-fp-ink">
          {t("title")}
        </h2>
        <p className="mt-0.5 text-sm text-fp-ink-2">{t("intro")}</p>
      </div>
      <MatchShareSettingsForm
        settings={settings}
        onChange={(next) => void handleChange(next)}
        token={enabled ? share?.token ?? null : null}
        linkStatus={status}
        disabled={saving || status === "unavailable"}
      />
      {status === "unavailable" ? <p className="px-4 pb-4 text-sm text-fp-warn-text">{t("unavailable")}</p> : null}
      {status === "offline" ? <p className="px-4 pb-4 text-sm text-fp-warn-text">{t("detailsOffline")}</p> : null}
      {!enabled && status === "ready" ? <p className="px-4 pb-4 text-sm text-fp-ink-2">{t("offNotice")}</p> : null}
    </section>
  );
}
