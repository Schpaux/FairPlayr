import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { STUB_USER, hideDevOverlay, live, net, sessionCookie, storedMatch, substitute } from "./support/offline";
import { waitForUndoToClose } from "./support/flows";

// FEAT-SHARE-04 (one targeted check, 375×667): the lineup on the real public
// page /s/[token], through the real page, API route and answer sanitising.
//
//   shared setup (lineup on) → setup change → «Start kampen» → first ▶ →
//   substitution → «Vis lagoppstilling og benk» off
//
// The coach runs against the existing Supabase stub (netControl.mjs, fake
// user, team and players). The coach's match and share requests are recorded
// in the browser, and the public answer the database would give is built
// from exactly those requests by `publicAnswer` below, a small mirror of
// get_public_match_share's lineup rules. It is handed to the stub's
// rpc/get_public_match_share, which the public page reads on the server. The
// SQL itself is not run here (no test database); this checks what the coach
// sends and what the public page shows.

// The stub's squad (netControl.mjs PLAYERS).
const SQUAD = ["Alma", "Bea", "Cora", "Dina", "Eli", "Fia", "Gro", "Hege", "Iben"].map((name, index) => ({
  id: `33333333-3333-4333-8333-33333333333${index}`,
  name,
}));
const nameOf = (id: string) => SQUAD.find((player) => player.id === id)?.name ?? null;

type Json = Record<string, unknown>;
interface Sent {
  share: Json | null;
  shares: Json[];
  runtime: Json | null;
}

/** The lineup part of get_public_match_share for a detailed youth share (names on). */
function lineupOf(kind: string, source: Json | null | undefined, onField: string[] | null) {
  if (!source) return { kind, available: false };
  const slots = (source.liveSlotAssignments ?? source.slotAssignments) as Record<string, string | null> | undefined;
  if (!slots) return { kind, available: false };
  const fieldIds = Object.values(slots).filter((id): id is string => typeof id === "string" && (!onField || onField.includes(id)));
  return {
    kind,
    available: true,
    format: source.format,
    formationId: source.formationId,
    field: Object.entries(slots)
      .filter(([, id]) => id && fieldIds.includes(id))
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([slot, id]) => ({ slot, name: nameOf(id!) })),
    bench: ((source.benchPlayerIds ?? []) as string[]).filter((id) => !fieldIds.includes(id)).map((id) => ({ name: nameOf(id) })),
  };
}

function publicAnswer({ share, runtime }: Sent) {
  if (!share || !(share.live || share.summary)) return null;
  const clock = runtime?.clock as Json | undefined;
  const kickedOff = typeof clock?.startedAtMs === "number";
  const phase = runtime && kickedOff ? "live" : "upcoming";
  const answer: Json = {
    phase: runtime ? "live" : "upcoming",
    teamName: "Skyløvene G12",
    opponentName: null,
    startsAt: null,
    shareLive: share.live === true,
    shareSummary: share.summary === true,
    detailLevel: share.detailLevel,
    ...(runtime ? { live: { clock, status: runtime.status, phase: runtime.phase, halves: runtime.halves } } : {}),
  };
  if (share.live && share.lineup) {
    answer.lineup =
      phase === "upcoming" && !runtime
        ? lineupOf("planned", share.plannedLineup as Json | null, null)
        : lineupOf(phase === "upcoming" ? "planned" : "current", runtime, runtime!.onFieldPlayerIds as string[]);
  }
  return answer;
}

async function recordCoachRequests(context: BrowserContext, sent: Sent) {
  await context.route(/\/api\/matches(\/|\?|$)/, async (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.continue();
    const url = new URL(request.url());
    const body = (request.postDataJSON() ?? {}) as Json;

    if (request.method() === "PUT" && url.pathname.endsWith("/share")) {
      sent.share = body;
      sent.shares.push(body);
      return route.fulfill({ json: { share: { token: body.token, ...body } } });
    }
    if (request.method() === "PATCH" && body.runtimeState) sent.runtime = body.runtimeState as Json;
    return route.fulfill({ status: request.method() === "POST" ? 201 : 200, json: { match: { id: body.id ?? null } } });
  });
}

/** Opens the public page fresh: the server reads the stub's answer. */
async function openPublic(page: Page, token: string, sent: Sent) {
  await net.publicShare(publicAnswer(sent));
  await page.goto(`/no/s/${token}`, { waitUntil: "domcontentloaded" });
  await hideDevOverlay(page);
}

