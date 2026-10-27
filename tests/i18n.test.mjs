// Localization coverage: every English key the engine client shows — T('…') /
// N('…') keys in native/*.ts and the content shown through T(variable)
// (players, lessons, journey stages and intros, practice opponents,
// challenges) — is translated in every locale (en-GB → en-US, es-ES →
// es-419, fr-CA → fr-FR inherit) with intact placeholders; no table row goes
// unused; the lookup follows the interface language; the account strings
// cover the nine locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { loadTables, codeKeys, audit, LOCALES } from './i18n-common.mjs';

const require = createRequire(import.meta.url);
const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const FILES = ['js/i18n/strings.js', 'js/i18n/strings-content.js'];
const NATIVE = readdirSync(new URL('native/', ROOT)).filter((f) => f.endsWith('.ts')).map((f) => 'native/' + f);
const C = require('../js/content.js');
const { createI18n, match } = require('../js/i18n/core.js');

export function usedKeys() {
  const keys = new Set();
  for (const f of NATIVE) codeKeys(read(f)).forEach((k) => keys.add(k));
  C.PLAYERS.slice(1).forEach((p) => keys.add(p.name));
  C.LESSONS.forEach((l) => { keys.add(l.title); keys.add(l.text); });
  C.PRACTICE.forEach((p) => { keys.add(p.name); keys.add(p.blurb); });
  C.CHALLENGES.forEach((c) => { keys.add(c.name); keys.add(c.blurb); });
  C.JOURNEY.forEach((j) => { keys.add(j.name); if (j.intro) keys.add(j.intro); });
  return [...keys].filter((k) => /[A-Za-z]/.test(k)).sort();
}

test('every used key is translated in every locale; placeholders intact; no unused rows', () => {
  assert.deepEqual(audit(loadTables(ROOT, FILES, 'FF_STRINGS'), usedKeys()), []);
});

test('the lookup follows the interface language and switches live', () => {
  const I = createI18n(loadTables(ROOT, FILES, 'FF_STRINGS'));
  assert.equal(I.T('Make four in a row'), 'Make four in a row');
  I.setLocale('de-DE');
  assert.equal(I.T('Make four in a row'), 'Vier in einer Reihe');
  I.setLocale('fr-CA');
  assert.equal(I.lang, 'fr-CA');
  I.setLocale('es-ES');
  assert.equal(I.T('Hint: column {n}.', { n: 4 }), 'Pista: columna 4.');
  assert.equal(I.T('This game is over.'), 'Esta partida ha terminado.');
  I.setLocale('es-419');
  assert.equal(I.T('This game is over.'), 'Esta partida terminó.');
  assert.equal(match('es-MX'), 'es-419');
  assert.equal(match('en-AU'), 'en-GB');
  assert.equal(match('fr'), 'fr-FR');
  assert.equal(match('pt-PT'), 'pt-BR');
  assert.equal(match('ja-JP'), 'en-US');
});

test('account strings cover all nine locales and follow the game language', () => {
  const sandbox = { navigator: {} };
  vm.runInNewContext(read('js/platform-i18n.js'), sandbox);
  for (const l of LOCALES) assert.ok(sandbox.FFPlatformStrings.LOCALES.includes(l), 'platform ' + l);
  sandbox.FFI18N = { lang: 'de-DE' };
  assert.equal(sandbox.FFPlatformStrings().invite, 'Freund einladen');
});
