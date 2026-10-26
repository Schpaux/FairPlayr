// @vitest-environment node
// SEC-04 / FEAT-SHARE-02: what the internal match report sends to the AI
// provider (codes and placeholders, structured facts only), how names come
// back, and what happens to a text that misuses codes or invents facts.
// The model is always a stub here; synthetic matches only.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/ai/service", () => ({ generateText: vi.fn() }));

import type { MatchSummaryInput } from "@/lib/server/ai/match-summary/types";

const { generateMatchSummary } = await import("@/lib/server/ai/match-summary/generateMatchSummary");
const { buildMatchSummaryPrompt, lengthRules, resultRule } = await import("@/lib/server/ai/match-summary/buildMatchSummaryPrompt");
const { buildFallbackMatchSummary } = await import("@/lib/server/ai/match-summary/buildFallbackMatchSummary");
const { createPseudonymizer } = await import("@/lib/server/ai/match-summary/pseudonymize");
const { AiServiceError } = await import("@/lib/server/ai/errors");

/** A pseudonymiser with predictable codes: SPILLER_AAAA, SPILLER_BBBB, ... */
function predictable() {
  let calls = 0;
  return createPseudonymizer(() => Math.floor(calls++ / 4));
}

const PRIVATE = ["Frida Hansen", "Ida Lie", "Thea", "Lyn G10", "Byåsen", "Lerkendal kunstgress", "match-123", "player-frida", "player-ida", "player-thea"];

function richMatch(overrides: Partial<MatchSummaryInput> = {}): MatchSummaryInput {
  return {
    matchId: "match-123",
    teamName: "Lyn G10",
    opponentName: "Byåsen",
    dateTime: "2026-10-25T10:00:00Z",
    venue: "Lerkendal kunstgress",
    format: "7v7",
    matchDurationMinutes: 50,
    scoreFor: 3,
    scoreAgainst: 2,
    startingPlayers: [{ name: "Frida Hansen" }, { name: "Ida Lie" }],
    goalsFor: [],
    goalsAgainst: [],
    goalTimeline: [
      { side: "opponent", minute: 6, scorerName: null, assistName: null },
      { side: "own", minute: 14, scorerName: "Frida Hansen", assistName: "Ida Lie", scorerId: "player-frida", assistId: "player-ida" },
      { side: "own", minute: 22, scorerName: "Ida Lie", assistName: null, scorerId: "player-ida" },
      { side: "opponent", minute: 31, scorerName: null, assistName: null },
      { side: "own", minute: 44, scorerName: "Frida Hansen", assistName: "Thea", scorerId: "player-frida", assistId: "player-thea" },
    ],
    substitutions: [
      { minute: 12, playerInName: "Thea", playerOutName: "Ida Lie" },
      { minute: 25, playerInName: "Ida Lie", playerOutName: "Thea" },
    ],
    playersUsed: 9,
    playersUsedList: [
      { name: "Frida Hansen", minutesPlayed: 50, started: true, cameOn: false },
      { name: "Ida Lie", minutesPlayed: 37, started: true, cameOn: false },
      { name: "Thea", minutesPlayed: 13, started: false, cameOn: true },
    ],
    playerTimes: [],
    matchEvents: [{ type: "match_start", minute: 0, detail: "Kampstart: Lyn G10 vs Byåsen" }],
    ...overrides,
  };
}

const stub = (...texts: Array<string | Error>) => {
  const fn = vi.fn();
  for (const text of texts) {
    if (text instanceof Error) fn.mockRejectedValueOnce(text);
    else fn.mockResolvedValueOnce({ text, model: "stub", location: "stub", project: "stub" });
  }
  return fn;
};

const GOOD_RICH = [
  "[LAG] snudde og vant 3–2 mot [MOTSTANDER]",
  "",
  "[MOTSTANDER] scoret først etter 6 minutter, men SPILLER_AAAA utlignet etter 14 minutter etter pasning fra SPILLER_BBBB. SPILLER_BBBB ga [LAG] ledelsen 2–1 etter 22 minutter.",
  "",
  "[MOTSTANDER] utlignet til 2–2 etter 31 minutter. Det avgjørende målet kom etter 44 minutter, da SPILLER_AAAA scoret på pasning fra SPILLER_CCCC. [LAG] vant dermed 3–2.",
  "",
  "Ni spillere var med, og det ble gjort to bytter. Spilletiden varierte mellom 13 og 50 minutter.",
].join("\n");

