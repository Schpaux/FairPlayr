import { expect, test } from "@playwright/test";
import { measureUi, regressions } from "./support/uiAudit";

// STAB-06 canary: proves each detector of the UI guard fires on a known-bad
// fixture and stays quiet on a known-good one, so a refactor (or a moved lime
// token) cannot blind the guard without failing here. Static HTML only; no
// app server state is involved.

const LIME = "#9FE870";

const FIXTURE = `
<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
<html><body style="margin:0;background:#F9FAF8;font:16px sans-serif">
  <div>
    <header><a href="/" style="display:inline-block;height:30px">Logo</a></header>
    <main>
      <button id="small" style="height:30px;width:120px">Liten</button>
      <button style="height:52px;width:120px">Stor</button>
      <p style="font-size:11px">Bitteliten tekst</p>
      <p style="font-size:13px">Grensen er grei</p>
      <p style="color:${LIME}">Lime på lyst</p>
      <div style="background:#121B16"><p style="color:${LIME}">Lime på mørkt</p></div>
      <label style="position:relative;display:inline-block;height:30px;width:80px">
        <input type="radio" name="r" style="position:absolute;inset:0;opacity:0;margin:0">Valg
      </label>
      <div style="position:relative">
        <button style="height:20px;width:20px">x</button>
        <div style="position:absolute;inset:-10px;background:#000"></div>
      </div>
      <div style="width:600px">Bred</div>
    </main>
  </div>
</body></html>`;

test("the UI guard flags every category on a bad fixture", async ({ page }) => {
  await page.setContent(FIXTURE);
  const findings = await measureUi(page);

  expect(findings.page.targets).toEqual({ 'button "Liten"': 1, 'input[radio] "Valg"': 1 });
  expect(findings.chrome.targets).toEqual({ 'a "Logo"': 1 });
  expect(findings.page.smallText).toEqual({ 'p "Bitteliten tekst"': 1 });
  // Lime text on a light surface is flagged; on a dark surface it is allowed (ok-text in dark).
  expect(findings.page.limeText).toEqual({ 'p "Lime på lyst"': 1 });
  expect(findings.overflowPx).toBeGreaterThan(0);

  // A known deviation passes; one more of it, or a new one, is a regression.
  expect(regressions(findings.page.targets, { 'button "Liten"': 1, 'input[radio] "Valg"': 1 })).toEqual([]);
  expect(regressions(findings.page.targets, { 'button "Liten"': 1 })).toHaveLength(1);
  expect(regressions({ 'button "Liten"': 2 }, { 'button "Liten"': 1 })).toHaveLength(1);
});

test("the UI guard is quiet on a good fixture", async ({ page }) => {
  await page.setContent(`
    <!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><html><body style="margin:0;background:#F9FAF8;font:16px sans-serif">
      <div><main>
        <button style="height:52px;width:120px;background:${LIME};color:#0B2E1A">Start kamp</button>
        <p style="font-size:14px">Les meg</p>
      </main></div>
    </body></html>`);
  const findings = await measureUi(page);
  expect(findings.page).toEqual({ targets: {}, smallText: {}, limeText: {} });
  expect(findings.chrome).toEqual({ targets: {}, smallText: {}, limeText: {} });
  expect(findings.overflowPx).toBe(0);
});