test("FEAT-SHARE-04: shared setup → first ▶ → substitution → lineup off, on the public page", async ({ browser }, info) => {
  test.skip(info.project.name !== "iphone-se-375x667", "One targeted check at the validated live viewport.");
  const use = info.project.use;
  const contextOptions = {
    baseURL: use.baseURL,
    viewport: use.viewport ?? undefined,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    userAgent: use.userAgent,
    locale: "nb-NO",
    reducedMotion: "reduce" as const,
    // The coach's requests are recorded in the page; no worker in between.
    serviceWorkers: "block" as const,
  };
  const coach = await browser.newContext(contextOptions);
  const parents = await browser.newContext(contextOptions);
  const sent: Sent = { share: null, shares: [], runtime: null };

  try {
    await coach.addCookies([{ name: "sb-localhost-auth-token", value: sessionCookie(), url: use.baseURL! }]);
    await coach.addInitScript(() => {
      if (!sessionStorage.getItem("fp-e2e-seeded")) {
        localStorage.clear();
        localStorage.setItem("fairplayr.liveUi", "sideline");
        sessionStorage.setItem("fp-e2e-seeded", "1");
      }
    });
    await recordCoachRequests(coach, sent);
    await net.publicShare(null);

    // ── Setup: squad here, nobody placed yet; share live with the lineup.
    const page = await coach.newPage();
    await page.goto("/no/match/setup", { waitUntil: "domcontentloaded" });
    await hideDevOverlay(page);
    await expect(page.locator("header").first()).toContainText("Skyløvene G12", { timeout: 30_000 });
    await page.getByRole("button", { name: "Velg alle", exact: true }).click();

    const sharePanel = page.getByTestId("setup-share-panel");
    await sharePanel.getByRole("button", { name: "Endre" }).click();
    await sharePanel.getByRole("switch", { name: /Del live/ }).click();
    await sharePanel.getByRole("switch", { name: /Vis lagoppstilling og benk/ }).click();
    await sharePanel.getByTestId("match-share-age").getByText("13 år og eldre").click();
    await sharePanel.getByTestId("match-share-level").getByText("Detaljert", { exact: true }).click();
    await expect.poll(() => sent.share?.detailLevel).toBe("detailed");
    expect(sent.share).toMatchObject({ live: true, lineup: true, ageGroup: "youth" });
    const token = String(sent.share!.token);

    // A later setup change goes the same way: a new share revision.
    await page.getByRole("button", { name: "Fyll automatisk" }).click();
    await expect
      .poll(() => Object.values((sent.share?.plannedLineup as Json | undefined)?.slotAssignments ?? {}).filter(Boolean).length)
      .toBeGreaterThan(0);
    const planned = sent.share!.plannedLineup as { slotAssignments: Record<string, string | null>; benchPlayerIds: string[] };
    const starters = Object.values(planned.slotAssignments).filter(Boolean).length;
    expect(starters + planned.benchPlayerIds.length).toBe(SQUAD.length);
    expect(planned.benchPlayerIds.length).toBeGreaterThan(0);
    expect(JSON.stringify(sent.shares)).not.toContain(STUB_USER.email);

    const parentPage = await parents.newPage();
    await openPublic(parentPage, token, sent);
    const lineup = parentPage.getByTestId("public-match-lineup");
    await expect(lineup).toHaveAttribute("data-kind", "planned");
    await expect(parentPage.getByTestId("public-lineup-token")).toHaveCount(starters);
    await expect(parentPage.getByTestId("public-bench-player")).toHaveCount(planned.benchPlayerIds.length);
    const plannedBench = planned.benchPlayerIds.map((id) => nameOf(id)!);
    for (const name of plannedBench) await expect(parentPage.getByTestId("public-match-bench")).toContainText(name);

    // ── «Start kampen» → first ▶: the running match is the source now.
    await page.getByRole("button", { name: /Start kamp/ }).click();
    await expect(live.root(page)).toBeVisible({ timeout: 30_000 });
    await hideDevOverlay(page);
    await live.button(page, "Avspark").click();
    await expect(page.getByRole("button", { name: /^Stopp klokka/ })).toBeVisible();
    await expect.poll(() => typeof (sent.runtime?.clock as Json | undefined)?.startedAtMs).toBe("number");
    const kickoff = sent.runtime!.kickoffLineup as { slotAssignments: Record<string, string | null>; benchPlayerIds: string[] };
    expect(kickoff.slotAssignments).toEqual(planned.slotAssignments);
    expect(kickoff.benchPlayerIds).toEqual(planned.benchPlayerIds);

    // ── Substitution: who is on and off now; the kick-off lineup stays.
    const started = await storedMatch(page);
    const keeper = Object.entries(started.liveSlotAssignments).sort(([a], [b]) => (a < b ? -1 : 1))[0]?.[1];
    const out = started.onFieldPlayerIds.find((id) => id !== keeper)!;
    const incoming = started.benchPlayerIds[0];
    await substitute(page, out, incoming);
    await waitForUndoToClose(page);
    await expect.poll(() => (sent.runtime?.onFieldPlayerIds as string[] | undefined)?.includes(incoming)).toBe(true);
    expect(sent.runtime!.kickoffLineup).toEqual(kickoff);

    await openPublic(parentPage, token, sent);
    await expect(lineup).toHaveAttribute("data-kind", "current");
    await expect(parentPage.getByTestId("public-match-pitch")).toContainText(nameOf(incoming)!);
    await expect(parentPage.getByTestId("public-match-pitch")).not.toContainText(nameOf(out)!);
    await expect(parentPage.getByTestId("public-match-bench")).toContainText(nameOf(out)!);

    // ── «Vis lagoppstilling og benk» off from the live menu.
    await live.button(page, "Kampmeny").click();
    await page.getByTestId("live-menu-share").click();
    const sheet = page.getByTestId("live-share-sheet");
    await sheet.getByRole("switch", { name: /Vis lagoppstilling og benk/ }).click();
    await expect.poll(() => sent.share?.lineup).toBe(false);
    expect(sent.share).toMatchObject({ live: true, lineup: false });

    await openPublic(parentPage, token, sent);
    await expect(parentPage.getByText(/Skyløvene G12/).first()).toBeVisible();
    await expect(parentPage.getByTestId("public-match-lineup")).toHaveCount(0);
    await expect(parentPage.getByTestId("public-lineup-token")).toHaveCount(0);
    for (const player of SQUAD) await expect(parentPage.locator("body")).not.toContainText(player.name);
  } finally {
    await net.publicShare(null).catch(() => undefined);
    await coach.close();
    await parents.close();
  }
});