afterEach(() => vi.restoreAllMocks());

describe("internal report: data to the AI provider", () => {
  it("sends no names, ids, place, date, title or free text, only codes and placeholders", async () => {
    const generateTextFn = stub(GOOD_RICH);
    await generateMatchSummary(richMatch(), { generateTextFn, pseudonymizer: predictable() });

    const sent = JSON.stringify(generateTextFn.mock.calls);
    for (const value of [...PRIVATE, "2026-10-25", "Kampstart"]) expect(sent).not.toContain(value);
    expect(sent).toContain("[LAG]");
    expect(sent).toContain("SPILLER_AAAA");
    // Per-player minutes are not sent; only the range.
    expect(sent).not.toMatch(/"minutter": 37/);
    expect(sent).toContain('\\"laveste_minutter\\": 13');
  });

  it("keeps one code per player in every attempt, and new codes in a new generation", async () => {
    const generateTextFn = stub("for kort", "for kort", "for kort");
    await generateMatchSummary(richMatch(), { generateTextFn });
    const prompts = generateTextFn.mock.calls.map(([call]) => call.prompt as string);
    // The instructions' example (SPILLER_A1B2) is not a player code.
    const codesIn = (text: string) => [...new Set(text.match(/SPILLER_[A-Z0-9]{4}/g))].filter((code) => code !== "SPILLER_A1B2").sort();
    expect(codesIn(prompts[0])).toHaveLength(3);
    expect(codesIn(prompts[1])).toEqual(codesIn(prompts[0]));
    expect(codesIn(prompts[2])).toEqual(codesIn(prompts[0]));

    const again = stub("for kort", "for kort", "for kort");
    await generateMatchSummary(richMatch(), { generateTextFn: again });
    expect(codesIn(again.mock.calls[0][0].prompt)).not.toEqual(codesIn(prompts[0]));
  });

  it("tells two players with the same name apart by id, and never merges mentions without one", async () => {
    // Two different players called Emil: one scores and assists, the other assists and scores.
    const input = richMatch({
      scoreFor: 3,
      scoreAgainst: 0,
      goalTimeline: [
        { side: "own", minute: 5, scorerName: "Emil", assistName: "Emil", scorerId: "player-emil-1", assistId: "player-emil-2" },
        { side: "own", minute: 18, scorerName: "Emil", assistName: "Emil", scorerId: "player-emil-2", assistId: "player-emil-1" },
        { side: "own", minute: 30, scorerName: "Emil", assistName: "Emil" },
      ],
    });
    const pseudonyms = predictable();
    const { prompt, allowedCodes } = buildMatchSummaryPrompt(input, pseudonyms);
    const goals = JSON.parse(prompt.slice(prompt.indexOf("{"))).mål as Array<{ målscorer: string; assist: string }>;

    // By id: different codes for the two, the same code for each one in both roles.
    expect(goals[0].målscorer).not.toBe(goals[0].assist);
    expect(goals[1].målscorer).toBe(goals[0].assist);
    expect(goals[1].assist).toBe(goals[0].målscorer);
    // Without ids: two new codes, not taken for either of the known players.
    expect(new Set([goals[2].målscorer, goals[2].assist, goals[0].målscorer, goals[0].assist]).size).toBe(4);
    expect(allowedCodes.size).toBe(4);
    expect(prompt).not.toMatch(/Emil|player-emil/);

    // The same codes in every attempt, and every code comes back as the name.
    const generateTextFn = stub("for kort", "for kort", "for kort");
    await generateMatchSummary(input, { generateTextFn, pseudonymizer: predictable() });
    const prompts = generateTextFn.mock.calls.map(([call]) => call.prompt as string);
    expect(prompts[1]).toContain(prompts[0].slice(prompts[0].indexOf("{")));
    expect(prompts[2]).toContain(prompts[0].slice(prompts[0].indexOf("{")));
    const restored = pseudonyms.restore(`${goals[0].målscorer} og ${goals[1].målscorer}`, {
      team: "Lyn",
      opponent: "Byåsen",
      allowedCodes,
    });
    expect(restored).toEqual({ ok: true, text: "Emil og Emil" });
  });

  it("gives the order, the running score and the decisive goal when the timeline is complete", () => {
    const { prompt } = buildMatchSummaryPrompt(richMatch(), predictable());
    expect(prompt).toContain('"tidslinje": "komplett"');
    expect(prompt).toContain('"stilling_etter": "3–2"');
    expect(prompt).toContain('"avgjørende": true');
    expect(prompt).toContain('"snudd": true');
    expect(prompt).toContain("som regel 150–250 ord");
    expect(prompt).toContain("Første setning skal tilføre noe utover overskriften");
    expect(prompt).toContain("2–4 korte avsnitt");
  });
});

