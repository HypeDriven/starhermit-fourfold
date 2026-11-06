// Localization coverage: every English key the engine client shows — T('…') /
// N('…') keys in native/*.ts and the content shown through T(variable)
// (players, lessons, journey stages and intros, practice opponents,
// challenges) — is translated in every locale (en-GB → en-US, es-ES →
// es-419, fr-CA → fr-FR inherit) with intact placeholders; no table row goes
// unused. The lookup and the account strings are the engine's `strings`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { codeKeys, audit } from './i18n-common.mjs';

const require = createRequire(import.meta.url);
const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const TABLES = JSON.parse(read('assets/strings.json'));
const NATIVE = readdirSync(new URL('native/', ROOT)).filter((f) => f.endsWith('.ts')).map((f) => 'native/' + f);
const C = require('../js/content.js');

export function usedKeys() {
  const keys = new Set();
  for (const f of NATIVE) codeKeys(read(f)).filter((k) => !k.startsWith('starhermit.')).forEach((k) => keys.add(k));
  C.PLAYERS.slice(1).forEach((p) => keys.add(p.name));
  C.LESSONS.forEach((l) => { keys.add(l.title); keys.add(l.text); });
  C.PRACTICE.forEach((p) => { keys.add(p.name); keys.add(p.blurb); });
  C.CHALLENGES.forEach((c) => { keys.add(c.name); keys.add(c.blurb); });
  C.JOURNEY.forEach((j) => { keys.add(j.name); if (j.intro) keys.add(j.intro); });
  return [...keys].filter((k) => /[A-Za-z]/.test(k)).sort();
}

test('every used key is translated in every locale; placeholders intact; no unused rows', () => {
  const { 'en-US': en, ...rest } = TABLES;
  assert.deepEqual(audit(rest, usedKeys()), []);
  for (const k of usedKeys()) assert.equal(en[k], k);
});
