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
  const calls = []; const store = {}; const url = new URL(href);
  const win = { location: { hash: url.hash, search: url.search, pathname: url.pathname, origin: url.origin, hostname: url.hostname, href }, history: { replaceState: (a, b, u) => { win.replaced = u; } } };
  const fetch = async (path, init = {}) => {
    const method = init.method || 'GET'; calls.push({ path, method, body: init.body });
    if (path.includes('/cloud-saves/')) {
      const key = decodeURIComponent(path.split('/cloud-saves/')[1]);
      if (key.endsWith('/info')) return new Response(JSON.stringify({ exists: !!store[key.slice(0, -5)] }), { status: 200 });
      if (method === 'PUT') { store[key] = Buffer.from(JSON.parse(init.body).dataBase64, 'base64'); return new Response('{}', { status: 200 }); }
      return store[key] ? new Response(store[key], { status: 200 }) : new Response('', { status: 404 });
    }
    const hit = Object.entries(routes).find(([k]) => `${method} ${path}`.endsWith(k));
    return hit ? new Response(JSON.stringify(hit[1]), { status: 200 }) : new Response('', { status: 404 });
  };
  const sh = SDK.create({ window: win, fetch, setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; } });
  const sandbox = { StarHermit: sh, addEventListener() {}, document: { addEventListener() {}, hidden: false }, JSON, Promise, String, Object };
  sandbox.self = sandbox;
  vm.runInNewContext(SRC, sandbox);
  return { P: sandbox.FFPlatform, sh, calls, store, win };
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
  const { P, sh } = load('https://fourfold-id.starhermit.com/#game_token=' + TOKEN);
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