describe("internal report: names back after validation", () => {
  it("puts the real names back in a valid text", async () => {
    const result = await generateMatchSummary(richMatch(), { generateTextFn: stub(GOOD_RICH), pseudonymizer: predictable() });
    expect(result.source).toBe("ai");
    expect(result.text).toContain("Frida Hansen utlignet etter 14 minutter etter pasning fra Ida Lie");
    expect(result.text).toContain("Lyn G10 snudde og vant 3–2 mot Byåsen");
    expect(result.text).not.toMatch(/SPILLER_|\[LAG\]|\[MOTSTANDER\]/);
  });

  it.each([
    ["an unknown code", GOOD_RICH.replace("SPILLER_CCCC", "SPILLER_ZZZZ")],
    ["a mangled code", GOOD_RICH.replace("SPILLER_CCCC", "SPILLER_CC")],
    ["a lower-case code", GOOD_RICH.replace("SPILLER_CCCC", "spiller_cccc")],
    ["an unknown placeholder", GOOD_RICH.replace("[MOTSTANDER] scoret", "[TRENER] scoret")],
    ["a broken placeholder", GOOD_RICH.replace("[MOTSTANDER] scoret", "[MOTSTANDER scoret")],
  ])("rejects %s and uses the fallback", async (_label, bad) => {
    const result = await generateMatchSummary(richMatch(), { generateTextFn: stub(bad, bad, bad), pseudonymizer: predictable() });
    expect(result).toMatchObject({ source: "fallback", failureReason: "ai_unknown_code" });
    expect(result.text).toBe(buildFallbackMatchSummary(richMatch()));
  });

  it("does not take the ordinary word «spillere» for a code", async () => {
    const result = await generateMatchSummary(richMatch(), { generateTextFn: stub(GOOD_RICH), pseudonymizer: predictable() });
    expect(result.text).toContain("Ni spillere var med");
  });

  it("rejects a wrong result and invented details", async () => {
    const wrong = GOOD_RICH.replaceAll("3–2", "4–2");
    expect(
      await generateMatchSummary(richMatch(), { generateTextFn: stub(wrong, wrong, wrong), pseudonymizer: predictable() })
    ).toMatchObject({ source: "fallback", failureReason: "ai_wrong_result" });

    const invented = GOOD_RICH.replace("Ni spillere var med", "Etter flere store sjanser og god innsats var ni spillere med");
    expect(
      await generateMatchSummary(richMatch(), { generateTextFn: stub(invented, invented, invented), pseudonymizer: predictable() })
    ).toMatchObject({ source: "fallback", failureReason: "ai_unsupported_detail" });
  });

  it("accepts a later attempt with the same codes after a rejected one", async () => {
    const generateTextFn = stub(GOOD_RICH.replace("SPILLER_CCCC", "SPILLER_ZZZZ"), GOOD_RICH);
    const result = await generateMatchSummary(richMatch(), { generateTextFn, pseudonymizer: predictable() });
    expect(result.source).toBe("ai");
    expect(result.text).toContain("pasning fra Thea");
  });
});

