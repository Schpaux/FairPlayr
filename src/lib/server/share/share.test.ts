// @vitest-environment node
// FEAT-SHARE-01: the coach's share (same link while it changes, revocation)
// and the public summary (only what the level shows, factual fallback).
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/ai/service", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/server/ai/match-summary", () => ({ generateMatchSummaryByMatchId: vi.fn() }));

import { sanitizePublicMatchShare, type PublicMatchShare } from "@/domain/matchShare";

const { RESULT_LEVEL_RULE, alignGoalPlayerIds, buildPublicSummaryPrompt, forbiddenNamesFor, generatePublicSummary, mentionsAnyName, statesResult } = await import(
  "@/lib/server/share/publicSummary"
);
const { createPseudonymizer } = await import("@/lib/server/ai/match-summary/pseudonymize");
const { getPublicMatchShare, refreshPublicSummary, saveMatchShare } = await import("@/lib/server/share/service");
const { generateText } = await import("@/lib/server/ai/service");

const MATCH_ID = "11111111-1111-4111-8111-111111111111";
const TEAM_ID = "22222222-2222-4222-8222-222222222222";
const DEVICE_TOKEN = "D".repeat(43);

type Row = Record<string, unknown>;

/**
 * In-memory Supabase with what the share service uses: the match read
 * (getMatchById + membership), and match_shares with `match_id` as key.
 */
function fakeSupabase(tables: Record<string, Row[]>, rpc?: (fn: string, args: Row) => unknown) {
  const from = (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let op: { kind: "select" } | { kind: "insert"; row: Row } | { kind: "update"; patch: Row } | { kind: "delete" } = {
      kind: "select",
    };
    const rows = () => (tables[table] ??= []);
    const run = (single: boolean) => {
      if (op.kind === "insert") {
        const row = op.row;
        if (rows().some((existing) => existing.match_id === row.match_id || existing.token === row.token)) {
          return { data: null, error: { code: "23505", message: "duplicate key value" } };
        }
        rows().push({ public_summary_text: null, public_summary_level: null, ...row });
        return { data: { ...rows()[rows().length - 1] }, error: null };
      }
      const matching = rows().filter((row) => filters.every((f) => f(row)));
      if (op.kind === "update") {
        matching.forEach((row) => Object.assign(row, (op as { patch: Row }).patch));
      }
      if (op.kind === "delete") {
        tables[table] = rows().filter((row) => !matching.includes(row));
        return { data: null, error: null };
      }
      return { data: single ? (matching[0] ? { ...matching[0] } : null) : matching, error: null };
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (row: Row) => ((op = { kind: "insert", row }), builder),
      update: (patch: Row) => ((op = { kind: "update", patch }), builder),
      delete: () => ((op = { kind: "delete" }), builder),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
      in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), builder),
      is: (column: string, value: null) => (filters.push((row) => (row[column] ?? null) === value), builder),
      not: (column: string, _op: "is", value: null) => (filters.push((row) => (row[column] ?? null) !== value), builder),
      // Only the shapes the service uses: "col.is.null" and 'col.lt."<time>"', any of them.
      or: (expression: string) => {
        const parts = expression.split(",").map((part) => {
          const [column, operator, ...rest] = part.split(".");
          const value = rest.join(".").replace(/^"|"$/g, "");
          return (row: Row) =>
            operator === "is"
              ? (row[column] ?? null) === null
              : row[column] != null && Date.parse(String(row[column])) < Date.parse(value);
        });
        filters.push((row) => parts.some((test) => test(row)));
        return builder;
      },
      maybeSingle: () => Promise.resolve(run(true)),
      single: () => Promise.resolve(run(true)),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(run(false)).then(resolve),
    };
    return builder;
  };
  return {
    from,
    rpc: (fn: string, args: Row) => Promise.resolve({ data: rpc ? rpc(fn, args) : null, error: null }),
  } as never;
}

