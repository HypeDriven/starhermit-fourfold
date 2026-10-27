// The progress document (js/store.js): defaults and the forward merge of an
// older or partial document, the browser build's cloud save text (the
// foreign save the engine client migrates), and the merge of two devices'
// copies. Plus the AI worker (native/ai-worker.js): its answer and the AI
// stream's state after it match the search run on the game's thread.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const S = require('../js/store.js');
const R = require('../js/rules.js'), AI = require('../js/ai.js'), RNG = require('../js/rng.js');

test('a partial or older document is made whole; another version is refused', () => {
  const d = S.normalize({ v: 1, journey: { j01: 2 }, stats: { played: 3 } });
  assert.equal(d.journey.j01, 2);
  assert.deepEqual(d.stats, { played: 3, wins: 0, streak: 0, bestStreak: 0 });
  assert.equal(d.save, null);
  assert.equal(S.normalize({ v: 2 }), null);
  assert.equal(S.normalize(null), null);
  assert.deepEqual(S.defaults(), S.DEFAULT_STORE);
  assert.notEqual(S.defaults(), S.DEFAULT_STORE);
});

test('the browser build\'s cloud save text reads as the document', () => {
  const old = { v: 1, settings: { volume: 0.4 }, journey: { j01: 3 }, challenges: {}, lessons: { 'l-drop': true }, daily: {}, stats: { played: 7, wins: 4, streak: 1, bestStreak: 2 }, achievements: { 'first-line': true }, save: { key: 'practice:steady', seed: 5, drops: [3, 3], elapsedMs: 9000 } };
  const d = S.readText(JSON.stringify(old));
  assert.equal(d.journey.j01, 3);
  assert.equal(d.save.key, 'practice:steady');
  assert.equal(d.settings.muted, false);
  assert.equal(S.readText('not json'), null);
  assert.equal(S.readText(null), null);
});

test('mergeStores keeps the best of both progress documents', () => {
  const remote = { v: 1, journey: { j01: 3, j02: 1 }, challenges: { blitz: 400 }, lessons: { 'l-drop': true }, daily: { '2026-10-15': { score: 300, won: true } },
    stats: { played: 9, wins: 4, streak: 0, bestStreak: 2 }, achievements: { 'first-line': true }, save: null, settings: { volume: 0.1 } };
  const local = { v: 1, journey: { j01: 2, j03: 1 }, challenges: { blitz: 500, budget: 100 }, lessons: { 'l-gravity': true }, daily: { '2026-10-15': { score: 200, won: false } },
    stats: { played: 5, wins: 5, streak: 3, bestStreak: 3 }, achievements: { 'streak-3': true }, save: { key: 'journey:j03', seed: 1, drops: [3], elapsedMs: 10 },
    settings: { volume: 0.9, muted: false, reducedMotion: false, highContrast: false, largeText: false } };
  const m = S.mergeStores(remote, local);
  assert.deepEqual(m.journey, { j01: 3, j02: 1, j03: 1 });
  assert.deepEqual(m.challenges, { blitz: 500, budget: 100 });
  assert.deepEqual(Object.keys(m.lessons).sort(), ['l-drop', 'l-gravity']);
  assert.equal(m.daily['2026-10-15'].score, 300);
  assert.deepEqual(m.stats, { played: 9, wins: 5, bestStreak: 3, streak: 3 });
  assert.deepEqual(Object.keys(m.achievements).sort(), ['first-line', 'streak-3']);
  assert.equal(m.save.key, 'journey:j03', 'this device keeps its game in progress');
  assert.equal(m.settings.volume, 0.9);
  // A fresh device adopting the account's copy keeps the account's game in progress.
  assert.equal(S.mergeStores(local, S.defaults()).save.key, 'journey:j03');
});

function workerRealm() {
  const replies = [];
  const ctx = { postMessage: (m) => replies.push(JSON.parse(JSON.stringify(m))) };
  vm.createContext(ctx);
  for (const f of ['js/rng.js', 'js/ai.js']) vm.runInContext(readFileSync(new URL('../' + f, import.meta.url), 'utf8'), ctx);
  const src = readFileSync(new URL('../native/ai-worker.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '');
  vm.runInContext(src, ctx);
  return { ctx, replies };
}

test('the AI worker answers as the search on the game thread, stream state included', () => {
  const { ctx, replies } = workerRealm();
  const s = R.createGame({ board: { cols: 7, rows: 6 }, players: 2, preset: [3, 2, 3, 4] });
  for (const level of [1, 2, 3, 4]) {
    const rng = RNG.create(777 + level);
    ctx.onmessage({ data: { id: level, kind: 'move', state: JSON.parse(JSON.stringify(s)), level, rng: rng.state } });
    const want = AI.chooseMove(s, level, rng);
    const got = replies.at(-1);
    assert.equal(got.col, want, 'level ' + level);
    assert.equal(got.rng, rng.state, 'stream after level ' + level);
  }
  const rng = RNG.create(9);
  ctx.onmessage({ data: { id: 9, kind: 'hint', state: JSON.parse(JSON.stringify(s)), level: 0, rng: rng.state } });
  assert.equal(replies.at(-1).col, AI.suggestMove(s, rng));
});
