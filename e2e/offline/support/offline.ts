import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

// Shared helpers for the offline suite (playwright.offline.config.ts).

const CONTROL = "http://127.0.0.1:3221";

export type Theme = "light" | "dark";
export const THEMES: Theme[] = ["light", "dark"];

// ── Network switch (netControl.mjs) ──────────────────────────────────────────
async function control(pathname: string, init?: RequestInit) {
  const response = await fetch(`${CONTROL}${pathname}`, init);
  if (!response.ok) throw new Error(`netControl ${pathname}: ${response.status}`);
  return response.json();
}

export interface LoggedRequest {
  at: number;
  target: "app" | "supabase";
  method: string;
  url: string;
  hasCookie: boolean;
  precache: string | null;
  rsc: string | null;
}

export const net = {
  off: () => control("/network/off", { method: "POST" }),
  on: () => control("/network/on", { method: "POST" }),
  log: () => control("/log") as Promise<LoggedRequest[]>,
  clearLog: () => control("/log/clear", { method: "POST" }),
  swVariant: (variant: { suffix?: string; mode?: "on" | "off" } | null) =>
    control("/sw-variant", { method: "POST", body: JSON.stringify(variant ?? {}) }),
  /** What the stub's get_public_match_share answers (null: no such share). */
  publicShare: (answer: unknown) => control("/public-share", { method: "POST", body: JSON.stringify({ answer }) }),
};

// ── Persistent browser profile = the installed app on a device ───────────────
/**
 * A browser profile that survives restarts. `start()` launches the browser
 * with it, `restart()` closes the whole browser (every page and the service
 * worker, as when the app is swiped away) and launches it again.
 */
export class Device {
  readonly dir: string;
  context: BrowserContext | null = null;
  private offline = false;

  constructor(private readonly info: TestInfo) {
    this.dir = mkdtempSync(path.join(tmpdir(), "fp-offline-"));
  }

  async start(): Promise<BrowserContext> {
    const use = this.info.project.use;
    this.context = await chromium.launchPersistentContext(this.dir, {
      viewport: use.viewport ?? undefined,
      deviceScaleFactor: use.deviceScaleFactor,
      isMobile: use.isMobile,
      hasTouch: use.hasTouch,
      userAgent: use.userAgent,
      locale: use.locale ?? "nb-NO",
      baseURL: use.baseURL,
      serviceWorkers: "allow",
      reducedMotion: "reduce",
      offline: this.offline,
    });
    return this.context;
  }

  async page(): Promise<Page> {
    if (!this.context) await this.start();
    const page = await this.context!.newPage();
    return page;
  }

  /** Cuts the network outside the browser, and tells the browser it is offline. */
  async goOffline() {
    this.offline = true;
    await net.off();
    await this.context?.setOffline(true);
  }

  async goOnline() {
    this.offline = false;
    await net.on();
    await this.context?.setOffline(false);
  }

  async close() {
    await this.context?.close();
    this.context = null;
  }

  /** Closes all pages and the browser, waits, and starts it again. */
  async restart(closedForMs = 0): Promise<BrowserContext> {
    await this.close();
    if (closedForMs > 0) await new Promise((resolve) => setTimeout(resolve, closedForMs));
    return this.start();
  }

  async dispose() {
    await this.close().catch(() => undefined);
    await net.on().catch(() => undefined);
    await net.swVariant(null).catch(() => undefined);
    rmSync(this.dir, { recursive: true, force: true });
  }
}

// ── Signed-in coach (Supabase stub in netControl.mjs) ────────────────────────
export const STUB_USER = { id: "11111111-1111-4111-8111-111111111111", email: "trener@example.test" };
export const STUB_TEAM_NAME = "Skyløvene G12";
export const PENDING_COMPLETIONS_KEY = "fairplayr.pendingMatchCompletions.v1";

/**
 * The @supabase/ssr browser cookie (`sb-localhost-auth-token`, "base64-" +
 * base64url JSON), the format the app writes after a real sign-in. Its
 * access token is only valid against the stub.
 */
