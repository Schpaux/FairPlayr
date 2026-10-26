import { NextResponse, after } from "next/server";
import { jsonError, requireAuthenticatedSupabaseClient } from "@/lib/server/integrations/spond/http";
import { deleteMatchEvent, updateMatchEvent } from "@/lib/server/matches/service";
import { refreshPublicSummary } from "@/lib/server/share/service";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parsePatchPayload(value: unknown): {
  minute?: number | null;
  timestampMs?: number | null;
  primaryPlayerId?: string | null;
  secondaryPlayerId?: string | null;
  payload?: Record<string, unknown> | null;
} {
  if (typeof value !== "object" || value === null) {
    throw new Error("INVALID_PAYLOAD");
  }

  const payload = value as Record<string, unknown>;
  const hasMinute = "minute" in payload;
  const hasTimestampMs = "timestampMs" in payload;
  const hasPrimaryPlayerId = "primaryPlayerId" in payload;
  const hasSecondaryPlayerId = "secondaryPlayerId" in payload;
  const hasPayload = "payload" in payload;

  if (!hasMinute && !hasTimestampMs && !hasPrimaryPlayerId && !hasSecondaryPlayerId && !hasPayload) {
    throw new Error("INVALID_PAYLOAD");
  }

  if (hasMinute && payload.minute !== null && (typeof payload.minute !== "number" || Number.isNaN(payload.minute))) {
    throw new Error("INVALID_PAYLOAD");
  }

  if (
    hasTimestampMs &&
    payload.timestampMs !== null &&
    (typeof payload.timestampMs !== "number" || Number.isNaN(payload.timestampMs))
  ) {
    throw new Error("INVALID_PAYLOAD");
  }

  if (hasPrimaryPlayerId && payload.primaryPlayerId !== null && typeof payload.primaryPlayerId !== "string") {
    throw new Error("INVALID_PAYLOAD");
  }

  if (hasSecondaryPlayerId && payload.secondaryPlayerId !== null && typeof payload.secondaryPlayerId !== "string") {
    throw new Error("INVALID_PAYLOAD");
  }

  if (hasPayload && payload.payload !== null && typeof payload.payload !== "object") {
    throw new Error("INVALID_PAYLOAD");
  }

  return {
    minute: hasMinute ? (payload.minute as number | null) : undefined,
    timestampMs: hasTimestampMs ? (payload.timestampMs as number | null) : undefined,
    primaryPlayerId: hasPrimaryPlayerId ? (payload.primaryPlayerId as string | null) : undefined,
    secondaryPlayerId: hasSecondaryPlayerId ? (payload.secondaryPlayerId as string | null) : undefined,
    payload: hasPayload ? (payload.payload as Record<string, unknown> | null) : undefined,
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ matchId: string; eventId: string }> }
) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const { matchId, eventId } = await context.params;

    if (!isUuid(matchId) || !isUuid(eventId)) {
      return NextResponse.json(
        {
          errorCode: "INVALID_ID",
          message: "Ugyldig id.",
        },
        { status: 400 }
      );
    }

    const payload = parsePatchPayload(await request.json());
    const event = await updateMatchEvent(supabase, userId, {
      eventId,
      minute: payload.minute,
      timestampMs: payload.timestampMs,
      primaryPlayerId: payload.primaryPlayerId,
      secondaryPlayerId: payload.secondaryPlayerId,
      payload: payload.payload,
    });

    // FEAT-SHARE-01: a corrected goal rewrites a shared match's public summary.
    after(() => refreshPublicSummary(supabase, matchId));

    return NextResponse.json({ event });
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
  context: { params: Promise<{ matchId: string; eventId: string }> }
) {
  try {
    const { supabase, userId } = await requireAuthenticatedSupabaseClient();
    const { matchId, eventId } = await context.params;

    if (!isUuid(matchId) || !isUuid(eventId)) {
      return NextResponse.json(
        {
          errorCode: "INVALID_ID",
          message: "Ugyldig id.",
        },
        { status: 400 }
      );
    }

    await deleteMatchEvent(supabase, userId, eventId);
    after(() => refreshPublicSummary(supabase, matchId));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
