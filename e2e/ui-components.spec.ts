import { expect, test, type Page } from "@playwright/test";
import no from "../messages/no.json";

// UI-FOUND-01: the shared primitives in a real browser, on the development
// gallery (/no/dev/ui), in both themes at every project viewport. Covers what
// jsdom cannot: the focus trap under Tab, Escape and focus return, scrim
// dismissal, arrow keys in the radio group, and reduced motion. Screenshots
// of every state go to test-results/ui-components/.

const g = no.uiGallery;
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

async function openGallery(page: Page, theme: Theme) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((t) => {
    try {
      window.localStorage.setItem("theme", t);
    } catch {
      // Storage can be unavailable; the theme check below then fails.
    }
  }, theme);
  await page.goto("/no/dev/ui", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-testid="ui-gallery"][data-hydrated="true"]')).toBeVisible({ timeout: 30_000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
  return errors;
}

function shot(page: Page, project: string, theme: Theme, name: string, fullPage = false) {
  return page.screenshot({ path: `test-results/ui-components/${project}-${theme}-${name}.png`, fullPage });
}

// base-ui wraps the trap in hidden focus guards; Tab lands on a guard for a
// moment and is sent back into the sheet, so poll for the settled position.
const focusedInside = (page: Page, testId: string) =>
  page.evaluate((id) => !!document.querySelector(`[data-testid="${id}"]`)?.contains(document.activeElement), testId);

for (const theme of THEMES) {
  test.describe(`UI primitives, ${theme}`, () => {
    test("gallery renders every primitive", async ({ page }, testInfo) => {
      const errors = await openGallery(page, theme);
      for (const id of ["buttons", "sheets", "notices", "lists", "empty", "skeleton", "segmented"]) {
        await expect(page.getByTestId(`gallery-${id}`)).toBeVisible();
      }
      await shot(page, testInfo.project.name, theme, "gallery", true);
      expect(errors).toEqual([]);
    });

    test("sheet: keyboard open, focus trap, Escape and focus return", async ({ page }, testInfo) => {
      await openGallery(page, theme);
      const trigger = page.getByTestId("gallery-open-sheet");
      await trigger.focus();
      await page.keyboard.press("Enter");

      const sheet = page.getByRole("dialog", { name: g.sheetTitle });
      await expect(sheet).toBeVisible();
      await expect(sheet).toHaveAccessibleDescription(g.sheetBody);
      await expect(page.getByRole("heading", { name: g.sheetTitle })).toBeFocused();
      await shot(page, testInfo.project.name, theme, "sheet");

      // Tab and Shift+Tab never leave the sheet.
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press("Tab");
        await expect.poll(() => focusedInside(page, "gallery-sheet")).toBe(true);
      }
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press("Shift+Tab");
        await expect.poll(() => focusedInside(page, "gallery-sheet")).toBe(true);
      }

      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(trigger).toBeFocused();
    });

    test("sheet: the close button closes and returns focus", async ({ page }) => {
      await openGallery(page, theme);
      const trigger = page.getByTestId("gallery-open-sheet");
      await trigger.click();
      await page.getByRole("dialog").getByRole("button", { name: no.ui.sheet.close }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(trigger).toBeFocused();
    });

    test("confirm sheet: outcome first, cancel under it, scrim cancels", async ({ page }, testInfo) => {
      await openGallery(page, theme);
      await page.getByTestId("gallery-open-confirm").click();
      const dialog = page.getByRole("dialog", { name: g.confirmTitle });
      await expect(dialog).toBeVisible();
      await shot(page, testInfo.project.name, theme, "confirm");

      const confirm = dialog.getByRole("button", { name: g.destructive });
      const cancel = dialog.getByRole("button", { name: no.ui.confirm.cancel });
      const [confirmBox, cancelBox] = [await confirm.boundingBox(), await cancel.boundingBox()];
      expect(confirmBox!.y).toBeLessThan(cancelBox!.y);
      expect(confirmBox!.height).toBeGreaterThanOrEqual(52);

      // A tap on the scrim (above the sheet) cancels without confirming.
      await page.mouse.click(20, 20);
      await expect(dialog).toBeHidden();
      await expect(page.getByTestId("gallery-confirmed")).toHaveCount(0);

      await page.getByTestId("gallery-open-confirm").click();
      await page.getByRole("dialog").getByRole("button", { name: g.destructive }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(page.getByTestId("gallery-confirmed")).toBeVisible();
      await expect(page.getByTestId("gallery-open-confirm")).toBeFocused();
    });

    test("page behind an open sheet is inert", async ({ page }) => {
      await openGallery(page, theme);
      await page.getByTestId("gallery-open-sheet").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      // The gallery's own buttons are hidden from assistive tech while the sheet is open.
      await expect(page.getByRole("button", { name: g.openConfirm })).toHaveCount(0);
    });

    test("segmented choice: arrow keys move the selection", async ({ page }) => {
      await openGallery(page, theme);
      const group = page.getByTestId("gallery-segmented").getByRole("radiogroup").or(
        page.getByTestId("gallery-segmented").getByRole("group", { name: g.segmentedLabel }),
      );
      await expect(group).toBeVisible();
      const seven = group.getByRole("radio", { name: "7v7" });
      await expect(seven).toBeChecked();
      await seven.focus();
      await page.keyboard.press("ArrowRight");
      await expect(group.getByRole("radio", { name: "9v9" })).toBeChecked();
      await expect(group.getByRole("radio", { name: "9v9" })).toBeFocused();
      const segment = await group.getByRole("radio", { name: "9v9" }).boundingBox();
      expect(segment!.height).toBeGreaterThanOrEqual(44);
    });

    test("notice: dismissed by its 44px button", async ({ page }) => {
      await openGallery(page, theme);
      const notice = page.getByTestId("gallery-notice-info");
      await expect(notice).toHaveAttribute("role", "status");
      const dismiss = notice.getByRole("button", { name: no.ui.notice.dismiss });
      const box = await dismiss.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await dismiss.click();
      await expect(notice).toHaveCount(0);
    });

    test("reduced motion: the sheet appears without a slide", async ({ page }) => {
      await openGallery(page, theme);
      await page.getByTestId("gallery-open-sheet").click();
      const duration = await page.getByTestId("gallery-sheet").evaluate((el) => getComputedStyle(el).transitionDuration);
      expect(parseFloat(duration)).toBeLessThanOrEqual(0.001);
    });

    test.describe("with motion", () => {
      test.use({ contextOptions: { reducedMotion: "no-preference" } });

      test("the sheet slides with the 260ms sheet token and buttons press at 90ms", async ({ page }) => {
        await openGallery(page, theme);
        const pressDuration = await page
          .getByRole("button", { name: g.secondary })
          .evaluate((el) => getComputedStyle(el).transitionDuration);
        expect(pressDuration.split(",")[0].trim()).toBe("0.09s");
        await page.getByTestId("gallery-open-sheet").click();
        const duration = await page.getByTestId("gallery-sheet").evaluate((el) => getComputedStyle(el).transitionDuration);
        expect(duration).toBe("0.26s");
      });
    });
  });
}
