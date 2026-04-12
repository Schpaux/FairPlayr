"use client";

import { useEffect, useState } from "react";
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
