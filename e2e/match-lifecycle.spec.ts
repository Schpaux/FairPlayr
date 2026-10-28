import { expect, test, type Page } from "@playwright/test";

// FP-P0-F2: the active-match banner names and opens the match this device
// runs, ending it removes the banner for good (navigation, reload, team
// switch), and a match left running for a day can be closed at once without
// losing its minutes. Guest mode: the signed-in server cases are covered by
// unit/component tests. Synthetic data only.

const NOW = "2026-10-14T10:00:00.000Z";
const MIN = 60_000;
const SETUP_KEY = "fairplayr.matchSetup.v1";
const LIVE_KEY = "fairplayr.liveMatch.v1";
const TEAMS_KEY = "fairplayr.teams.v2";

function seed() {
  const player = (id: string, name: string, number: number) => ({
    id,
    name,
    number,
    source: "manual",
    externalProvider: null,
    externalId: null,
    isManaged: false,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const players = ["Frida", "Ida", "Selma", "Vilde", "Maja", "Nora", "Emma"].map((name, index) =>
    player(`p${index + 1}`, name, index + 1)
  );
  const starters = players.slice(0, 5).map((p) => p.id);

  return {
    workspace: {
      version: 2,
      teams: [
        { id: "team-a", name: "Lyn G12", players, createdAt: NOW, updatedAt: NOW },
        { id: "team-b", name: "Lyn G13", players: [player("q1", "Sara", 1)], createdAt: NOW, updatedAt: NOW },
      ],
      activeTeamId: "team-a",
    },
    setup: {
      version: 2,
      status: "active",
      serverMatchId: null,
      config: {
        id: "setup-e2e-lifecycle",
        teamId: "team-a",
        format: "5v5",
        reportEnabled: false,
        formationId: "5v5-2-2",
        duration: { mode: "preset", presetId: "2x15", halves: 2, minutesPerHalf: 15, totalMinutes: 30 },
        selectedPlayerIds: players.map((p) => p.id),
        startingPlayerIds: starters,
        slotAssignments: Object.fromEntries(starters.map((id, index) => [`5v5-${index + 1}`, id])),
        createdAt: NOW,
        updatedAt: NOW,
      },
    },
  };
}

async function stored(page: Page) {
  return page.evaluate(
    ({ setupKey, liveKey }) => {
      const setup = JSON.parse(localStorage.getItem(setupKey) ?? "null");
      const live = JSON.parse(localStorage.getItem(liveKey) ?? "null")?.liveMatch ?? null;
      return { setupStatus: setup?.status ?? null, live };
    },
    { setupKey: SETUP_KEY, liveKey: LIVE_KEY }
  );
}

async function openLive(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());

  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript((data) => {
    if (sessionStorage.getItem("fp-e2e-seeded")) return;
    sessionStorage.setItem("fp-e2e-seeded", "1");
    localStorage.clear();
    localStorage.setItem("fairplayr.liveUi", "sideline");
    localStorage.setItem("fairplayr.teams.v2", JSON.stringify(data.workspace));
    localStorage.setItem("fairplayr.matchSetup.v1", JSON.stringify(data.setup));
  }, seed());

  await page.goto("/no/match/live", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("live-sideline")).toBeVisible({ timeout: 30_000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  return errors;
}

async function kickoff(page: Page) {
  await page.getByRole("button", { name: "Avspark", exact: true }).click();
}

async function leaveToHome(page: Page) {
  await page.getByRole("button", { name: "Kampmeny" }).click();
  await page.getByRole("link", { name: "Til forsiden – kampen fortsetter" }).click();
  await expect(page).toHaveURL(/\/no\/play\/?$/);
}

async function endViaMenu(page: Page) {
  await page.getByRole("button", { name: "Kampmeny" }).click();
  await page.getByRole("button", { name: "Avslutt kampen nå" }).click();
  // The live confirmation sheet (UI-A11Y-02), not a browser dialog.
  await page.getByRole("button", { name: "Ja, avslutt kampen" }).click();
}

const banner = (page: Page) => page.getByRole("link", { name: /Kamp pågår/ });

test.describe("match lifecycle and the active-match banner", () => {
  test("the banner opens this device's match, and ending it removes the banner for good", async ({ page }) => {
    const errors = await openLive(page);
    await kickoff(page);
    await page.clock.fastForward(3 * MIN);
    await leaveToHome(page);

    await expect(banner(page)).toBeVisible({ timeout: 30_000 });
    await expect(banner(page)).toHaveAttribute("href", "/no/match/live");
    await banner(page).click();
    await expect(page.getByTestId("live-sideline")).toBeVisible({ timeout: 30_000 });

    await endViaMenu(page);
    await expect.poll(async () => (await stored(page)).setupStatus).toBe("ended");
    expect((await stored(page)).live).toMatchObject({ status: "ended", clock: { isRunning: false } });

    await page.goto("/no/play", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });
    await expect(banner(page)).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });
    await expect(banner(page)).toHaveCount(0);
    await page.goto("/no/match", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });
    await expect(banner(page)).toHaveCount(0);

    // The ended match stays ended: time no longer accumulates.
    const ended = (await stored(page)).live;
    await page.clock.fastForward(30 * MIN);
    expect((await stored(page)).live).toEqual(ended);
    expect(errors).toEqual([]);
  });

  test("switching team keeps the banner on this device's match", async ({ page }) => {
    const errors = await openLive(page);
    await kickoff(page);
    await leaveToHome(page);
    await expect(banner(page)).toBeVisible({ timeout: 30_000 });

    await page.evaluate((key) => {
      const workspace = JSON.parse(localStorage.getItem(key) ?? "{}");
      localStorage.setItem(key, JSON.stringify({ ...workspace, activeTeamId: "team-b" }));
    }, TEAMS_KEY);
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(banner(page)).toBeVisible({ timeout: 30_000 });
    await banner(page).click();
    await expect(page.getByTestId("live-sideline")).toBeVisible({ timeout: 30_000 });
    expect((await stored(page)).live).toMatchObject({ setupId: "setup-e2e-lifecycle", status: "running" });
    expect(errors).toEqual([]);
  });

  test("a match left running for a day closes at once and keeps its minutes", async ({ page }) => {
    const LEFT_RUNNING = 1494;
    const errors = await openLive(page);
    await kickoff(page);
    await page.clock.fastForward(LEFT_RUNNING * MIN);

    await endViaMenu(page);
    await expect.poll(async () => (await stored(page)).setupStatus).toBe("ended");

    const { live } = await stored(page);
    expect(live.status).toBe("ended");
    const endedEvent = live.events.find((event: { type: string }) => event.type === "match_ended");
    expect(endedEvent.minute).toBe(LEFT_RUNNING);
    // Minutes as the app computes them: banked time plus the stint still on
    // the pitch, measured on the clock that stopped at the end.
    const clock = live.clock;
    const elapsedMs = clock.pausedAtMs - clock.startedAtMs - clock.accumulatedPausedMs;
    expect(Math.floor(elapsedMs / MIN)).toBe(LEFT_RUNNING);
    expect(live.onFieldPlayerIds).toHaveLength(5);
    for (const playerId of live.onFieldPlayerIds as string[]) {
      const stintMs = elapsedMs - (live.onFieldStartedAtElapsedMs[playerId] ?? elapsedMs);
      expect(Math.floor(((live.playerAccumulatedMs[playerId] ?? 0) + stintMs) / MIN)).toBe(LEFT_RUNNING);
    }
    expect(errors).toEqual([]);
  });
});
