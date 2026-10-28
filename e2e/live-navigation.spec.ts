import { expect, test, type Page } from "@playwright/test";

// FP-MS2.1-A1 (MS-10, X-11): a running match must survive leaving Live.
// Seeds a guest team and an active 7v7 setup, plays a few minutes (kickoff,
// goal, substitution), then leaves Live through every route a coach has: the
// Modern Sideline menu, the legacy view's top link, the setup URL and a
// reload. The stored match (id, events, minutes, score, phase, clock) must be
// unchanged afterwards and Live must show it again. Synthetic data only.

const NOW = "2026-10-14T10:00:00.000Z";
const MIN = 60_000;
const SETUP_KEY = "fairplayr.matchSetup.v1";
const LIVE_KEY = "fairplayr.liveMatch.v1";

function seed() {
  const players = ["Frida", "Ida", "Selma", "Vilde", "Maja", "Nora", "Emma", "Thea", "Ingrid"].map(
    (name, index) => ({
      id: `p${index + 1}`,
      name,
      number: index + 1,
      source: "manual",
      externalProvider: null,
      externalId: null,
      isManaged: false,
      createdAt: NOW,
      updatedAt: NOW,
    })
  );
  const starters = players.slice(0, 7).map((player) => player.id);

  return {
    workspace: {
      version: 2,
      teams: [{ id: "team-e2e", name: "Lyn G12", players, createdAt: NOW, updatedAt: NOW }],
      activeTeamId: "team-e2e",
    },
    setup: {
      version: 2,
      status: "active",
      serverMatchId: null,
      config: {
        id: "setup-e2e-nav",
        teamId: "team-e2e",
        format: "7v7",
        reportEnabled: false,
        formationId: "7v7-2-3-1",
        duration: { mode: "preset", presetId: "2x20", halves: 2, minutesPerHalf: 20, totalMinutes: 40 },
        selectedPlayerIds: players.map((player) => player.id),
        startingPlayerIds: starters,
        slotAssignments: Object.fromEntries(starters.map((id, index) => [`7v7-${index + 1}`, id])),
        createdAt: NOW,
        updatedAt: NOW,
      },
    },
  };
}

/** The parts of the stored match that must never change through navigation. */
async function storedMatch(page: Page) {
  return page.evaluate(
    ({ setupKey, liveKey }) => {
      const setup = JSON.parse(localStorage.getItem(setupKey) ?? "null");
      const live = JSON.parse(localStorage.getItem(liveKey) ?? "null")?.liveMatch ?? null;
      return {
        setupStatus: setup?.status ?? null,
        setupId: setup?.config?.id ?? null,
        live: live && {
          id: live.id,
          setupId: live.setupId,
          status: live.status,
          phase: live.phase,
          clock: live.clock,
          teamScore: live.teamScore,
          opponentScore: live.opponentScore,
          onFieldPlayerIds: live.onFieldPlayerIds,
          benchPlayerIds: live.benchPlayerIds,
          playerAccumulatedMs: live.playerAccumulatedMs,
          onFieldStartedAtElapsedMs: live.onFieldStartedAtElapsedMs,
          events: live.events,
        },
      };
    },
    { setupKey: SETUP_KEY, liveKey: LIVE_KEY }
  );
}

async function openLive(page: Page, { sideline }: { sideline: boolean }) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());

  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript(
    ({ data, sideline: useSideline }) => {
      if (sessionStorage.getItem("fp-e2e-seeded")) return;
      sessionStorage.setItem("fp-e2e-seeded", "1");
      localStorage.clear();
      if (useSideline) localStorage.setItem("fairplayr.liveUi", "sideline");
      localStorage.setItem("fairplayr.teams.v2", JSON.stringify(data.workspace));
      localStorage.setItem("fairplayr.matchSetup.v1", JSON.stringify(data.setup));
    },
    { data: seed(), sideline }
  );

  await page.goto("/no/match/live", { waitUntil: "domcontentloaded" });
  return errors;
}

