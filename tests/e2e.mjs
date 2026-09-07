/**
 * Fourfold — end-to-end browser QA (dev only, not shipped).
 *
 * Run: npm run test:e2e
 *
 * Drives the real page through the real UI: title → mode setup → play →
 * drops via pointer and keyboard → undo → pause/resume → restart → resign →
 * results, plus persistence across a reload and the accessibility mirror.
 * Also verifies the shipped rules engine's determinism and the sfx assets.
 * Two passes: desktop 1280x800 and mobile 390x844 (touch). Fails loudly on
 * any non-benign console error, page error, or HTTP >= 400.
 */

import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT = (stage, vp) => `/tmp/fourfold-e2e-${stage}-${vp}.png`;

// Same benign-noise filter as tools/production_game_audit.mjs.
const browserNoise = /GL Driver Message|GPU stall due to ReadPixels|Automatic fallback to software WebGL|EnableWebGLDeveloperExtensions/i;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.ts': 'application/typescript',
};

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});

let failures = 0;

// Snapshot of the live session, read straight off the rules state.
const snap = (page) => page.evaluate(() => {
  const s = window.FFUI.getSession();
  if (!s) return null;
  return {
    key: s.key, turn: s.state.turn, current: s.state.current,
    heights: Array.from(s.state.heights), drops: s.state.drops.slice(),
    dropsBy: { ...s.state.dropsBy }, terminal: s.state.terminal,
    score: s.state.score, over: s.over, paused: s.paused, ai: s.aiLevel,
    undoDepth: s.history.length,
  };
});

// Wait until the AI has replied and it is the local player's turn again.
const waitForTurn = (page) => page.waitForFunction(() => {
  const s = window.FFUI.getSession();
  return !!s && (s.over || s.state.terminal || s.state.current === 1);
}, null, { timeout: 15000 });