export function sessionCookie() {
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: "stub-access-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: "stub-refresh-token",
    user: { ...STUB_USER, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-10-01T10:00:00.000Z" },
  };
  return `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}

export async function signIn(context: BrowserContext) {
  await context.addCookies([{ name: "sb-localhost-auth-token", value: sessionCookie(), url: "http://localhost:3220" }]);
}

// ── Service worker ───────────────────────────────────────────────────────────
export interface SwStatus {
  buildId: string;
  mode: string;
  precacheName: string;
  precachedCount: number;
  lastLocale: string | null;
  matchActive: boolean;
  servedBuildId: string;
}

/** Asks the controlling (or active) worker for its status. */
export async function swStatus(page: Page): Promise<SwStatus> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const worker = navigator.serviceWorker.controller ?? registration.active!;
    return new Promise<SwStatus>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => resolve(event.data as SwStatus);
      worker.postMessage({ type: "FP_GET_STATUS" }, [channel.port2]);
    });
  });
}

/**
 * Waits until the worker is active (so its precache is complete: install only
 * succeeds once every file is stored) and controls the page.
 */
export async function waitForServiceWorker(page: Page): Promise<SwStatus> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 20_000 }).toBe(true);
  const status = await swStatus(page);
  expect(status.mode).toBe("on");
  expect(status.precachedCount).toBeGreaterThan(10);
  const cacheNames = await page.evaluate(() => caches.keys());
  expect(cacheNames).toContain(status.precacheName);
  return status;
}

// ── App data ─────────────────────────────────────────────────────────────────
export const LIVE_KEY = "fairplayr.liveMatch.v1";
export const SETUP_KEY = "fairplayr.matchSetup.v1";
export const TEAMS_KEY = "fairplayr.teams.v2";
const T0 = "2026-10-20T10:00:00.000Z";
export const NAMES = ["Frida Berg", "Ida Ruud", "Selma Lie", "Vilde Moe", "Maja Dahl", "Nora Hagen", "Emma Hansen", "Thea Strand", "Ingrid Lund"];

export function guestTeam() {
  const players = NAMES.map((name, index) => ({
    id: `p${index + 1}`,
    name,
    number: index + 1,
    source: "manual",
    externalProvider: null,
    externalId: null,
    isManaged: false,
    createdAt: T0,
    updatedAt: T0,
  }));
  return { version: 2, teams: [{ id: "team-e2e", name: "Lyn G12", players, createdAt: T0, updatedAt: T0 }], activeTeamId: "team-e2e" };
}

export function draftSetup(teamId: string, ids: string[], setupId = "setup-e2e-offline") {
  const starters = ids.slice(0, 7);
  return {
    version: 2,
    status: "draft",
    serverMatchId: null,
    config: {
      id: setupId,
      teamId,
      format: "7v7",
      reportEnabled: false,
      formationId: "7v7-2-3-1",
      duration: { mode: "preset", presetId: "2x20", halves: 2, minutesPerHalf: 20, totalMinutes: 40 },
      selectedPlayerIds: ids,
      startingPlayerIds: starters,
      slotAssignments: Object.fromEntries(starters.map((id, index) => [`7v7-${index + 1}`, id])),
      createdAt: T0,
      updatedAt: T0,
    },
  };
}

/** Writes app data on the device (first online visit), with the Modern Sideline live view. */
export async function seedDevice(page: Page, theme: Theme, data: Record<string, unknown>) {
  await page.evaluate(
    ({ theme, data }) => {
      localStorage.clear();
      localStorage.setItem("theme", theme);
      localStorage.setItem("fairplayr.liveUi", "sideline");
      for (const [key, value] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(value));
    },
    { theme, data }
  );
}

export interface StoredMatch {
  id: string;
  status: string;
  phase: string;
  teamScore: number;
  opponentScore: number;
  onFieldPlayerIds: string[];
  benchPlayerIds: string[];
  liveSlotAssignments: Record<string, string | null>;
  playerAccumulatedMs: Record<string, number>;
  onFieldStartedAtElapsedMs: Record<string, number | null>;
  clock: { startedAtMs: number | null; isRunning: boolean; accumulatedPausedMs: number; pausedAtMs?: number | null };
  events: { id: string; type: string; side?: string; scorerPlayerId?: string | null }[];
}

export async function storedMatch(page: Page): Promise<StoredMatch> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), LIVE_KEY);
  expect(raw, "a live match is stored").not.toBeNull();
  return (JSON.parse(raw!) as { liveMatch: StoredMatch }).liveMatch;
}

/** Elapsed match time of a stored match, from its wall-clock basis. */
export function elapsedMs(match: StoredMatch, now: number): number {
  const { startedAtMs, isRunning, accumulatedPausedMs, pausedAtMs } = match.clock;
  if (startedAtMs === null) return 0;
  const end = isRunning ? now : (pausedAtMs ?? now);
  return end - startedAtMs - accumulatedPausedMs;
}

/** Playing time per player at `now` (accumulated plus the open stint). */
export function minutesByPlayer(match: StoredMatch, now: number): Record<string, number> {
  const elapsed = elapsedMs(match, now);
  const out: Record<string, number> = {};
  for (const [id, acc] of Object.entries(match.playerAccumulatedMs)) {
    const since = match.onFieldStartedAtElapsedMs[id];
    out[id] = acc + (since === null || since === undefined ? 0 : elapsed - since);
  }
  return out;
}

// ── Live screen ──────────────────────────────────────────────────────────────
export const live = {
  root: (page: Page) => page.getByTestId("live-sideline"),
  score: (page: Page) => page.getByTestId("live-score"),
  strip: (page: Page) => page.getByTestId("live-strip"),
  token: (page: Page, id: string) => page.locator(`[data-player-id="${id}"]`),
  bench: (page: Page, id: string) => page.locator(`[data-bench-player-id="${id}"]`),
  button: (page: Page, name: string | RegExp) => page.getByRole("button", { name, exact: typeof name === "string" }),
};

export async function openLive(page: Page, url = "/no/match/live") {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(live.root(page)).toBeVisible({ timeout: 30_000 });
  return response;
}

/** ⋯ → «Avslutt kampen nå» → «Ja, avslutt kampen» (as in e2e/match-lifecycle.spec.ts). */
export async function endMatch(page: Page) {
  await live.button(page, "Kampmeny").click();
  await page.getByRole("button", { name: "Avslutt kampen nå" }).click();
  // The live confirmation sheet (UI-A11Y-02), not a browser dialog.
  await page.getByRole("button", { name: "Ja, avslutt kampen" }).click();
}

export async function storedSetupStatus(page: Page): Promise<string | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? ((JSON.parse(raw) as { status?: string }).status ?? null) : null;
  }, SETUP_KEY);
}

/** Ring fill (0–1) of a player on the pitch, as drawn. */
export async function ringRatio(page: Page, playerId: string): Promise<number> {
  const value = live.token(page, playerId).locator("circle[stroke-dasharray]");
  if ((await value.count()) === 0) return 0;
  const dash = (await value.first().getAttribute("stroke-dasharray")) ?? "0 100";
  return Number(dash.split(" ")[0]) / 100;
}

export async function goalUs(page: Page) {
  await live.button(page, "Mål for oss").click();
}

export async function substitute(page: Page, outId: string, inId: string) {
  await live.token(page, outId).click();
  await live.bench(page, inId).click();
  await expect(live.token(page, inId)).toBeVisible();
}

export async function removeLastGoalUs(page: Page) {
  await live.button(page, "Kampmeny").click();
  await page.getByRole("button", { name: "Fjern siste mål for oss" }).click();
  await page.getByRole("button", { name: "Ja, fjern målet" }).click();
}

export async function endHalf(page: Page) {
  await live.button(page, "Kampmeny").click();
  await page.getByRole("button", { name: "Avslutt omgang", exact: true }).click();
  await page.getByRole("button", { name: "Ja, avslutt omgangen" }).click();
  await expect(live.strip(page)).toHaveAttribute("data-strip", "halfTime");
}

export async function scoreIs(page: Page, us: number, them: number) {
  await expect(live.score(page)).toHaveAttribute("aria-label", `Stilling: oss ${us}, dem ${them}`);
}

export async function hideDevOverlay(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined);
}

export const SHOTS_DIR =
  process.env.FP_A2_SHOTS_DIR ??
  "/private/tmp/claude-501/-Users-schpaux-Claude-FairPlayr/43a03b0e-bb92-4104-b606-10337ad0be18/scratchpad/a2-shots/B";