const hideDevBadge = (page: Page) =>
  page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

/** Kickoff, a goal at 6′ and a substitution at 8′ in the Modern Sideline view. */
async function playSidelineMinutes(page: Page) {
  await expect(page.getByTestId("live-sideline")).toBeVisible({ timeout: 30_000 });
  await hideDevBadge(page);
  await page.getByRole("button", { name: "Avspark", exact: true }).click();
  await page.clock.fastForward(6 * MIN);
  await page.getByRole("button", { name: "Mål for oss", exact: true }).click();
  await page.clock.fastForward(2 * MIN);
  await page.locator('[data-player-id="p3"]').click();
  await page.locator('[data-bench-player-id="p8"]').click();
  // Let the 5 s undo window lapse so the substitution is final.
  await page.clock.fastForward(6_000);
  await expect(page.getByTestId("live-score")).toHaveAttribute("aria-label", "Stilling: oss 1, dem 0");

  const before = await storedMatch(page);
  expect(before.setupStatus).toBe("active");
  expect(before.live).toMatchObject({ status: "running", phase: "first_half", teamScore: 1 });
  expect(before.live?.onFieldPlayerIds).toContain("p8");
  expect(before.live?.benchPlayerIds).toContain("p3");
  expect(before.live?.events.length).toBeGreaterThan(1);
  return before;
}

async function backToLiveViaBanner(page: Page) {
  const banner = page.getByRole("link", { name: /Kamp pågår/ });
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await banner.click();
  await expect(page).toHaveURL(/\/no\/match\/live/);
}

async function expectSidelineMatchShown(page: Page) {
  await expect(page.getByTestId("live-sideline")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("live-score")).toHaveAttribute("aria-label", "Stilling: oss 1, dem 0");
  await expect(page.getByText("Ingen aktiv kamp")).toHaveCount(0);
}

async function leaveViaMenu(page: Page) {
  await page.getByRole("button", { name: "Kampmeny" }).click();
  await expect(page.getByRole("dialog", { name: "Kampmeny" })).toBeVisible();
  await expect(page.getByText("Tilbake til kampoppsett")).toHaveCount(0);
  await page.getByRole("link", { name: "Til forsiden – kampen fortsetter" }).click();
}

