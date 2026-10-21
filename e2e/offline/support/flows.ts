import { expect, type Page } from "@playwright/test";
import { Device, SETUP_KEY, TEAMS_KEY, draftSetup, guestTeam, hideDevOverlay, live, seedDevice, waitForServiceWorker, type Theme } from "./offline";

export const GUEST_IDS = guestTeam().teams[0].players.map((player) => player.id);

/** First online visit as a guest: data on the device, worker installed. */
export async function firstVisitGuest(device: Device, theme: Theme, { withSetup = true } = {}) {
  const page = await device.page();
  await page.goto("/no", { waitUntil: "domcontentloaded" });
  await seedDevice(page, theme, {
    [TEAMS_KEY]: guestTeam(),
    ...(withSetup ? { [SETUP_KEY]: draftSetup("team-e2e", GUEST_IDS) } : {}),
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  const status = await waitForServiceWorker(page);
  return { page, status };
}

/** Setup → Start kamp → Live → Avspark. */
export async function startMatchFromSetup(page: Page, { pickSquad = false } = {}) {
  await page.goto("/no/match/setup", { waitUntil: "domcontentloaded" });
  await hideDevOverlay(page);
  if (pickSquad) {
    // A new setup made on the device: everyone is here today.
    await page.getByRole("button", { name: "Velg alle", exact: true }).click();
    await page.getByRole("button", { name: "Fyll automatisk" }).click();
  }
  const start = page.getByRole("button", { name: /Start kamp/ });
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  await expect(page).toHaveURL(/\/no\/match\/live/, { timeout: 30_000 });
  await expect(live.root(page)).toBeVisible({ timeout: 30_000 });
  await hideDevOverlay(page);
  await live.button(page, "Avspark").click();
  await expect(page.getByRole("button", { name: /^Stopp klokka/ })).toBeVisible();
}

export async function waitForUndoToClose(page: Page) {
  await expect(live.strip(page)).not.toHaveAttribute("data-strip", "undo", { timeout: 10_000 });
}

/** Rows in ⋯ → Hendelser, as text. */
export async function eventHistory(page: Page): Promise<string[]> {
  await live.button(page, "Kampmeny").click();
  await page.getByRole("button", { name: "Hendelser" }).click();
  const dialog = page.getByRole("dialog", { name: "Hendelser" });
  await expect(dialog).toBeVisible();
  const rows = (await dialog.locator("li").allTextContents()).map((text) => text.replace(/\s+/g, " ").trim());
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  return rows;
}
