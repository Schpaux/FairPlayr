import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { Device, SHOTS_DIR, THEMES, endMatch, goalUs, hideDevOverlay, net, storedMatch, storedSetupStatus, swStatus } from "./support/offline";
import { firstVisitGuest, startMatchFromSetup } from "./support/flows";

// OFF-01a acceptance 5 and 7: a new build never installs, activates or
// reloads during an active match, not even at a cold start (the update gate:
// the page reports the match to the worker and an update's install is
// refused); after the match ends it installs and is offered. Without a match
// the coach gets one prompt and exactly one reload (in every open tab); old
// caches go; device data is untouched; the kill switch clears and
// unregisters.
//
// "A new build" is simulated in a controlled way: the proxy rewrites the
// served /serwist/sw.js config banner (build id + "-next", or mode "off"),
// so the browser sees a byte-different worker with new cache names that
// precaches the same server's files. A real second `next build` was checked
// manually (see the A2 report); the app code paths are identical.

async function checkForUpdate(page: Page) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
  });
  await expect
    .poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting)), { timeout: 30_000 })
    .toBe(true);
}

async function deviceData(page: Page) {
  return page.evaluate(() => Object.fromEntries(Object.entries(localStorage).sort()));
}

async function ownCaches(page: Page) {
  return page.evaluate(async () => (await caches.keys()).filter((name) => name.startsWith("fp-")).sort());
}

/** Asks for an update that the gate must refuse: nothing installs or waits. */
async function expectUpdateRefused(page: Page) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update().catch(() => undefined);
  });
  await page.waitForTimeout(3000);
  const pending = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return { waiting: Boolean(registration?.waiting), installing: Boolean(registration?.installing) };
  });
  expect(pending).toEqual({ waiting: false, installing: false });
}

/** Document loads (reloads) from now on; same-document URL updates do not count. */
function countNavigations(page: Page) {
  let count = 0;
  page.on("load", () => {
    count += 1;
  });
  return () => count;
}

for (const theme of THEMES) {
  test(`update during an active match: refused, also at a cold start; installs and is offered after the match (${theme})`, async ({}, info) => {
    const device = new Device(info);
    try {
      let { page } = await firstVisitGuest(device, theme);
      const first = await swStatus(page);
      await startMatchFromSetup(page);
      await goalUs(page);
      const before = await storedMatch(page);
      await expect.poll(async () => (await swStatus(page)).matchActive).toBe(true);
      const navigations = countNavigations(page);
      await page.evaluate(() => ((window as unknown as { __fpMarker: number }).__fpMarker = 1));

      await net.swVariant({ suffix: "-next" });
      await expectUpdateRefused(page);
      await expect(page.getByTestId("update-prompt")).toHaveCount(0);
      expect(navigations()).toBe(0);
      expect(await page.evaluate(() => (window as unknown as { __fpMarker?: number }).__fpMarker)).toBe(1);
      expect((await swStatus(page)).buildId).toBe(first.buildId);
      expect((await storedMatch(page)).events).toEqual(before.events);
      expect(await ownCaches(page)).not.toContain(`${first.precacheName}-next`);

      // A plain reload keeps the old worker, and the browser's own check on load is refused too.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("live-sideline")).toBeVisible({ timeout: 30_000 });
      await expectUpdateRefused(page);
      expect((await swStatus(page)).buildId).toBe(first.buildId);
      await expect(page.getByTestId("update-prompt")).toHaveCount(0);

      // Closing and reopening the app mid-match does not activate it either.
      await device.restart(500);
      page = await device.page();
      await page.goto("/no/match/live", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("live-sideline")).toBeVisible({ timeout: 30_000 });
      await expectUpdateRefused(page);
      expect((await swStatus(page)).buildId).toBe(first.buildId);
      expect((await storedMatch(page)).events).toEqual(before.events);
      expect(await ownCaches(page)).toEqual(["fp-meta", first.precacheName].sort());
      await expect(page.getByTestId("update-prompt")).toHaveCount(0);

      // The match ends: the page checks again, the update installs and is offered.
      await hideDevOverlay(page);
      await endMatch(page);
      await expect.poll(() => storedSetupStatus(page)).toBe("ended");
      await page.goto("/no", { waitUntil: "domcontentloaded" });
      await expect.poll(async () => (await swStatus(page)).matchActive, { timeout: 15_000 }).toBe(false);
      await expect
        .poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting)), { timeout: 30_000 })
        .toBe(true);
      await expect(page.getByTestId("update-prompt")).toBeVisible({ timeout: 15_000 });
      expect((await swStatus(page)).buildId).toBe(first.buildId);

      const afterEnd = countNavigations(page);
      await page.getByRole("button", { name: "Oppdater nå" }).click();
      await expect.poll(() => afterEnd(), { timeout: 15_000 }).toBe(1);
      await page.waitForLoadState("domcontentloaded");
      await expect.poll(async () => (await swStatus(page)).buildId).toBe(`${first.buildId}-next`);
      // Ending the match adds exactly one match_ended event; nothing else changed.
      const afterUpdate = (await storedMatch(page)).events as Array<{ type: string }>;
      expect(afterUpdate.filter((event) => event.type !== "match_ended")).toEqual(before.events);
      expect(afterUpdate.filter((event) => event.type === "match_ended")).toHaveLength(1);
    } finally {
      await device.dispose();
    }
  });

  test(`update without a match: prompt, consent, exactly one reload (${theme})`, async ({}, info) => {
    const device = new Device(info);
    try {
      const { page } = await firstVisitGuest(device, theme, { withSetup: false });
      const first = await swStatus(page);
      await page.goto("/no", { waitUntil: "domcontentloaded" });
      await hideDevOverlay(page);
      const dataBefore = await deviceData(page);

      await net.swVariant({ suffix: "-next" });
      await checkForUpdate(page);
      const prompt = page.getByTestId("update-prompt");
      await expect(prompt).toBeVisible();
      await expect(prompt).toContainText("Oppdatering klar");
      expect(await prompt.getAttribute("role")).toBe("status");

      // Under the header, inside the gutter, nothing hidden behind the header.
      const promptBox = (await prompt.boundingBox())!;
      const headerBox = (await page.locator("header").first().boundingBox())!;
      expect(promptBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
      expect(promptBox.x).toBeGreaterThanOrEqual(15);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      if (info.project.name === "iphone-se-375x667") {
        mkdirSync(SHOTS_DIR, { recursive: true });
        await page.screenshot({ path: path.join(SHOTS_DIR, `update-prompt-${theme}-375x667.png`) });
      }
      expect((await swStatus(page)).buildId).toBe(first.buildId);

      // Also counted inside the page: every new document bumps a session counter.
      await page.context().addInitScript(() => {
        sessionStorage.setItem("fp-e2e-docs", String(Number(sessionStorage.getItem("fp-e2e-docs") ?? "0") + 1));
      });
      const navigations = countNavigations(page);
      await page.getByRole("button", { name: "Oppdater nå" }).click();
      await expect.poll(() => navigations(), { timeout: 15_000 }).toBe(1);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(3000);
      expect(navigations(), "exactly one reload").toBe(1);
      expect(await page.evaluate(() => sessionStorage.getItem("fp-e2e-docs")), "one new document").toBe("1");

      expect((await swStatus(page)).buildId).toBe(`${first.buildId}-next`);
      await expect(page.getByTestId("update-prompt")).toHaveCount(0);
      await expect.poll(() => ownCaches(page)).toEqual(["fp-meta", `${first.precacheName}-next`].sort());
      expect(await deviceData(page)).toEqual(dataBefore);
    } finally {
      await device.dispose();
    }
  });
}