function matchTables(status = "live") {
  return {
    matches: [
      { id: MATCH_ID, team_id: TEAM_ID, title: "Kamp", status, starts_at: "2026-10-26T10:00:00Z", created_at: "", updated_at: "" },
    ] as Row[],
    team_members: [{ team_id: TEAM_ID, user_id: "coach" }],
    external_event_links: [],
    match_shares: [] as Row[],
  };
}

describe("saveMatchShare", () => {
  it("keeps the same link while the level and switches change", async () => {
    const tables = matchTables();
    const supabase = fakeSupabase(tables);

    const first = await saveMatchShare(supabase, "coach", MATCH_ID, { live: true, token: DEVICE_TOKEN });
    expect(first.share?.token).toBe(DEVICE_TOKEN);
    expect(first.share?.detailLevel).toBe("status");

    const second = await saveMatchShare(supabase, "coach", MATCH_ID, {
      live: true,
      summary: true,
      detailLevel: "result",
      token: "E".repeat(43),
    });
    expect(second.share?.token).toBe(DEVICE_TOKEN);
    expect(tables.match_shares).toHaveLength(1);
    expect(tables.match_shares[0]).toMatchObject({ share_summary: true, detail_level: "result" });
  });

  it("a new match's own kick-off is stored on the share and is the planned match's time too; leaving it out keeps it", async () => {
    const tables = matchTables("upcoming");
    const supabase = fakeSupabase(tables);

    await saveMatchShare(supabase, "coach", MATCH_ID, { live: true, token: DEVICE_TOKEN, kickoffAt: null });
    expect(tables.match_shares[0]).toMatchObject({ kickoff_from_match: false, kickoff_at: null });

    await saveMatchShare(supabase, "coach", MATCH_ID, { live: true, kickoffAt: "2026-10-26T17:30:00Z" });
    expect(tables.match_shares[0]).toMatchObject({ kickoff_from_match: false, kickoff_at: "2026-10-26T17:30:00.000Z" });

    // The match list shows the same kick-off as the public page.
    expect(tables.matches[0].starts_at).toBe("2026-10-26T17:30:00.000Z");

    // Match details never send one: the share keeps what it has.
    await saveMatchShare(supabase, "coach", MATCH_ID, { live: true, summary: true });
    expect(tables.match_shares[0]).toMatchObject({ kickoff_from_match: false, kickoff_at: "2026-10-26T17:30:00.000Z" });
  });

  it("a started match keeps its time: a late kick-off change only reaches the share", async () => {
    const tables = matchTables("live");
    Object.assign(tables.matches[0], { started_at: "2026-10-26T10:02:00Z" });
    await saveMatchShare(fakeSupabase(tables), "coach", MATCH_ID, { live: true, kickoffAt: "2026-10-26T17:30:00Z" });
    expect(tables.matches[0]).toMatchObject({ starts_at: "2026-10-26T10:00:00Z", started_at: "2026-10-26T10:02:00Z" });
  });

  it("a discarded setup's placeholder is kept but marked discarded; a started match never is", async () => {
    const planned = matchTables("upcoming");
    await saveMatchShare(fakeSupabase(planned), "coach", MATCH_ID, { live: true, token: DEVICE_TOKEN });
    await saveMatchShare(fakeSupabase(planned), "coach", MATCH_ID, { live: false, summary: false, discardPlaceholder: true });
    expect(planned.match_shares).toHaveLength(0);
    expect(planned.matches).toHaveLength(1);
    expect(planned.matches[0].discarded_at).toEqual(expect.any(String));

    const turnedOff = matchTables("upcoming");
    await saveMatchShare(fakeSupabase(turnedOff), "coach", MATCH_ID, { live: false, summary: false });
    expect(turnedOff.matches[0].discarded_at).toBeUndefined();

    const running = matchTables("live");
    await saveMatchShare(fakeSupabase(running), "coach", MATCH_ID, { live: false, summary: false, discardPlaceholder: true });
    expect(running.matches[0].discarded_at).toBeUndefined();
  });

  it("a share made from a planned match sends no kick-off, so it uses the match's own time", async () => {
    const tables = matchTables("upcoming");
    await saveMatchShare(fakeSupabase(tables), "coach", MATCH_ID, { live: true, token: DEVICE_TOKEN });
    expect(tables.match_shares[0]).not.toHaveProperty("kickoff_from_match");
    expect(tables.match_shares[0]).not.toHaveProperty("kickoff_at");
  });

  it("refuses names for children and unknown age on the server too", async () => {
    const tables = matchTables();
    const { share } = await saveMatchShare(fakeSupabase(tables), "coach", MATCH_ID, {
      live: true,
      detailLevel: "detailed",
      ageGroup: "child",
    });
    expect(share?.detailLevel).toBe("result");
    expect(tables.match_shares[0].detail_level).toBe("result");
  });

  it("turning both off deletes the share, so the old link stops working", async () => {
    const tables = matchTables();
    const supabase = fakeSupabase(tables, (_fn, args) =>
      tables.match_shares.some((row) => row.token === args.p_token)
        ? { phase: "live", teamName: "Lyn", startsAt: "2026-10-26T10:00:00Z", shareLive: true, shareSummary: false, detailLevel: "status" }
        : null
    );
    await saveMatchShare(supabase, "coach", MATCH_ID, { live: true, token: DEVICE_TOKEN });
    expect(await getPublicMatchShare(supabase, DEVICE_TOKEN)).not.toBeNull();

    const off = await saveMatchShare(supabase, "coach", MATCH_ID, { live: false, summary: false });
    expect(off.share).toBeNull();
    expect(tables.match_shares).toHaveLength(0);
    expect(await getPublicMatchShare(supabase, DEVICE_TOKEN)).toBeNull();

    // On again: a new link, never the old one.
    const again = await saveMatchShare(supabase, "coach", MATCH_ID, { live: true });
    expect(again.share?.token).not.toBe(DEVICE_TOKEN);
  });

  it("checks the public summary only for a completed match with «Del oppsummering»", async () => {
    expect((await saveMatchShare(fakeSupabase(matchTables("live")), "coach", MATCH_ID, { summary: true })).summaryNeeded).toBe(false);
    expect((await saveMatchShare(fakeSupabase(matchTables("completed")), "coach", MATCH_ID, { live: true })).summaryNeeded).toBe(false);
    expect((await saveMatchShare(fakeSupabase(matchTables("completed")), "coach", MATCH_ID, { summary: true })).summaryNeeded).toBe(true);
  });

  it("a malformed token is never sent to the database", async () => {
    const rpc = vi.fn();
    expect(await getPublicMatchShare(fakeSupabase({}, rpc), "not-a-token")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

function completedView(detailLevel: "status" | "result" | "detailed"): PublicMatchShare {
  return sanitizePublicMatchShare({
    phase: "completed",
    teamName: "Lyn G14",
    opponentName: "Byåsen",
    startsAt: "2026-10-26T10:00:00Z",
    shareLive: false,
    shareSummary: true,
    detailLevel,
    goals: [
      { minute: 4, side: "own", scorer: "Frida Hansen", assist: "Ida" },
      { minute: 30, side: "opponent" },
      { minute: 41, side: "own", scorer: "Frida Hansen" },
    ],
    summary: { status: "pending" },
  })!;
}

const SQUAD = ["Frida Hansen", "Ida", "Thea Berg"];

describe("public summary", () => {
  it("match status never asks the AI and says only that the match was played", async () => {
    const generateTextFn = vi.fn();
    const result = await generatePublicSummary(completedView("status"), { squadNames: SQUAD, generateTextFn });
    expect(generateTextFn).not.toHaveBeenCalled();
    expect(result).toEqual({ text: "Kampen mellom Lyn G14 og Byåsen er ferdigspilt.", source: "factual" });
  });

  it("without names: the prompt has no names, and a text that names a child is not used", async () => {
    const generateTextFn = vi
      .fn()
      .mockResolvedValue({ text: "Seier for Lyn\n\nLyn vant 2–1 mot Byåsen etter to mål av Frida. Det var en jevn kamp." });
    const result = await generatePublicSummary(completedView("result"), { squadNames: SQUAD, generateTextFn });

    const prompts = generateTextFn.mock.calls.map(([input]) => JSON.stringify(input));
    for (const prompt of prompts) expect(prompt).not.toMatch(/Frida|Ida|Thea/);
    expect(result.source).toBe("factual");
    expect(result.text).toBe("Lyn G14 vant 2–1 mot Byåsen.");
  });

  it("uses an AI text that states the result and names nobody it should not", async () => {
    const text = "Seier for Lyn\n\nLyn G14 vant 2–1 mot Byåsen. Lyn tok ledelsen tidlig og avgjorde i andre omgang.";
    const generateTextFn = vi.fn().mockResolvedValue({ text });
    expect(await generatePublicSummary(completedView("result"), { squadNames: SQUAD, generateTextFn })).toEqual({ text, source: "ai" });
  });

  it("an AI text with the wrong result falls back to the facts", async () => {
    const generateTextFn = vi.fn().mockResolvedValue({ text: "Lyn vant\n\nLyn G14 vant 3–1 mot Byåsen i en fin kamp på hjemmebane." });
    expect((await generatePublicSummary(completedView("result"), { squadNames: SQUAD, generateTextFn })).source).toBe("factual");
  });

  it("detailed: scorers may be named, other players may not", () => {
    const forbidden = forbiddenNamesFor(completedView("detailed"), SQUAD);
    expect(mentionsAnyName("Frida Hansen scoret to.", forbidden)).toBe(false);
    expect(mentionsAnyName("Thea var god.", forbidden)).toBe(true);
  });

  // FEAT-SHARE-02: pseudonymised model data per level.
  const predictable = () => {
    let calls = 0;
    return createPseudonymizer(() => Math.floor(calls++ / 4));
  };
  const reply = (text: string) => ({ text, model: "stub", location: "stub", project: "stub" });

  it("without names: no player codes, names, teams or date in the model data, and a code in the text is refused", async () => {
    const view = completedView("result");
    const { prompt, systemInstruction, allowedCodes } = buildPublicSummaryPrompt(view, predictable());
    expect(allowedCodes.size).toBe(0);
    expect(`${systemInstruction}\n${prompt}`).not.toMatch(/SPILLER_[A-Z0-9]{4}|Frida|Ida|Lyn G14|Byåsen|2026|søndag/);
    expect(prompt).toContain('"stilling_etter": "2–1"');

    const withCode = "Seier for [LAG]\n\n[LAG] vant 2–1 mot [MOTSTANDER] etter mål av SPILLER_AAAA. [MOTSTANDER] utlignet underveis.";
    const generateTextFn = vi.fn().mockResolvedValue(reply(withCode));
    const result = await generatePublicSummary(view, { squadNames: SQUAD, generateTextFn, pseudonymizer: predictable() });
    expect(result.source).toBe("factual");
  });

  it("detailed: only scorer and assist codes are sent, and they come back as names", async () => {
    const view = completedView("detailed");
    const { prompt, allowedCodes } = buildPublicSummaryPrompt(view, predictable());
    // The public answer has no player ids: each mention gets its own code, never merged by name.
    expect([...allowedCodes].sort()).toEqual(["SPILLER_AAAA", "SPILLER_BBBB", "SPILLER_CCCC"]);
    expect(prompt).not.toMatch(/Frida|Ida|Thea|Lyn G14|Byåsen/);

    const text = [
      "[LAG] vant 2–1 mot [MOTSTANDER]",
      "",
      "SPILLER_AAAA ga [LAG] ledelsen etter 4 minutter, etter pasning fra SPILLER_BBBB. [MOTSTANDER] utlignet til 1–1 etter 30 minutter, før SPILLER_CCCC avgjorde med 2–1 etter 41 minutter.",
    ].join("\n");
    const generateTextFn = vi.fn().mockResolvedValue(reply(text));
    const result = await generatePublicSummary(view, { squadNames: SQUAD, generateTextFn, pseudonymizer: predictable() });
    expect(result.source).toBe("ai");
    expect(result.text).toContain("Frida Hansen ga Lyn G14 ledelsen etter 4 minutter, etter pasning fra Ida.");
    expect(result.text).toContain("Byåsen utlignet til 1–1");
  });

  it("detailed: a code that was not handed out is refused", async () => {
    const text = "Seier for [LAG]\n\n[LAG] vant 2–1 mot [MOTSTANDER]. SPILLER_DDDD var også med og scoret ikke, men laget vant.";
    const generateTextFn = vi.fn().mockResolvedValue(reply(text));
    expect(
      (await generatePublicSummary(completedView("detailed"), { squadNames: SQUAD, generateTextFn, pseudonymizer: predictable() })).source
    ).toBe("factual");
  });

  it("an incomplete public timeline sends the final score only, no order", () => {
    const view = sanitizePublicMatchShare({
      ...completedView("result"),
      score: { for: 3, against: 1 },
      summary: { status: "pending" },
    })!;
    const { prompt } = buildPublicSummaryPrompt(view, predictable());
    expect(prompt).toContain('"tidslinje": "ufullstendig"');
    expect(prompt).toContain('"tekst": "3–1"');
    expect(prompt).not.toContain("stilling_etter");
  });

  it("incomplete and detailed: shows the goals without a recorded scorer", () => {
    const view = sanitizePublicMatchShare({ ...completedView("detailed"), score: { for: 4, against: 1 }, summary: { status: "pending" } })!;
    const { prompt, systemInstruction } = buildPublicSummaryPrompt(view, predictable());
    expect(prompt).toContain('"egne_mål_uten_registrert_målscorer": 2');
    expect(systemInstruction).toContain("Blant de registrerte målscorerne");
    expect(buildPublicSummaryPrompt(completedView("result"), predictable()).prompt).not.toContain("uten_registrert");
    expect(systemInstruction).not.toContain(RESULT_LEVEL_RULE);
  });

  it("AI-QA-02: the result level asks for no comment on missing scorers and gives no scorer rules", () => {
    const view = sanitizePublicMatchShare({ ...completedView("result"), score: { for: 4, against: 1 }, summary: { status: "pending" } })!;
    const { systemInstruction } = buildPublicSummaryPrompt(view, predictable());
    expect(systemInstruction).toContain(RESULT_LEVEL_RULE);
    expect(systemInstruction).not.toContain("Blant de registrerte målscorerne");
    expect(systemInstruction).not.toContain("Nevn målscorerne samlet");
  });

  it("checks names as whole words and results in common spellings", () => {
    expect(mentionsAnyName("Idar spilte", ["Ida"])).toBe(false);
    expect(mentionsAnyName("Mål av IDA.", ["Ida"])).toBe(true);
    expect(statesResult("vant 2-1", { for: 2, against: 1 })).toBe(true);
    expect(statesResult("vant 12–1", { for: 2, against: 1 })).toBe(false);
  });
});

// ─── Public summary: tied to the data it was written from ─────────────────────

/** get_public_match_share over the fake tables: the match's own score, the stored summary with its basis. */
function publicAnswerFrom(tables: ReturnType<typeof matchTables>) {
  return (_fn: string, args: Row) => {
    const share = tables.match_shares.find((row) => row.token === args.p_token);
    const match = tables.matches[0] as Row;
    if (!share) return null;
    return {
      phase: match.status === "completed" ? "completed" : match.status === "live" ? "live" : "upcoming",
      teamName: "Lyn G14",
      opponentName: "Byåsen",
      startsAt: match.starts_at,
      shareLive: share.share_live,
      shareSummary: share.share_summary,
      detailLevel: share.detail_level,
      score: { for: match.score_for ?? 0, against: match.score_against ?? 0 },
      goals: [],
      summary:
        share.public_summary_text !== null && share.public_summary_level === share.detail_level
          ? {
              status: "ready",
              text: share.public_summary_text,
              generatedAt: share.public_summary_generated_at,
              basis: share.public_summary_basis,
            }
          : { status: "pending", text: null, generatedAt: null, basis: null },
    };
  };
}

async function sharedCompletedMatch(score: [number, number]) {
  const tables = matchTables("completed");
  Object.assign(tables.matches[0], { score_for: score[0], score_against: score[1] });
  const supabase = fakeSupabase(tables, publicAnswerFrom(tables));
  await saveMatchShare(supabase, "coach", MATCH_ID, { summary: true, detailLevel: "result", token: DEVICE_TOKEN });
  return { tables, supabase };
}

const aiText = (text: string) => vi.mocked(generateText).mockResolvedValue({ text } as never);

describe("public summary: only from the current data", () => {
  it("states the match's own result, and a stored text matching the data is not written again", async () => {
    // Goal events missing (an older match): the result is still 3–1.
    const { tables, supabase } = await sharedCompletedMatch([3, 1]);
    aiText("Seier for [LAG]\n\n[LAG] vant 3–1 mot [MOTSTANDER], og det ble sluttresultatet i kampen.");

    await refreshPublicSummary(supabase, MATCH_ID);
    expect(tables.match_shares[0].public_summary_text).toContain("3–1");
    const view = await getPublicMatchShare(supabase, DEVICE_TOKEN);
    expect(view?.score).toEqual({ for: 3, against: 1 });
    expect(view?.summary?.status).toBe("ready");

    vi.mocked(generateText).mockClear();
    await refreshPublicSummary(supabase, MATCH_ID);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("a corrected result hides the old text at once and writes a new one", async () => {
    const { tables, supabase } = await sharedCompletedMatch([3, 1]);
    aiText("Seier for [LAG]\n\n[LAG] vant 3–1 mot [MOTSTANDER], og det ble sluttresultatet i kampen.");
    await refreshPublicSummary(supabase, MATCH_ID);

    Object.assign(tables.matches[0], { score_for: 2 });
    expect((await getPublicMatchShare(supabase, DEVICE_TOKEN))?.summary).toEqual({ status: "pending", text: null, generatedAt: null });

    aiText("Seier for [LAG]\n\n[LAG] vant 2–1 mot [MOTSTANDER], og det ble sluttresultatet i kampen.");
    await refreshPublicSummary(supabase, MATCH_ID);
    const view = await getPublicMatchShare(supabase, DEVICE_TOKEN);
    expect(view?.summary?.status).toBe("ready");
    expect(view?.summary?.text).toContain("2–1");
  });

  it("a text written while the result was corrected is dropped, never stored as current", async () => {
    const { tables, supabase } = await sharedCompletedMatch([3, 1]);
    vi.mocked(generateText).mockImplementation(async () => {
      Object.assign(tables.matches[0], { score_for: 2 }); // corrected meanwhile
      return { text: "Seier for [LAG]\n\n[LAG] vant 3–1 mot [MOTSTANDER], og det ble sluttresultatet i kampen." } as never;
    });

    await refreshPublicSummary(supabase, MATCH_ID);
    expect(tables.match_shares[0].public_summary_text).toBeNull();
  });

  it("a slow text never fills a re-made share (new link) or overwrites a newer text", async () => {
    const remade = await sharedCompletedMatch([3, 1]);
    vi.mocked(generateText).mockImplementation(async () => {
      // Turned off and on again meanwhile: a new row with a new token.
      remade.tables.match_shares[0].token = "N".repeat(43);
      return { text: "Seier for [LAG]\n\n[LAG] vant 3–1 mot [MOTSTANDER], og det ble sluttresultatet i kampen." } as never;
    });
    await refreshPublicSummary(remade.supabase, MATCH_ID);
    expect(remade.tables.match_shares[0].public_summary_text).toBeNull();

    const raced = await sharedCompletedMatch([3, 1]);
    vi.mocked(generateText).mockImplementation(async () => {
      // A run that started later stored its text first.
      Object.assign(raced.tables.match_shares[0], {
        public_summary_text: "Nyere tekst 3–1",
        public_summary_level: "result",
        public_summary_generated_at: new Date(Date.now() + 60_000).toISOString(),
      });
      return { text: "Seier for [LAG]\n\n[LAG] vant 3–1 mot [MOTSTANDER], og det ble sluttresultatet i kampen." } as never;
    });
    await refreshPublicSummary(raced.supabase, MATCH_ID);
    expect(raced.tables.match_shares[0].public_summary_text).toBe("Nyere tekst 3–1");
  });
});

// ─── AI-ID-01: player ids from the goal events, on the server only ───────────

const FRIDA = "aaaaaaaa-0000-4000-8000-000000000001";
const IDA = "aaaaaaaa-0000-4000-8000-000000000002";
const FRIDA_TWO = "aaaaaaaa-0000-4000-8000-000000000003";

/** The goal events behind completedView's goals, stored out of order. */
function goalEvents(): Row[] {
  return [
    { match_id: MATCH_ID, type: "goal_for", minute: 41, timestamp_ms: 2_460_000, created_at: "2026-10-26T10:41:00.000Z", primary_player_id: FRIDA, secondary_player_id: null, payload: { primaryPlayerName: "Frida Hansen" } },
    { match_id: MATCH_ID, type: "goal_for", minute: 4, timestamp_ms: 240_000, created_at: "2026-10-26T10:04:00.000Z", primary_player_id: FRIDA, secondary_player_id: IDA, payload: { primaryPlayerName: "Frida Hansen", secondaryPlayerName: "Ida" } },
    { match_id: MATCH_ID, type: "goal_against", minute: 30, timestamp_ms: 1_800_000, created_at: "2026-10-26T10:30:00.000Z", primary_player_id: null, secondary_player_id: null, payload: {} },
  ];
}

describe("public summary: player ids (AI-ID-01)", () => {
  const predictable = () => {
    let calls = 0;
    return createPseudonymizer(() => Math.floor(calls++ / 4));
  };
  const goals = () => completedView("detailed").goals!;

  it("lines the events up with the public goals in the public order", () => {
    expect(alignGoalPlayerIds(goals(), goalEvents() as never)).toEqual([
      { scorerId: FRIDA, assistId: IDA },
      null,
      { scorerId: FRIDA, assistId: null },
    ]);
  });

  it("any doubt gives null: count, side, minute, name or a tie with different players", () => {
    const events = goalEvents();
    expect(alignGoalPlayerIds(goals(), events.slice(1) as never)).toBeNull();
    expect(alignGoalPlayerIds(goals(), events.map((e) => (e.minute === 30 ? { ...e, type: "goal_for" } : e)) as never)).toBeNull();
    expect(alignGoalPlayerIds(goals(), events.map((e) => (e.minute === 41 ? { ...e, minute: 40 } : e)) as never)).toBeNull();
    expect(
      alignGoalPlayerIds(goals(), events.map((e) => (e.minute === 41 ? { ...e, payload: { primaryPlayerName: "Thea Berg" } } : e)) as never)
    ).toBeNull();
    // Two own goals with the same sort key but different scorers: the database may order them either way.
    const tied = sanitizePublicMatchShare({
      ...completedView("detailed"),
      goals: [
        { minute: 4, side: "own", scorer: "Frida Hansen" },
        { minute: 4, side: "own", scorer: "Frida Hansen" },
      ],
      summary: { status: "pending" },
    })!.goals!;
    const same = { match_id: MATCH_ID, type: "goal_for", minute: 4, timestamp_ms: null, created_at: "2026-10-26T10:04:00.000Z", secondary_player_id: null, payload: {} };
    expect(alignGoalPlayerIds(tied, [{ ...same, primary_player_id: FRIDA }, { ...same, primary_player_id: FRIDA_TWO }] as never)).toBeNull();
    expect(alignGoalPlayerIds(tied, [{ ...same, primary_player_id: FRIDA }, { ...same, primary_player_id: FRIDA }] as never)).toHaveLength(2);
  });

  it("with lined-up ids one player keeps one code; two players with the same name keep two", () => {
    const view = completedView("detailed");
    const ids = alignGoalPlayerIds(view.goals!, goalEvents() as never);
    const { prompt, allowedCodes } = buildPublicSummaryPrompt(view, predictable(), ids);
    expect([...allowedCodes].sort()).toEqual(["SPILLER_AAAA", "SPILLER_BBBB"]);
    expect(prompt).not.toContain(FRIDA);
    expect(prompt).not.toContain("aaaaaaaa");

    const namesakes = alignGoalPlayerIds(
      view.goals!,
      goalEvents().map((e) => (e.minute === 41 ? { ...e, primary_player_id: FRIDA_TWO } : e)) as never
    );
    expect(buildPublicSummaryPrompt(view, predictable(), namesakes).allowedCodes.size).toBe(3);
    // Without ids (or a list of the wrong length): a code per mention, as before.
    expect(buildPublicSummaryPrompt(view, predictable(), null).allowedCodes.size).toBe(3);
    expect(buildPublicSummaryPrompt(view, predictable(), [null]).allowedCodes.size).toBe(3);
  });

  it("refresh reads the ids on the server; they reach neither the model, the stored text nor the logs", async () => {
    const tables = { ...matchTables("completed"), match_events: goalEvents() };
    Object.assign(tables.matches[0], { score_for: 2, score_against: 1 });
    const answer = publicAnswerFrom(tables);
    const supabase = fakeSupabase(tables, (fn, args) => {
      const base = answer(fn, args);
      return base && { ...base, goals: completedView("detailed").goals };
    });
    await saveMatchShare(supabase, "coach", MATCH_ID, { summary: true, detailLevel: "detailed", ageGroup: "youth", token: DEVICE_TOKEN });
    const logs = [vi.spyOn(console, "warn"), vi.spyOn(console, "error"), vi.spyOn(console, "info")];
    for (const log of logs) log.mockImplementation(() => {});

    vi.mocked(generateText).mockReset();
    vi.mocked(generateText).mockImplementation(async (input) => {
      const codes = [...new Set(input.prompt.match(/SPILLER_[A-Z0-9]{4}/g) ?? [])];
      return {
        text: `${codes[0]} scoret to ganger\n\n[LAG] vant 2–1 mot [MOTSTANDER]. ${codes[0]} scoret begge målene, det første etter pasning fra ${codes[1]}.`,
      } as never;
    });
    await refreshPublicSummary(supabase, MATCH_ID);

    const sent = JSON.stringify(vi.mocked(generateText).mock.calls);
    // The rule's example code (SPILLER_A1B2) aside, Frida has one code and Ida one.
    expect(new Set(sent.match(/SPILLER_[A-Z0-9]{4}/g)?.filter((code) => code !== "SPILLER_A1B2")).size).toBe(2);
    expect(sent).not.toMatch(/aaaaaaaa|Frida|Ida/);
    expect(tables.match_shares[0].public_summary_text).toContain("Frida Hansen scoret begge målene");
    expect(JSON.stringify(logs.flatMap((log) => log.mock.calls))).not.toContain("aaaaaaaa");
    for (const log of logs) log.mockRestore();
  });
});
