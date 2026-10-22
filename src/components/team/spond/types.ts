// Shared Spond UI types (UI-SPOND-01). They mirror the JSON the
// /api/integrations/spond/* routes return; nothing here talks to the server.

export type SpondResetAction = "delete-imported-data" | "disconnect-and-delete";

export interface SpondGroupOption {
  id: string;
  name: string;
  memberCount: number;
}

export interface SpondEventOption {
  externalId: string;
  title: string;
  startsAt: string | null;
  location: string | null;
  importedMatchId: string | null;
}

export type SpondImportPreviewStatus = "already-imported" | "existing-player" | "new";
export type SpondImportClassification = "likely_player" | "likely_staff" | "unknown";

export interface SpondImportPreviewCandidate {
  externalId: string;
  name: string;
  email: string | null;
  alreadyImported: boolean;
  existingPlayerId: string | null;
  existingPlayerName: string | null;
  status: SpondImportPreviewStatus;
  importClassification: SpondImportClassification;
  recommendedSelected: boolean;
  selectable: boolean;
}

/** Reads `{ errorCode, message }` from an API error body; `unknownMessage` is the localised fallback. */
export function parseApiError(payload: unknown, unknownMessage: string): { code: string; message: string } {
  if (typeof payload !== "object" || payload === null) {
    return { code: "UNKNOWN", message: unknownMessage };
  }

  const value = payload as Record<string, unknown>;

  return {
    code: typeof value.errorCode === "string" ? value.errorCode : "UNKNOWN",
    message: typeof value.message === "string" ? value.message : unknownMessage,
  };
}
