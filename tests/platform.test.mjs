// Fourfold — js/platform.js (FFPlatform) on the real StarHermit SDK with a
// stubbed fetch and launch URL. Run: node --test tests/platform.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const SDK = require('../starhermit-sdk.js');
const SRC = readFileSync(new URL('../js/platform.js', import.meta.url), 'utf8');
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = 'h.' + b64u({ sub: 'u-disc-123456', game_scope: 'fourfold-id', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.s';

function load(href, routes = {}) {
  const calls = []; const store = {}; const etags = {}; const url = new URL(href);
  const win = { location: { hash: url.hash, search: url.search, pathname: url.pathname, origin: url.origin, hostname: url.hostname, href }, history: { replaceState: (a, b, u) => { win.replaced = u; } } };
  const fetch = async (path, init = {}) => {
    const method = init.method || 'GET'; calls.push({ path, method, body: init.body });
    if (path.includes('/cloud-saves/')) {
      const key = decodeURIComponent(path.split('/cloud-saves/')[1]);
      if (key.endsWith('/info')) return new Response(JSON.stringify({ exists: !!store[key.slice(0, -5)], etag: etags[key.slice(0, -5)] || null }), { status: 200 });
      if (method === 'PUT') {
        // Conditional writes as the platform does them; a lost race answers 412.
        const h = init.headers || {};
        if ((h['If-Match'] && h['If-Match'] !== etags[key]) || (h['If-None-Match'] === '*' && store[key])) return new Response(JSON.stringify({ error: 'precondition_failed' }), { status: 412 });
        store[key] = Buffer.from(JSON.parse(init.body).dataBase64, 'base64');
        etags[key] = '"v' + calls.length + '"';
        return new Response(JSON.stringify({ etag: etags[key] }), { status: 200 });
      }
      return store[key] ? new Response(store[key], { status: 200 }) : new Response('', { status: 404 });
    }
    const hit = Object.entries(routes).find(([k]) => `${method} ${path}`.endsWith(k));
    return hit ? new Response(JSON.stringify(hit[1]), { status: 200 }) : new Response('', { status: 404 });
  };
  const sh = SDK.create({ window: win, fetch, setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; } });
  const sandbox = { StarHermit: sh, addEventListener() {}, document: { addEventListener() {}, hidden: false }, JSON, Promise, String, Object };
  sandbox.self = sandbox;
  vm.runInNewContext(SRC, sandbox);
  return { P: sandbox.FFPlatform, sh, calls, store, etags, win };
}

test('hosted: token read, nickname, cloud save game:<slug>, settings, bindings', async () => {
  const { P, calls, store, win } = load('https://fourfold-id.starhermit.com/#game_token=' + TOKEN, {
    'GET /api/v1/users/u-disc-123456/profile': { username: 'raw', nickname: 'Columnist' },
    'GET /api/v1/games/fourfold-id/settings': { settings: { volume: 0.25 } },
    'PATCH /api/v1/games/fourfold-id/settings': {},
    'GET /api/v1/games/fourfold-id/controls': { actions: [{ action: 'undo', codes: ['KeyZ'] }] },
  });
  assert.equal(P.state().online, true); assert.equal(P.state().slug, 'fourfold-id');
  assert.equal(win.replaced, '/');
  let doc = { v: 1, stats: { played: 2 } }, remote = null, settings = null, keys = null;
  await P.init({ doc: () => JSON.stringify(doc), applyRemote: (d) => { remote = d; }, applySettings: (s) => { settings = s; }, applyKeys: (k) => { keys = k; } });
  assert.equal(remote, null, 'empty slot');
  assert.deepEqual(settings, { volume: 0.25 });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(P.state().nickname, 'Columnist');
  assert.equal(JSON.stringify([keys.undo, keys.hint]), '[["KeyZ"],["KeyH"]]'); // vm-realm arrays
  assert.equal(await P.flush(), true, 'empty slot seeded from the local doc');
  assert.deepEqual(Object.keys(store), ['game:fourfold-id']);
  assert.ok(calls.some((c) => c.method === 'PUT' && c.path === '/api/v1/me/cloud-saves/' + encodeURIComponent('game:fourfold-id')));
  assert.equal(P.state().status, 'synced');
  doc = { v: 1, stats: { played: 3 } };
  P.push(); await P.flush();
  const again = load('https://fourfold-id.starhermit.com/#game_token=' + TOKEN);
  again.store['game:fourfold-id'] = store['game:fourfold-id'];
  let adopted = null;
  await again.P.init({ doc: () => '{}', applyRemote: (d) => { adopted = d; } });
  assert.equal(adopted.stats.played, 3, 'remote doc wins on load');
  await P.patchSettings({ muted: true });
  const patch = calls.find((c) => c.method === 'PATCH');
  assert.equal(patch.path, '/api/v1/games/fourfold-id/settings');
  assert.deepEqual(JSON.parse(patch.body), { settings: { muted: true } });
  assert.match(P.inviteLink(), /\/game-invite\/u-disc-123456\/fourfold-id$/);
});

test('sign-out on refused renewal drops to offline', () => {
  // Sign-in is offered only on the game's own UUID host.
  const { P, sh } = load('https://0b9d6f2e-3c4a-4e5b-9a7c-1d2e3f405162.starhermit.com/#game_token=' + TOKEN);
  const seen = []; P.onChange((s) => seen.push(s.online));
  sh.signOut('expired');
  assert.deepEqual(seen, [false]); assert.equal(P.state().canSignIn, true); assert.equal(P.inviteLink(), null);
});

test('standalone: inert, no network calls', async () => {
  const { P, calls } = load('http://127.0.0.1:8080/');
  assert.equal(P.state().online, false); assert.equal(P.state().canSignIn, false);
  assert.equal(await P.init({ doc: () => '{}' }), false);
  P.push(); await P.flush(); await P.patchSettings({ volume: 1 });
  assert.equal(P.inviteLink(), null);
  assert.equal(calls.length, 0);
});

test('save conflict: a write that lost to another device reloads, merges and saves again', async () => {
  const href = 'https://fourfold-id.starhermit.com/#game_token=' + TOKEN;
  const a = load(href);
  let docA = { v: 1, journey: { j01: 2 } };
  const merged = [];
  await a.P.init({ doc: () => JSON.stringify(docA), mergeRemote: (d) => { merged.push(d); docA = { v: 1, journey: { ...d.journey, ...docA.journey, j02: 1 } }; return true; } });
  await a.P.flush(); // seeds the empty slot
  // Another device writes the slot (a new version the first device never read).
  const b = load(href);
  b.store['game:fourfold-id'] = a.store['game:fourfold-id']; b.etags['game:fourfold-id'] = a.etags['game:fourfold-id'];
  await b.P.init({ doc: () => JSON.stringify({ v: 1, journey: { j01: 3, j05: 1 } }), mergeRemote: () => true });
  b.P.push(); await b.P.flush();
  a.store['game:fourfold-id'] = b.store['game:fourfold-id']; a.etags['game:fourfold-id'] = b.etags['game:fourfold-id'];
  let conflicts = 0;
  a.sh.on('saveconflict', () => { conflicts++; });
  docA = { v: 1, journey: { j01: 2, j03: 1 } };
  a.P.push();
  assert.equal(await a.P.flush(), false, 'the stale write is refused');
  assert.equal(conflicts, 1);
  for (let i = 0; i < 50 && !merged.some((d) => d.journey && d.journey.j05); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(merged.some((d) => d.journey.j05 === 1), 'the other device\'s document was merged');
  assert.equal(await a.P.flush(), true, 'the merge is saved again');
  assert.equal(a.sh.saveConflicted(), false);
});

test('mergeStores keeps the best of both progress documents', () => {
  const sandbox = { document: {}, JSON, Object, Math, String };
  sandbox.self = sandbox;
  vm.runInNewContext(readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8'), sandbox);
  const remote = { v: 1, journey: { j01: 3, j02: 1 }, challenges: { blitz: 400 }, lessons: { 'l-drop': true }, daily: { '2026-10-15': { score: 300, result: 'win' } },
    stats: { played: 9, wins: 4, streak: 0, bestStreak: 2 }, achievements: { 'first-line': true }, save: null, settings: { volume: 0.1 } };
  const local = { v: 1, journey: { j01: 2, j03: 1 }, challenges: { blitz: 500, budget: 100 }, lessons: { 'l-gravity': true }, daily: { '2026-10-15': { score: 200, result: 'loss' } },
    stats: { played: 5, wins: 5, streak: 3, bestStreak: 3 }, achievements: { 'streak-3': true }, save: { key: 'journey:j03', seed: 1, drops: [3], elapsedMs: 10 },
    settings: { volume: 0.9, muted: false, reducedMotion: false, highContrast: false, largeText: false } };
  const m = JSON.parse(JSON.stringify(sandbox.FFUI.mergeStores(remote, local)));
  assert.deepEqual(m.journey, { j01: 3, j02: 1, j03: 1 });
  assert.deepEqual(m.challenges, { blitz: 500, budget: 100 });
  assert.deepEqual(Object.keys(m.lessons).sort(), ['l-drop', 'l-gravity']);
  assert.equal(m.daily['2026-10-15'].score, 300);
  assert.deepEqual(m.stats, { played: 9, wins: 5, bestStreak: 3, streak: 3 });
  assert.deepEqual(Object.keys(m.achievements).sort(), ['first-line', 'streak-3']);
  assert.equal(m.save.key, 'journey:j03', 'this device keeps its game in progress');
  assert.equal(m.settings.volume, 0.9);
});
