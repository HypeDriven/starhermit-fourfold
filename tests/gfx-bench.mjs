// Graphics benchmark hook for tools/gfx-bench.mjs (dev-only): picks a preset in Settings → Graphics,
// plays Steady AI through the visible column buttons (discs drop, landing puffs fire, the AI replies)
// and starts a new game from the results overlay whenever one ends, so the win sparkles also run.
export const presets = ['low', 'balanced', 'high', 'ultra'];
export const levels = { low: 0, balanced: 4, high: 10, ultra: 17 };

export async function setPreset(page, preset) {
  await page.waitForFunction(() => window.__ffReady === true, null, { timeout: 30000 });
  await page.locator('header [data-goto="settings"]').click();
  await page.locator('#screen-settings.active').waitFor();
  await page.locator('#gfx-preset').selectOption(preset);
  await page.waitForFunction((p) => document.body.dataset.gfxPreset === p, preset);
  await page.locator('#screen-settings [data-goto="title"]').click();
  await page.locator('#screen-title.active').waitFor();
}

async function newGame(page) {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: /Steady AI/ }).click();
  await page.locator('#screen-play.active').waitFor();
}

export async function start(page) {
  await newGame(page);
  let stopped = false;
  page.once('close', () => { stopped = true; });
  (async () => {
    while (!stopped) {
      try {
        if (await page.locator('#overlay-results.active').count()) {
          await page.waitForTimeout(1500); // let the win sparkles run
          await page.locator('#res-menu').click();
          await page.locator('#screen-title.active').waitFor();
          await newGame(page);
        } else {
          const col = await page.evaluate(() => {
            const btns = [...document.querySelectorAll('#col-layer button')].filter((b) => !b.disabled);
            return btns.length ? +btns[Math.floor(Math.random() * btns.length)].dataset.col : -1;
          });
          if (col >= 0) await page.locator('#col-layer button').nth(col).click({ timeout: 1000 });
        }
      } catch { /* screen changing */ }
      await new Promise((r) => setTimeout(r, 450));
    }
  })();
  await page.waitForTimeout(500);
}
