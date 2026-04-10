import { NextResponse } from "next/server";
import { jsonError, requireAuthenticatedSupabaseClient } from "@/lib/server/integrations/spond/http";
import { createMatchEvent, getMatchEvents } from "@/lib/server/matches/service";
import type { MatchEventTeamSide, MatchEventType } from "@/lib/server/matches/types";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseType(value: unknown): MatchEventType {
  if (
    value === "goal_for" ||
    value === "goal_against" ||
    value === "substitution" ||
    value === "penalty" ||
    value === "corner" ||
    value === "free_kick" ||
    value === "card_yellow" ||
    value === "card_red" ||
    value === "own_goal" ||
    value === "period_start" ||
    value === "period_end"
  ) {
    return value;
  }

  throw new Error("INVALID_PAYLOAD");
}

function parseTeamSide(value: unknown): MatchEventTeamSide {
  if (value === "own" || value === "opponent" || value === null || value === undefined) {
    return value ?? null;
  }

  throw new Error("INVALID_PAYLOAD");
}

function parsePayload(value: unknown): {
  type: MatchEventType;
  minute: number | null;
  timestampMs: number | null;
  teamSide: MatchEventTeamSide;
  primaryPlayerId: string | null;
  secondaryPlayerId: string | null;
  payload: Record<string, unknown> | null;
} {
  if (typeof value !== "object" || value === null) {
    throw new Error("INVALID_PAYLOAD");
  }

  const payload = value as Record<string, unknown>;
  const type = parseType(payload.type);

  const minute =
    typeof payload.minute === "number" && Number.isFinite(payload.minute)
      ? Math.max(0, Math.floor(payload.minute))
      : null;

  const timestampMs =
    typeof payload.timestampMs === "number" && Number.isFinite(payload.timestampMs)
      ? Math.max(0, Math.floor(payload.timestampMs))
      : null;

  const primaryPlayerId = typeof payload.primaryPlayerId === "string" && payload.primaryPlayerId ? payload.primaryPlayerId : null;
  const secondaryPlayerId = typeof payload.secondaryPlayerId === "string" && payload.secondaryPlayerId ? payload.secondaryPlayerId : null;
  const extraPayload = payload.payload;

  if (extraPayload !== undefined && extraPayload !== null && typeof extraPayload !== "object") {
    throw new Error("INVALID_PAYLOAD");
  }

  return {
    type,
    minute,
    timestampMs,
    teamSide: parseTeamSide(payload.teamSide),
    primaryPlayerId,
    secondaryPlayerId,
    payload: (extraPayload as Record<string, unknown> | null | undefined) ?? null,
  };
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

    const events = await getMatchEvents(supabase, userId, matchId);
    return NextResponse.json({ events });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
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

    const payload = parsePayload(await request.json());

    const event = await createMatchEvent(supabase, userId, {
      matchId,
      type: payload.type,
      minute: payload.minute,
      timestampMs: payload.timestampMs,
      teamSide: payload.teamSide,
      primaryPlayerId: payload.primaryPlayerId,
      secondaryPlayerId: payload.secondaryPlayerId,
      payload: payload.payload,
    });

    return NextResponse.json({ event }, { status: 201 });
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
