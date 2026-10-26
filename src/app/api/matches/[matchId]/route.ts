import { NextResponse, after } from "next/server";
import { jsonError, requireAuthenticatedSupabaseClient } from "@/lib/server/integrations/spond/http";
import { deleteMatch, getMatchById, updateMatchStatus } from "@/lib/server/matches/service";
import { refreshPublicSummary } from "@/lib/server/share/service";
import type { MatchReportStatus, MatchStatus } from "@/lib/server/matches/types";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ matchId: string }> }
) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const { matchId } = await context.params;

    if (!isUuid(matchId)) {
      return NextResponse.json(
        {
          errorCode: "INVALID_MATCH_ID",
          message: "Ugyldig kamp-id.",
        },
        { status: 400 }
      );
    }

    const match = await getMatchById(supabase, userId, matchId);
    return NextResponse.json({ match });
  } catch (error) {
    return jsonError(error);
  }
}

function parsePatchPayload(value: unknown): {
  status?: MatchStatus;
  runtimeState?: Record<string, unknown> | null;
  scoreFor?: number;
  scoreAgainst?: number;
  reportEnabled?: boolean;
  reportStatus?: MatchReportStatus;
  reportText?: string | null;
  endedAt?: string;
  startedAt?: string;
} {
  if (typeof value !== "object" || value === null) {
    throw new Error("INVALID_PAYLOAD");
  }

  const payload = value as Record<string, unknown>;
  const status = payload.status;
  const hasStatus =
    status === "draft" || status === "upcoming" || status === "live" || status === "completed";
  const hasRuntimeState = "runtimeState" in payload;
  const hasScoreFor = "scoreFor" in payload;
  const hasScoreAgainst = "scoreAgainst" in payload;
  const hasReportEnabled = "reportEnabled" in payload;
  const hasReportStatus = "reportStatus" in payload;
  const hasReportText = "reportText" in payload;

  if (!hasStatus && !hasRuntimeState && !hasScoreFor && !hasScoreAgainst && !hasReportEnabled && !hasReportStatus && !hasReportText) {
    throw new Error("INVALID_PAYLOAD");
  }

  if (hasScoreFor && (typeof payload.scoreFor !== "number" || Number.isNaN(payload.scoreFor))) {
    throw new Error("INVALID_PAYLOAD");
  }

  if (hasScoreAgainst && (typeof payload.scoreAgainst !== "number" || Number.isNaN(payload.scoreAgainst))) {
    throw new Error("INVALID_PAYLOAD");
  }

  if (hasReportEnabled && typeof payload.reportEnabled !== "boolean") {
    throw new Error("INVALID_PAYLOAD");
  }

  const reportStatus = payload.reportStatus;
  const validReportStatus =
    reportStatus === "not_requested" || reportStatus === "pending" || reportStatus === "ready" || reportStatus === "failed";

  if (hasReportStatus && !validReportStatus) {
    throw new Error("INVALID_PAYLOAD");
  }

  if (hasReportText && payload.reportText !== null && typeof payload.reportText !== "string") {
    throw new Error("INVALID_PAYLOAD");
  }

  // The device's end time; only read with a status. An unparseable value is
  // not rejected (the completion must still sync); the service falls back.
  const hasEndedAt = "endedAt" in payload;

  if (hasEndedAt && (typeof payload.endedAt !== "string" || payload.endedAt.length > 64)) {
    throw new Error("INVALID_PAYLOAD");
  }

  // The device's start time (a start synced later); only read with a status,
  // and like endedAt an unparseable value falls back to the server's now.
  const hasStartedAt = "startedAt" in payload;

  if (hasStartedAt && (typeof payload.startedAt !== "string" || payload.startedAt.length > 64)) {
    throw new Error("INVALID_PAYLOAD");
  }

  if (hasStatus) {
    return {
      status,
      runtimeState:
        hasRuntimeState && typeof payload.runtimeState === "object"
          ? (payload.runtimeState as Record<string, unknown>)
          : payload.runtimeState === null
            ? null
            : undefined,
      scoreFor: hasScoreFor ? (payload.scoreFor as number) : undefined,
      scoreAgainst: hasScoreAgainst ? (payload.scoreAgainst as number) : undefined,
      reportEnabled: hasReportEnabled ? (payload.reportEnabled as boolean) : undefined,
      reportStatus: hasReportStatus ? (payload.reportStatus as MatchReportStatus) : undefined,
      reportText: hasReportText ? (payload.reportText as string | null) : undefined,
      endedAt: hasEndedAt ? (payload.endedAt as string) : undefined,
      startedAt: hasStartedAt ? (payload.startedAt as string) : undefined,
    };
  }

  if (hasRuntimeState && payload.runtimeState !== null && typeof payload.runtimeState !== "object") {
    throw new Error("INVALID_PAYLOAD");
  }

  return {
    runtimeState: payload.runtimeState === null ? null : (payload.runtimeState as Record<string, unknown>),
    scoreFor: hasScoreFor ? (payload.scoreFor as number) : undefined,
    scoreAgainst: hasScoreAgainst ? (payload.scoreAgainst as number) : undefined,
    reportEnabled: hasReportEnabled ? (payload.reportEnabled as boolean) : undefined,
    reportStatus: hasReportStatus ? (payload.reportStatus as MatchReportStatus) : undefined,
    reportText: hasReportText ? (payload.reportText as string | null) : undefined,
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ matchId: string }> }
) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const { matchId } = await context.params;

    if (!isUuid(matchId)) {
      return NextResponse.json(
        {
          errorCode: "INVALID_MATCH_ID",
          message: "Ugyldig kamp-id.",
        },
        { status: 400 }
      );
    }

    const payload = parsePatchPayload(await request.json());
    const match = await updateMatchStatus(supabase, userId, {
      matchId,
      status: payload.status,
      runtimeState: payload.runtimeState,
      scoreFor: payload.scoreFor,
      scoreAgainst: payload.scoreAgainst,
      reportEnabled: payload.reportEnabled,
      reportStatus: payload.reportStatus,
      reportText: payload.reportText,
      endedAt: payload.endedAt,
      startedAt: payload.startedAt,
    });

    // FEAT-SHARE-01: a shared match's public summary is written once it is
    // completed, and again after a correction of the result, after the
    // response (it stops at once while the stored text matches the data).
    if (match.status === "completed") {
      after(() => refreshPublicSummary(supabase, matchId));
    }

    return NextResponse.json({ match });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_PAYLOAD") {
      return NextResponse.json(
        {
          errorCode: "INVALID_PAYLOAD",
          message: "Ugyldig forespørsel.",
        },
        { status: 400 }
      );
    }

    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ matchId: string }> }
) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const { matchId } = await context.params;

    if (!isUuid(matchId)) {
      return NextResponse.json(
        {
          errorCode: "INVALID_MATCH_ID",
          message: "Ugyldig kamp-id.",
        },
        { status: 400 }
      );
    }

    await deleteMatch(supabase, userId, matchId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
