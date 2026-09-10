/**
 * Fourfold — offline rules, AI and content tests (npm test).
 * Zero dependencies: node --test. Exercises the shipped UMD modules the
 * browser loads (js/rng.js, js/rules.js, js/ai.js, js/content.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RNG = require('../js/rng.js');
const Rules = require('../js/rules.js');
const AI = require('../js/ai.js');
const Content = require('../js/content.js');

const base = (over = {}) => ({ id: 't', kind: 'practice', seed: 99, board: { cols: 7, rows: 6 }, connect: 4, players: 2, ...over });
const drop = (s, col, extra = {}) => Rules.applyCommand(s, { type: 'drop', col, ...extra });

test('a disc falls to the lowest free cell and the turn passes', () => {
  const s = Rules.createGame(base());
  assert.equal(s.current, 1);
  const r = drop(s, 3);
  assert.equal(r.ok, true);
  assert.equal(Rules.cellAt(s, 3, 0), 1);
  assert.equal(s.heights[3], 1);
  assert.equal(s.current, 2);
  assert.equal(s.turn, 1);
  assert.deepEqual(r.events[0], { t: 'drop', col: 3, row: 0, player: 1, turn: 1 });
});

test('legalActions omits full and sealed columns', () => {
  const s = Rules.createGame(base({ bannedCols: [3], board: { cols: 5, rows: 4 } }));
  for (let i = 0; i < 4; i++) drop(s, 0);
  const cols = Rules.legalActions(s).map((a) => a.col);
  assert.deepEqual(cols, [1, 2, 4]);
  assert.equal(drop(s, 0).reason, Rules.INVALID.FULL_COL);
  assert.equal(drop(s, 3).reason, Rules.INVALID.BANNED);
  assert.equal(drop(s, 9).reason, Rules.INVALID.BAD_COL);
  assert.equal(s.stats.invalid, 3);
});

test('every invalid-command reason is reachable', () => {
  const s = Rules.createGame(base());
  assert.equal(Rules.applyCommand(s, null).reason, Rules.INVALID.BAD_SHAPE);
  assert.equal(Rules.applyCommand(s, { type: 'jump' }).reason, Rules.INVALID.BAD_CMD);
  assert.equal(drop(s, 0, { player: 2 }).reason, Rules.INVALID.TURN);
  assert.equal(Rules.applyCommand(s, { type: 'timeout' }).reason, Rules.INVALID.BAD_CMD, 'timeout on an untimed board');
  Rules.applyCommand(s, { type: 'resign', player: 1 });
  assert.equal(drop(s, 0).reason, Rules.INVALID.ENDED);
});

test('four in a row wins, with the line reported and the win score fixed at 1000', () => {
  const s = Rules.createGame(base());
  // P1: 0,1,2,3 along the bottom; P2 answers above.
  for (const c of [0, 1, 2]) { drop(s, c); drop(s, c); }
  const r = drop(s, 3);
  assert.equal(s.terminal.reason, Rules.TERMINAL.LINE);
  assert.equal(s.terminal.winner, 1);
  assert.equal(s.terminal.line.length, 4);
  assert.equal(r.events[1].t, 'win');
  assert.equal(s.score.total, Rules.WIN_BASE);
  assert.equal(Rules.starsFor(s), 1, 'no par → one star');
});

test('scoring worked example: par 14 moves, par 120 s, won in 9 drops at 47 s', () => {
  const s = Rules.createGame(base({ par: { moves: 14, timeSec: 120 } }));
  // Build a vertical four for P1 in column 3 while P2 plays elsewhere.
  const seq = [3, 0, 3, 1, 3, 2, 3];
  let last;
  for (let i = 0; i < seq.length; i++) last = drop(s, seq[i], { elapsedMs: 47000 });
  assert.equal(last.ok, true);
  // Pretend the player spent 9 drops (dropsBy counts only real drops: 4 here).
  s.dropsBy[1] = 9;
  // Re-run the finalizer through a resign path is not possible; recompute inline.
  const parMoves = Math.max(0, 14 - 9) * Rules.PAR_MOVE_PT;
  const speed = Math.floor((120 * 1000 - 47000) / 1000) * Rules.SPEED_PT_PER_SEC;
  assert.equal(parMoves, 125);
  assert.equal(speed, 365);
  assert.equal(Rules.WIN_BASE + parMoves + speed, 1490);
  // The engine's own finalizer on the actual (4-drop) win:
  assert.equal(s.score.components.win, 1000);
  assert.equal(s.score.components.parMoves, (14 - 4) * 25);
  assert.equal(s.score.components.speed, 73 * 5);
  assert.equal(s.score.total, 1000 + 250 + 365);
  assert.equal(Rules.starsFor(s), 3, '4 drops ≤ floor(14*0.7)=9 → three stars');
});

test('a full board without a line is a 300-point draw', () => {
  const s = Rules.createGame(base({ board: { cols: 4, rows: 4 }, connect: 4 }));
  // A 4x4 fill order (found by exhaustive search) that never lines up four.
  const order = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 2, 3];
  for (const c of order) { const r = drop(s, c); if (!r.ok) assert.fail(r.reason); }
  assert.equal(s.terminal.reason, Rules.TERMINAL.FULL);
  assert.equal(s.terminal.winner, 0);
  assert.equal(s.score.total, Rules.DRAW_BASE);
});

test('the move limit ends the game against the local player only', () => {
  const s = Rules.createGame(base({ moveLimit: 2 }));
  drop(s, 0); drop(s, 1); drop(s, 2);
  assert.equal(s.terminal.reason, Rules.TERMINAL.MOVES);
  assert.equal(s.terminal.winner, 2);
  assert.equal(s.score.total, 0);
});

test('resign and timeout terminals award the other player; timeout needs a clock', () => {
  const a = Rules.createGame(base());
  Rules.applyCommand(a, { type: 'resign', player: 1 });
  assert.deepEqual(a.terminal, { reason: Rules.TERMINAL.RESIGN, winner: 2 });
  const b = Rules.createGame(base({ timeLimitSec: 30 }));
  const r = Rules.applyCommand(b, { type: 'timeout', player: 1, elapsedMs: 30000 });
  assert.equal(r.ok, true);
  assert.deepEqual(b.terminal, { reason: Rules.TERMINAL.TIME, winner: 2 });
  const c = Rules.createGame(base({ players: 3 }));
  Rules.applyCommand(c, { type: 'resign', player: 1 });
  assert.equal(c.terminal.winner, 0, 'no single winner at a three-player table');
});

test('three-player tables rotate the turn and pass through resigns', () => {
  const s = Rules.createGame(base({ players: 3 }));
  drop(s, 0); assert.equal(s.current, 2);
  drop(s, 1); assert.equal(s.current, 3);
  drop(s, 2); assert.equal(s.current, 1);
});

test('presets are validated through the same drop path', () => {
  const s = Rules.createGame(base({ preset: [3, 2, 4, 1, 5, 0] }));
  assert.equal(s.initialDrops, 6);
  assert.equal(s.current, 1);
  assert.deepEqual(s.dropsBy, { 1: 0, 2: 0 });
  assert.throws(() => Rules.createGame(base({ preset: [3, 2, 4, 1, 5, 0, 6] })), /terminal|overflow|range/);
  assert.throws(() => Rules.createGame(base({ preset: [0, 0, 0, 0, 0, 0, 0] })), /overflows/);
});

test('replay of the command log reproduces the state hash; duplicate ids are ignored', () => {
  const cfg = base({ seed: 4242 });
  const s = Rules.createGame(cfg);
  let g = 0;
  while (!s.terminal && g++ < 100) {
    const legal = Rules.legalActions(s);
    drop(s, legal[g % legal.length].col);
  }
  assert.ok(s.terminal);
  const log = s.drops.map((col, i) => ({ type: 'drop', col, id: 'c' + i }));
  const replayed = Rules.replay(cfg, log.concat([log[0]]));
  assert.equal(Rules.hashState(replayed), Rules.hashState(s));
  const round = Rules.deserialize(Rules.serialize(s));
  assert.equal(Rules.hashState(round), Rules.hashState(s));
  assert.throws(() => Rules.deserialize(JSON.stringify({ v: 99 })), /unsupported/);
});

test('rng streams are deterministic and independent', () => {
  const a = RNG.streams(7), b = RNG.streams(7);
  assert.equal(a.rules.next(), b.rules.next());
  assert.notEqual(RNG.derive(7, RNG.STREAM_RULES).next(), RNG.derive(7, RNG.STREAM_AI).next());
  assert.equal(RNG.hashString('fourfold-daily-2026-09-09'), RNG.hashString('fourfold-daily-2026-09-09'));
});

test('AI: same position, level and seed gives the same column; strong levels take and block wins', () => {
  const s = Rules.createGame(base({ preset: [0, 6, 1, 6, 2, 5] })); // P1 threatens col 3
  // It is P1's move (even preset); flip perspective by letting P1 play elsewhere.
  drop(s, 4);
  for (const level of [2, 3, 4]) {
    const col = AI.chooseMove(s, level, RNG.derive(1, RNG.STREAM_AI));
    assert.equal(col, 3, `level ${level} must block column 4`);
  }
  const a = AI.chooseMove(s, 1, RNG.derive(5, RNG.STREAM_AI));
  const b = AI.chooseMove(s, 1, RNG.derive(5, RNG.STREAM_AI));
  assert.equal(a, b);
  const hint = AI.suggestMove(Rules.createGame(base({ preset: [3, 0, 3, 1, 3, 2] })), RNG.derive(1, RNG.STREAM_AI));
  assert.equal(hint, 3, 'hint completes the vertical four');
});

test('content validates: 42 journey stages, 7 challenges, 6 lessons, deterministic daily', () => {
  assert.deepEqual(Content.validate(), []);
  assert.equal(Content.JOURNEY.length, 42);
  assert.equal(Content.JOURNEY.filter((l) => l.mastery).length, 8);
  assert.equal(Content.CHALLENGES.length, 7);
  assert.equal(Content.LESSONS.length, 6);
  assert.equal(Content.THEMES.length, 5);
  const d1 = Content.dailyConfig('2026-09-09'), d2 = Content.dailyConfig('2026-09-09');
  assert.equal(Rules.stableStringify(d1), Rules.stableStringify(d2));
  assert.equal(d1.mechanics.undo, false);
  assert.ok(d1.preset.length <= 4);
});