test("an update that was waiting before the match: a cold start mid-match keeps serving the old build", async ({}, info) => {
  const device = new Device(info);
  try {
    let { page } = await firstVisitGuest(device, "dark");
    const first = await swStatus(page);
    await page.goto("/no", { waitUntil: "domcontentloaded" });
    await hideDevOverlay(page);

    // The update installs while no match runs; the coach picks «Senere».
    await net.swVariant({ suffix: "-next" });
    await checkForUpdate(page);
    await page.getByRole("button", { name: "Senere" }).click();
    await startMatchFromSetup(page);
    await goalUs(page);
    const before = await storedMatch(page);

    // Closing the app lets the browser activate the waiting build, but it
    // keeps serving the build the match started with.
    await device.restart(500);
    page = await device.page();
    await page.goto("/no/match/live", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("live-sideline")).toBeVisible({ timeout: 30_000 });
    const pinned = await swStatus(page);
    expect(pinned.buildId).toBe(`${first.buildId}-next`);
    expect(pinned.servedBuildId).toBe(first.buildId);
    expect((await storedMatch(page)).events).toEqual(before.events);
    expect(await ownCaches(page)).toEqual(["fp-meta", first.precacheName, `${first.precacheName}-next`].sort());

    // The match ends: the new build is served from the next document on.
    await hideDevOverlay(page);
    await endMatch(page);
    await expect.poll(() => storedSetupStatus(page)).toBe("ended");
    await page.goto("/no", { waitUntil: "domcontentloaded" });
    await expect.poll(async () => (await swStatus(page)).servedBuildId, { timeout: 15_000 }).toBe(`${first.buildId}-next`);
  } finally {
    await device.dispose();
  }
});

test("consent in one tab: every other tab without a match reloads exactly once", async ({}, info) => {
  const device = new Device(info);
  try {
    const { page } = await firstVisitGuest(device, "dark", { withSetup: false });
    const first = await swStatus(page);
    await page.goto("/no", { waitUntil: "domcontentloaded" });
    const other = await device.context!.newPage();
    await other.goto("/no/team", { waitUntil: "domcontentloaded" });
    await expect.poll(() => other.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await hideDevOverlay(page);

    await net.swVariant({ suffix: "-next" });
    await checkForUpdate(page);
    await expect(page.getByTestId("update-prompt")).toBeVisible();

    const here = countNavigations(page);
    const there = countNavigations(other);
    await page.getByRole("button", { name: "Oppdater nå" }).click();
    await expect.poll(() => here(), { timeout: 15_000 }).toBe(1);
    await expect.poll(() => there(), { timeout: 15_000 }).toBe(1);
    await page.waitForTimeout(3000);
    expect(here(), "one reload in the tab that agreed").toBe(1);
    expect(there(), "one reload in the other tab").toBe(1);
    expect((await swStatus(other)).buildId).toBe(`${first.buildId}-next`);
    await expect(other).toHaveURL(/\/no\/team/);
  } finally {
    await device.dispose();
  }
});

test("kill switch: the worker clears our caches and unregisters, device data stays", async ({}, info) => {
  const device = new Device(info);
  try {
    const { page } = await firstVisitGuest(device, "dark");
    await startMatchFromSetup(page);
    await goalUs(page);
    const dataBefore = await deviceData(page);
    const navigations = countNavigations(page);

    await net.swVariant({ suffix: "-kill", mode: "off" });
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), { timeout: 30_000 }).toBe(0);
    await expect.poll(() => ownCaches(page)).toEqual([]);
    expect(navigations(), "the kill switch never reloads").toBe(0);
    expect(await deviceData(page)).toEqual(dataBefore);
    await expect(page.getByTestId("live-sideline")).toBeVisible();
  } finally {
    await device.dispose();
  }
});