describe("internal report: failure codes and logs", () => {
  it("stores and logs a short code, never the model text or the upstream error", async () => {
    const logs = [vi.spyOn(console, "warn"), vi.spyOn(console, "error"), vi.spyOn(console, "info")];
    for (const log of logs) log.mockImplementation(() => {});

    const leaky = "Frida Hansen scoret SPILLER_ZZZZ";
    const upstream = new AiServiceError("VERTEX_CALL_FAILED", "Detalj: snippet with Frida Hansen", 502);
    const result = await generateMatchSummary(richMatch(), { generateTextFn: stub(leaky, upstream, leaky) });

    expect(result.failureReason).toBe("ai_unknown_code");
    const logged = JSON.stringify(logs.flatMap((log) => log.mock.calls));
    expect(logged).not.toContain("Frida");
    expect(logged).not.toContain("snippet");
    expect(logged).toContain("ai_call_failed");
  });

  it("stops early on missing configuration", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const generateTextFn = stub(new AiServiceError("VERTEX_CONFIG_MISSING_ENV", "Mangler miljoverdi", 500));
    const result = await generateMatchSummary(richMatch(), { generateTextFn });
    expect(result.failureReason).toBe("ai_config");
    expect(generateTextFn).toHaveBeenCalledTimes(1);
  });
});

describe("internal report: an incomplete timeline", () => {
  const incomplete = () =>
    richMatch({
      scoreFor: 2,
      scoreAgainst: 1,
      goalTimeline: [{ side: "own", minute: 30, scorerName: "Frida Hansen", assistName: null }],
      substitutions: [],
    });

  it("sends the final score as the truth, no minutes, running score or order", () => {
    const { prompt, systemInstruction } = buildMatchSummaryPrompt(incomplete(), predictable());
    expect(prompt).toContain('"tidslinje": "ufullstendig"');
    expect(prompt).toContain('"registrerte_mål_av_totalt": "1 av 3"');
    expect(prompt).toContain('"tekst": "2–1"');
    expect(prompt).not.toContain("stilling_etter");
    expect(prompt).not.toContain('"minutt"');
    expect(systemInstruction).toContain("Ikke beskriv rekkefølge, ledelse, utligning eller vendinger");
  });

  it("AI-QA-01: shows the goals without a recorded scorer and asks for «blant de registrerte målscorerne»", () => {
    const { prompt, systemInstruction } = buildMatchSummaryPrompt(incomplete(), predictable());
    expect(prompt).toContain('"egne_mål_uten_registrert_målscorer": 1');
    expect(systemInstruction).toContain("Blant de registrerte målscorerne");
    expect(systemInstruction).toContain("aldri slik at det ser ut som de registrerte scorerne står bak alle målene");
    expect(buildFallbackMatchSummary(incomplete())).toContain("Blant de registrerte målscorerne: Frida Hansen.");
  });

  it("the fallback states the result and what is missing, and tells no course", () => {
    const text = buildFallbackMatchSummary(incomplete());
    expect(text).toContain("Lyn G10 vant 2–1 mot Byåsen.");
    expect(text).toContain("Hendelsesloggen har 1 av 3 mål.");
    expect(text).not.toMatch(/først|snudde|avgjørende|utlignet/);
  });
});