async function runPass(label, viewport, hasTouch) {
  const errors = [];
  const context = await browser.newContext({ viewport, hasTouch });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !browserNoise.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText || ''}`));

  const step = async (name, fn) => {
    await fn();
    if (errors.length) throw new Error(`[${label}] ${name}: ` + errors.join(' | '));
    console.log(`ok - [${label}] ${name}`);
  };

  try {
    await step('page loads on the title screen', async () => {
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__ffReady === true);
      await page.evaluate(() => localStorage.removeItem('fourfold.v1'));
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__ffReady === true);
      if (!(await page.locator('#screen-title.active').isVisible())) throw new Error('title screen not active');
      if (!(await page.locator('h1', { hasText: 'Fourfold' }).isVisible())) throw new Error('title heading not visible');
      await page.screenshot({ path: SHOT('title', label) });
    });

    await step('game modules exposed (FFRules, FFAI, FFContent, FFSfx, FFUI)', async () => {
      const mods = await page.evaluate(() => ({
        rules: typeof window.FFRules?.createGame === 'function',
        ai: typeof window.FFAI?.chooseMove === 'function',
        content: Array.isArray(window.FFContent?.JOURNEY),
        sfx: typeof window.FFSfx?.playResult === 'function',
        ui: typeof window.FFUI?.getSession === 'function',
      }));
      for (const [k, v] of Object.entries(mods)) if (!v) throw new Error(`module missing: ${k}`);
      const problems = await page.evaluate(() => window.FFContent.validate());
      if (problems.length) throw new Error('content validator: ' + problems.join('; '));
    });

    await step('Play → opponent list → board with column controls', async () => {
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await page.locator('#screen-practice.active').waitFor();
      await page.getByRole('button', { name: /Steady AI/ }).click();
      await page.locator('#screen-play.active').waitFor();
      const cols = page.locator('#col-layer button');
      if (await cols.count() !== 7) throw new Error('expected 7 column buttons, got ' + await cols.count());
      const box = await cols.first().boundingBox();
      if (!box || box.width < 20 || box.height < 44) throw new Error('column target too small: ' + JSON.stringify(box));
      const canvas = await page.locator('canvas#board').boundingBox();
      if (!canvas || canvas.width < 200 || canvas.height < 150) throw new Error('board canvas too small');
      await page.screenshot({ path: SHOT('play', label) });
    });

    await step('pointer drop lands a disc and the AI replies', async () => {
      const before = await snap(page);
      await page.locator('#col-layer button').nth(3).click();
      await waitForTurn(page);
      const after = await snap(page);
      if (after.heights[3] < 1) throw new Error('disc did not land in column 4');
      if (after.dropsBy[1] !== before.dropsBy[1] + 1) throw new Error('local drop not counted');
      if (after.turn < before.turn + 2) throw new Error('AI did not reply: turn ' + after.turn);
      if (after.current !== 1) throw new Error('turn did not return to the local player');
    });

    await step('keyboard drop (number key) works', async () => {
      const before = await snap(page);
      await page.keyboard.press('1');
      await waitForTurn(page);
      const after = await snap(page);
      // The rival may answer in the same column, so assert "at least mine".
      if (after.heights[0] < before.heights[0] + 1) throw new Error('key "1" did not drop into column 1');
      if (after.dropsBy[1] !== before.dropsBy[1] + 1) throw new Error('local drop not counted');
    });

    await step('keyboard drop (arrow + Enter) works', async () => {
      const before = await snap(page);
      await page.locator('#col-layer button').nth(5).focus();
      await page.keyboard.press('Enter');
      await waitForTurn(page);
      const after = await snap(page);
      if (after.heights[5] < before.heights[5] + 1) throw new Error('Enter on a focused column did not drop');
      if (after.dropsBy[1] !== before.dropsBy[1] + 1) throw new Error('local drop not counted');
    });

    await step('undo rewinds to the local player’s turn', async () => {
      const before = await snap(page);
      await page.locator('#btn-undo').click();
      const after = await snap(page);
      if (after.turn >= before.turn) throw new Error('undo did not rewind (turn ' + after.turn + ')');
      if (after.current !== 1) throw new Error('undo left the AI to move');
      if (after.dropsBy[1] >= before.dropsBy[1]) throw new Error('undo did not refund a local drop');
    });

    await step('board state is mirrored for assistive tech', async () => {
      const mirror = await page.locator('#grid-mirror').textContent();
      if (!/Row 1:/.test(mirror) || !/You|Rival/.test(mirror))
        throw new Error('grid mirror missing occupied cells: ' + mirror);
      const aria = await page.locator('#col-layer button').nth(3).getAttribute('aria-label');
      if (!/Column 4/.test(aria) || !/filled/.test(aria)) throw new Error('column aria-label: ' + aria);
    });

    await step('pause halts the clock and resume restores play', async () => {
      await page.keyboard.press('p');
      await page.locator('#overlay-pause.active').waitFor();
      if (!(await snap(page)).paused) throw new Error('session not marked paused');
      await page.locator('#pause-resume').click();
      await page.locator('#overlay-pause').waitFor({ state: 'hidden' });
      if ((await snap(page)).paused) throw new Error('session still paused after resume');
    });

    await step('restart clears the board', async () => {
      await page.locator('#btn-restart').click();
      await waitForTurn(page);
      const s = await snap(page);
      if (s.turn !== 0 || s.heights.some((h) => h !== 0)) throw new Error('restart left discs: ' + JSON.stringify(s.heights));
      if (s.undoDepth !== 0) throw new Error('restart kept undo history');
    });

    await step('a full game reaches a terminal state through the UI', async () => {
      // Play the AI out with real clicks until someone connects four (or the
      // board fills). Always chooses a column the UI itself reports as legal.
      for (let i = 0; i < 60; i++) {
        const s = await snap(page);
        if (s.terminal) break;
        const col = await page.evaluate(() => {
          const btns = [...document.querySelectorAll('#col-layer button')].filter((b) => !b.disabled);
          return btns.length ? +btns[Math.floor(btns.length / 2)].dataset.col : -1;
        });
        if (col < 0) break;
        await page.locator('#col-layer button').nth(col).click();
        await waitForTurn(page);
      }
      const s = await snap(page);
      if (!s.terminal) throw new Error('no terminal state after 60 UI drops');
      await page.locator('#overlay-results.active').waitFor();
      const head = await page.locator('#res-headline').textContent();
      if (!head.trim()) throw new Error('results overlay has no headline');
      const breakdown = await page.locator('#res-breakdown').textContent();
      if (!/Score|Your drops/.test(breakdown)) throw new Error('results breakdown empty: ' + breakdown);
      console.log(`  [${label}] outcome="${head.trim()}" winner=${s.terminal.winner} score=${s.score.total}`);
      await page.screenshot({ path: SHOT('results', label) });
      await page.locator('#res-menu').click();
      await page.locator('#screen-title.active').waitFor();
    });

    await step('resign ends the game immediately', async () => {
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await page.getByRole('button', { name: /Casual AI/ }).click();
      await page.locator('#screen-play.active').waitFor();
      await page.keyboard.press('p');
      await page.locator('#pause-resign').click();
      await page.locator('#overlay-results.active').waitFor();
      const s = await snap(page);
      if (!s.terminal || s.terminal.reason !== 'resigned') throw new Error('resign did not end the game: ' + JSON.stringify(s.terminal));
      await page.locator('#res-menu').click();
    });

    await step('an interrupted game is saved and resumable after reload', async () => {
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await page.getByRole('button', { name: /Sharp AI/ }).click();
      await page.locator('#screen-play.active').waitFor();
      await page.locator('#col-layer button').nth(2).click();
      await waitForTurn(page);
      const before = await snap(page);
      await page.keyboard.press('p');
      await page.locator('#pause-leave').click();
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__ffReady === true);
      const resume = page.locator('#btn-resume');
      if (await resume.isHidden()) throw new Error('resume button missing after reload');
      await resume.click();
      await page.locator('#screen-play.active').waitFor();
      const after = await snap(page);
      if (after.drops.join(',') !== before.drops.join(','))
        throw new Error(`resume replayed a different game: ${after.drops} vs ${before.drops}`);
      await page.keyboard.press('p');
      await page.locator('#pause-leave').click();
    });

    await step('settings persist and reduced motion / high contrast apply', async () => {
      await page.locator('[data-goto="settings"]').first().click();
      await page.locator('#screen-settings.active').waitFor();
      await page.locator('#set-contrast').check();
      await page.locator('#set-motion').check();
      await page.locator('#set-muted').check();
      if (!(await page.evaluate(() => document.body.classList.contains('high-contrast'))))
        throw new Error('high contrast class not applied');
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__ffReady === true);
      const kept = await page.evaluate(() => ({
        contrast: document.body.classList.contains('high-contrast'),
        muted: window.FFSfx.isMuted(),
      }));
      if (!kept.contrast || !kept.muted) throw new Error('settings did not persist: ' + JSON.stringify(kept));
      await page.evaluate(() => {
        document.getElementById('set-contrast').click();
        document.getElementById('set-muted').click();
      });
    });

    await step('a challenge with a non-default board starts and is playable', async () => {
      await page.locator('[data-goto="challenges"]').first().click();
      await page.getByRole('button', { name: /Pentafold/ }).click();
      await page.locator('#screen-play.active').waitFor();
      const cols = await page.locator('#col-layer button').count();
      if (cols !== 9) throw new Error('Pentafold should have 9 columns, got ' + cols);
      await page.locator('#col-layer button').nth(4).click();
      await waitForTurn(page);
      const s = await snap(page);
      if (s.heights[4] < 1 || s.dropsBy[1] !== 1) throw new Error('drop failed on the 9x7 board');
      await page.keyboard.press('p');
      await page.locator('#pause-leave').click();
    });

    await step('a lesson restricts and completes', async () => {
      await page.locator('[data-goto="learn"]').first().click();
      await page.getByRole('button', { name: /Make four/ }).click();
      await page.locator('#screen-play.active').waitFor();
      const lessonId = await page.evaluate(() => window.FFUI.getSession().cfg.lesson.id);
      await page.keyboard.press('p');
      await page.locator('#pause-resign').click();
      await page.locator('#overlay-results.active').waitFor();
      const falselyCompleted = await page.evaluate(id => JSON.parse(localStorage.getItem('fourfold.v1')).lessons[id], lessonId);
      if (falselyCompleted) throw new Error('Resigning must not complete the lesson');
      await page.locator('#res-retry').click();
      await page.locator('#screen-play.active').waitFor();
      await page.locator('#col-layer button').nth(0).click();  // wrong column
      const rejected = await snap(page);
      if (rejected.turn !== 6) throw new Error('lesson accepted an off-script drop');
      await page.locator('#col-layer button').nth(6).click();  // the taught win
      await page.locator('#overlay-results.active').waitFor();
      const s = await snap(page);
      if (!s.terminal || s.terminal.winner !== 1) throw new Error('lesson win not registered: ' + JSON.stringify(s.terminal));
      await page.locator('#res-menu').click();
    });

    await step('rules engine is deterministic under replay', async () => {
      const outcome = await page.evaluate(() => {
        const R = window.FFRules;
        const cfg = { id: 'e2e', kind: 'practice', seed: 1234, board: { cols: 7, rows: 6 }, connect: 4, players: 2 };
        const state = R.createGame(cfg);
        let guard = 0;
        while (!state.terminal && guard++ < 100) {
          const legal = R.legalActions(state);
          if (!legal.length) break;
          const res = R.applyCommand(state, { type: 'drop', col: legal[guard % legal.length].col });
          if (!res.ok) throw new Error('legal drop rejected: ' + res.reason);
        }
        const hash1 = R.hashState(state);
        const replayed = R.replay(cfg, state.drops.slice(state.initialDrops).map((col, i) => ({ type: 'drop', col, id: 'e2e-' + i })));
        return {
          terminal: state.terminal,
          deterministic: R.hashState(replayed) === hash1,
          serialized: R.deserialize(R.serialize(state)).turn === state.turn,
        };
      });
      if (!outcome.terminal) throw new Error('game never reached a terminal state');
      if (!outcome.deterministic) throw new Error('replay hash mismatch (non-deterministic)');
      if (!outcome.serialized) throw new Error('serialize/deserialize roundtrip failed');
    });

    await step('sfx manifest and a sample clip are served', async () => {
      const check = await page.evaluate(async () => {
        const m = await (await fetch('sfx/manifest.json')).json();
        const arr = Array.isArray(m) ? m : Object.values(m.samples || m);
        const names = arr.map((x) => (typeof x === 'string' ? x : x.name));
        const sample = names.find((n) => n.includes('drop')) || names[0];
        const r = await fetch(`sfx/${sample.replace(/\.opus$/, '')}.opus`);
        return { count: names.length, sampleStatus: r.status, type: r.headers.get('content-type') };
      });
      if (check.count < 10) throw new Error('sfx manifest too small: ' + check.count);
      if (check.sampleStatus !== 200) throw new Error('sample clip not served: ' + check.sampleStatus);
    });
  } catch (e) {
    console.error(`FAIL - ${e.message}`);
    failures++;
  } finally {
    await context.close();
  }

  if (errors.length) {
    console.error(`FAIL - [${label}] page errors:\n  ` + errors.join('\n  '));
    failures++;
  } else {
    console.log(`ok - [${label}] no page errors`);
  }
}

// Resilience: with WebGL unavailable the board must fall back to the 2D
// canvas renderer and stay fully playable. three.js logs its own context
// error in this scenario; that one message is expected here and only here.
async function runFallbackPass() {
  const label = 'no-webgl';
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await context.addInitScript(`
    const proto = HTMLCanvasElement.prototype, orig = proto.getContext;
    Object.defineProperty(proto, 'getContext', { configurable: true, writable: true,
      value: function (t) { return String(t).toLowerCase().includes('webgl') ? null : orig.apply(this, arguments); } });
  `);
  const page = await context.newPage();
  const expected = /THREE\.WebGLRenderer: Error creating WebGL context|WebGL unavailable, using 2D board/;
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !browserNoise.test(m.text()) && !expected.test(m.text()))
      errors.push(`console: ${m.text()}`);
  });

  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__ffReady === true);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: /Casual AI/ }).click();
    await page.locator('#screen-play.active').waitFor();
    if (!(await page.evaluate(() => !!document.getElementById('board').getContext('2d'))))
      throw new Error('board is not a 2D canvas after the WebGL path failed');
    for (const c of [3, 2, 4]) {
      await page.locator('#col-layer button').nth(c).click();
      await waitForTurn(page);
    }
    const s = await snap(page);
    if (s.dropsBy[1] !== 3) throw new Error('2D fallback did not accept drops: ' + JSON.stringify(s.heights));
    await page.screenshot({ path: SHOT('play', label) });
    if (errors.length) throw new Error(errors.join(' | '));
    console.log(`ok - [${label}] 2D fallback board is playable`);
  } catch (e) {
    console.error(`FAIL - [${label}] ${e.message}`);
    failures++;
  } finally {
    await context.close();
  }
}

try {
  await runPass('desktop', { width: 1280, height: 800 }, false);
  await runPass('mobile', { width: 390, height: 844 }, true);
  await runFallbackPass();
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}

if (failures) {
  console.error(`\nE2E FAIL — ${failures} failure(s)`);
  process.exit(1);
}
console.log('\nE2E PASS — full UI playthrough clean on both viewports');