test.describe("an active match survives navigation", () => {
  test("Modern Sideline menu → Home → banner → Live keeps the same match", async ({ page }) => {
    const errors = await openLive(page, { sideline: true });
    const before = await playSidelineMinutes(page);

    await leaveViaMenu(page);
    await expect(page).toHaveURL(/\/no\/play\/?$/);
    expect(await storedMatch(page)).toEqual(before);

    await backToLiveViaBanner(page);
    await expectSidelineMatchShown(page);
    expect(await storedMatch(page)).toEqual(before);
    expect(errors).toEqual([]);
  });

  test("opening match setup during a match shows the way back and no Start kamp", async ({ page }) => {
    const errors = await openLive(page, { sideline: true });
    const before = await playSidelineMinutes(page);

    await page.goto("/no/match/setup", { waitUntil: "domcontentloaded" });
    await hideDevBadge(page);
    const backToMatch = page.getByRole("link", { name: "Gå til kampen" });
    await expect(backToMatch).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /Start kamp/ })).toHaveCount(0);
    expect(await storedMatch(page)).toEqual(before);

    await backToMatch.click();
    await expectSidelineMatchShown(page);
    expect(await storedMatch(page)).toEqual(before);
    expect(errors).toEqual([]);
  });

  test("a reload keeps the same match, score, events and minutes", async ({ page }) => {
    const errors = await openLive(page, { sideline: true });
    const before = await playSidelineMinutes(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectSidelineMatchShown(page);
    await expect(page.getByTestId("live-clock")).toContainText("1. omgang");
    expect(await storedMatch(page)).toEqual(before);
    expect(errors).toEqual([]);
  });

  test("leaving offline never touches the stored match", async ({ page, context }) => {
    await openLive(page, { sideline: true });
    const before = await playSidelineMinutes(page);

    await context.setOffline(true);
    await page.getByRole("button", { name: "Mål for dem", exact: true }).click();
    await expect(page.getByTestId("live-score")).toHaveAttribute("aria-label", "Stilling: oss 1, dem 1");
    const offlineState = await storedMatch(page);
    expect(offlineState).toMatchObject({ setupStatus: "active", setupId: before.setupId });
    expect(offlineState.live).toMatchObject({ id: before.live?.id, opponentScore: 1, status: "running" });

    // The dev server cannot serve the next route offline (no service worker;
    // the browser lands on its own error page), so only the tap itself is
    // under test: it must not end or reset anything. Storage is read back on
    // Home once the network returns, before Live mounts again.
    await leaveViaMenu(page);
    await page.waitForTimeout(500);
    await context.setOffline(false);
    await page.goto("/no/play", { waitUntil: "domcontentloaded" });
    expect(await storedMatch(page)).toEqual(offlineState);

    await backToLiveViaBanner(page);
    await expect(page.getByTestId("live-sideline")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("live-score")).toHaveAttribute("aria-label", "Stilling: oss 1, dem 1");
    expect(await storedMatch(page)).toEqual(offlineState);
  });

  test("legacy live view: the top link goes Home and the match keeps running", async ({ page }) => {
    const errors = await openLive(page, { sideline: false });
    const button = (name: string) => page.getByRole("button", { name, exact: true });
    await expect(button("Start kamp")).toBeVisible({ timeout: 30_000 });
    await hideDevBadge(page);
    await button("Start kamp").click();
    await page.clock.fastForward(5 * MIN);
    const before = await storedMatch(page);
    expect(before).toMatchObject({ setupStatus: "active", live: { status: "running" } });

    await page.getByRole("link", { name: "Til forsiden – kampen fortsetter" }).click();
    await expect(page).toHaveURL(/\/no\/play\/?$/);
    expect(await storedMatch(page)).toEqual(before);

    await backToLiveViaBanner(page);
    await expect(button("Pause")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Ingen aktiv kamp")).toHaveCount(0);
    expect(await storedMatch(page)).toEqual(before);
    expect(errors).toEqual([]);
  });
});

test("with no active match, setup starts a new match normally", async ({ page }) => {
  const data = seed();
  await page.addInitScript((seeded) => {
    if (sessionStorage.getItem("fp-e2e-seeded")) return;
    sessionStorage.setItem("fp-e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("fairplayr.teams.v2", JSON.stringify(seeded.workspace));
    localStorage.setItem("fairplayr.matchSetup.v1", JSON.stringify({ ...seeded.setup, status: "draft" }));
  }, data);

  await page.goto("/no/match/setup", { waitUntil: "domcontentloaded" });
  await hideDevBadge(page);
  const start = page.getByRole("button", { name: /Start kamp/ });
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  await expect(page).toHaveURL(/\/no\/match\/live/, { timeout: 30_000 });
  expect(await storedMatch(page)).toMatchObject({
    setupStatus: "active",
    setupId: "setup-e2e-nav",
    live: { setupId: "setup-e2e-nav", status: "not_started" },
  });

  // A match started in this session (the provider first saw none) must still
  // show the banner on Home, so the coach can get back to it.
  const kickoff = page.getByRole("button", { name: "Start kamp", exact: true });
  await expect(kickoff).toBeVisible({ timeout: 30_000 });
  await kickoff.click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  const started = await storedMatch(page);
  await page.getByRole("link", { name: "Til forsiden – kampen fortsetter" }).click();
  await expect(page).toHaveURL(/\/no\/play\/?$/);
  await backToLiveViaBanner(page);
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible({ timeout: 30_000 });
  expect((await storedMatch(page)).live?.id).toBe(started.live?.id);
});