describe("internal report: language and flow (AI-QA-01)", () => {
  it("asks for the result from the team's side, a summary of the course, no date words and a real heading", () => {
    const { prompt, systemInstruction } = buildMatchSummaryPrompt(richMatch(), predictable());
    expect(prompt).toContain("«3–2-seier»");
    expect(prompt).toContain("ikke en generell overskrift som «Kampoppsummering»");
    expect(systemInstruction).toContain("i stedet for å ramse opp hvert mål");
    expect(systemInstruction).toContain("«dagens kamp»");
    const loss = buildMatchSummaryPrompt(richMatch({ scoreFor: 1, scoreAgainst: 3, goalTimeline: [] }), predictable());
    expect(loss.prompt).toContain("«1–3-tap»");
  });

  it("thin facts ask for a short text", () => {
    const { prompt } = buildMatchSummaryPrompt(
      richMatch({ scoreFor: 0, scoreAgainst: 0, goalTimeline: [], substitutions: [], playersUsed: 0, playersUsedList: [] }),
      predictable()
    );
    expect(prompt).toContain("som regel 20–50 ord");
    expect(prompt).toContain("aldri fylle på med generelle setninger for å nå et ordtall");
  });

  it("AI-QA-02: one paragraph is «ett kort avsnitt», and a draw has no hyphen rule", () => {
    const one = lengthRules({ minWords: 20, maxWords: 50, minParagraphs: 1, maxParagraphs: 1 }).join("\n");
    expect(one).toContain("deretter ett kort avsnitt");
    expect(one).not.toContain("1 korte");
    expect(resultRule(2, 2)).toContain("«uavgjort 2–2»");
    expect(resultRule(2, 2)).not.toContain("bindestrek");
    expect(resultRule(4, 3)).toContain("«4–3-seier» (bindestrek i sammensetningen)");
  });

  it("refuses date words and a reversed result; drops a generic heading and hyphenates «3–2 seier»", async () => {
    const dated = GOOD_RICH.replace("Ni spillere var med", "I dagens kamp var ni spillere med");
    const reversed = GOOD_RICH.replace("[LAG] vant dermed 3–2.", "Kampen endte 2–3 sett fra [MOTSTANDER], en 3–2 seier.");
    const generic = `Kampoppsummering\n\n${GOOD_RICH.replace("[LAG] vant dermed 3–2.", "Det ble en 3–2 seier.")}`;
    const generateTextFn = stub(dated, reversed, generic);
    const result = await generateMatchSummary(richMatch(), { generateTextFn, pseudonymizer: predictable() });
    expect(generateTextFn).toHaveBeenCalledTimes(3);
    expect(result.source).toBe("ai");
    expect(result.text.startsWith("Lyn G10 snudde og vant 3–2 mot Byåsen")).toBe(true);
    expect(result.text).not.toContain("Kampoppsummering");
    expect(result.text).toContain("Det ble en 3–2-seier.");
  });

  it("asks for a bounded thinking budget on every attempt; the empty-answer retry and fallback stay", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const empty = () => new AiServiceError("VERTEX_EMPTY_RESPONSE", "tom", 502, { finishReason: "MAX_TOKENS" });
    const generateTextFn = stub(empty(), empty(), empty());
    const result = await generateMatchSummary(richMatch(), { generateTextFn });
    expect(generateTextFn).toHaveBeenCalledTimes(3);
    for (const [args] of generateTextFn.mock.calls) {
      expect(args).toMatchObject({ maxOutputTokens: 2048, thinkingBudget: 512 });
    }
    expect(result).toMatchObject({ source: "fallback", failureReason: "ai_call_failed" });
  });
});

describe("thinkingConfigFor (AI-QA-01)", () => {
  it("sends a documented budget to Gemini 2.5 models only, within each model's range", async () => {
    const { thinkingConfigFor } = await vi.importActual<typeof import("@/lib/server/ai/service")>("@/lib/server/ai/service");
    expect(thinkingConfigFor("gemini-2.5-flash", 512)).toEqual({ thinkingBudget: 512 });
    expect(thinkingConfigFor("gemini-2.5-flash", 0)).toEqual({ thinkingBudget: 0 });
    expect(thinkingConfigFor("gemini-2.5-pro", 0)).toEqual({ thinkingBudget: 128 });
    expect(thinkingConfigFor("gemini-2.5-flash-lite", 100)).toEqual({ thinkingBudget: 512 });
    expect(thinkingConfigFor("gemini-2.5-flash", 99999)).toEqual({ thinkingBudget: 24576 });
    expect(thinkingConfigFor("gemini-2.0-flash", 512)).toBeUndefined();
    expect(thinkingConfigFor("gemini-2.5-flash", undefined)).toBeUndefined();
  });
});

describe("internal report: fallback", () => {
  it("tells the course of a complete match without padding", () => {
    expect(buildFallbackMatchSummary(richMatch())).toBe(
      [
        "Seier 3–2 mot Byåsen",
        "Lyn G10 vant 3–2 mot Byåsen. Byåsen scoret først, etter 6 minutter. Lyn G10 lå under, men snudde kampen. Det avgjørende målet til 3–2 kom etter 44 minutter.",
        "Målscorere: Frida Hansen (2) og Ida Lie. Assist: Ida Lie og Thea. Lyn G10 brukte 9 spillere og gjorde 2 bytter. Spilletiden var mellom 13 og 50 minutter.",
      ].join("\n\n")
    );
  });

  it("stays short for a goalless match", () => {
    const text = buildFallbackMatchSummary(
      richMatch({ scoreFor: 0, scoreAgainst: 0, goalTimeline: [], substitutions: [], playersUsed: 7, playersUsedList: [] })
    );
    expect(text).toBe("Uavgjort 0–0 mot Byåsen\n\nLyn G10 og Byåsen spilte 0–0.\n\nLyn G10 brukte 7 spillere.");
  });
});
