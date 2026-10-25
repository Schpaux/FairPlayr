"use client";

import { useEffect, useState } from "react";
import { onSpondStatusChanged } from "@/lib/spondStatusEvents";
import type { TeamStorageMode } from "@/lib/teamData/types";

/**
 * Fetches Spond connection status for the active team.
 * Returns `true` if connected, `false` if not, `null` if unknown (loading / guest mode).
 */
export function useSpondStatus(
  teamId: string | null,
  mode: TeamStorageMode
): boolean | null {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (mode !== "cloud" || !teamId) {
      setConnected(null);
      return;
    }

    void (async () => {
      try {
        const response = await fetch(
          `/api/integrations/spond/status?teamId=${encodeURIComponent(teamId)}`,
          { method: "GET" }
        );
        if (!response.ok) return;
        const data = (await response.json()) as { connected?: boolean };
        setConnected(data.connected === true);
      } catch {
        // non-critical — silently ignore
      }
    })();
  }, [teamId, mode]);

  return connected;
}

/**
 * UI-SPOND-01: the Spond connection as one of five states, so a status line
 * never says "not connected" while it is still checking or when the check
 * failed.
 * - `guest`: not signed in to the cloud, or no team: there is nothing to check.
 * - `checking`: the status request for this team is in flight.
 * - `connected` / `disconnected`: the server's answer.
 * - `unavailable`: the request failed (non-ok response, bad body or no network).
 */
export type SpondConnectionState = "checking" | "connected" | "disconnected" | "unavailable" | "guest";

type ResolvedSpondState = Exclude<SpondConnectionState, "checking" | "guest">;

export function useSpondConnection(teamId: string | null, mode: TeamStorageMode): SpondConnectionState {
  // The answer is stored with the team it belongs to, so a team switch reads
  // as "checking" until its own answer arrives (no state reset in the effect).
  const [result, setResult] = useState<{ teamId: string; state: ResolvedSpondState } | null>(null);
  const active = mode === "cloud" && !!teamId;
  // C5-F2: bumped when Settings connects or disconnects this team, so the
  // status is checked again; the last answer stays shown meanwhile.
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!active || !teamId) return;
    return onSpondStatusChanged((changedTeamId) => {
      if (changedTeamId === teamId) setRevision((value) => value + 1);
    });
  }, [active, teamId]);

  useEffect(() => {
    if (!active || !teamId) return;

    let cancelled = false;
    void (async () => {
      let state: ResolvedSpondState;
      try {
        const response = await fetch(`/api/integrations/spond/status?teamId=${encodeURIComponent(teamId)}`, {
          method: "GET",
        });
        if (!response.ok) {
          state = "unavailable";
        } else {
          const data = (await response.json()) as { connected?: boolean };
          state = data.connected === true ? "connected" : "disconnected";
        }
      } catch {
        state = "unavailable";
      }
      if (!cancelled) setResult({ teamId, state });
    })();

    return () => {
      cancelled = true;
    };
  }, [active, teamId, revision]);

  if (!active) return "guest";
  if (!result || result.teamId !== teamId) return "checking";
  return result.state;
}
