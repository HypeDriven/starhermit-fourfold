// Localization coverage: every English key the UI shows — index.html markup,
// HTML literals and T('…') / N('…') keys in js/ui.js, and the content shown
// through T(variable) (players, lessons, journey, practice, challenges) — is
// translated in every locale (en-GB → en-US, es-ES → es-419, fr-CA → fr-FR
// inherit) with intact placeholders; the language follows sh-language.js and
// switches live; the Graphics panel and account strings cover nine locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadTables, codeKeys, literals, htmlKeys, mixedSegments, markupKeys, audit, bootI18n, LOCALES } from './i18n-common.mjs';

const require = createRequire(import.meta.url);
const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const FILES = ['js/i18n/strings.js', 'js/i18n/strings-content.js'];
const C = require('../js/content.js');

export function usedKeys() {
  const keys = new Set(markupKeys(read('index.html')));
  const src = read('js/ui.js');
  codeKeys(src).forEach((k) => keys.add(k));
  for (const lit of literals(src)) htmlKeys(lit).forEach((k) => keys.add(k));
  C.PLAYERS.slice(1).forEach((p) => keys.add(p.name));
  C.LESSONS.forEach((l) => { keys.add(l.title); keys.add(l.text); });
  C.PRACTICE.forEach((p) => { keys.add(p.name); keys.add(p.blurb); });
  C.CHALLENGES.forEach((c) => { keys.add(c.name); keys.add(c.blurb); });
  C.JOURNEY.forEach((j) => { keys.add(j.name); if (j.intro) keys.add(j.intro); });
  return [...keys].filter((k) => /[A-Za-z]/.test(k)).sort();
}

test('every used key is translated in every locale; placeholders intact', () => {
  assert.deepEqual(audit(loadTables(ROOT, FILES, 'FF_STRINGS'), usedKeys()), []);
});

test('template text never mixes words with an interpolation in one text node', () => {
  assert.deepEqual(literals(read('js/ui.js')).flatMap(mixedSegments), []);
});

test('the locale follows sh-language and switches live', () => {
  const { I18N, events, doc } = bootI18n(ROOT, { files: ['sh-language.js', ...FILES, 'js/i18n/i18n.js'], global: 'FFI18N', event: 'ff-language', languages: ['de-DE'] });
  assert.equal(I18N.lang, 'de-DE');
  assert.equal(doc.documentElement.lang, 'de-DE');
  assert.equal(I18N.T('Make four in a row'), 'Vier in einer Reihe');
  I18N.language.setChoice('fr-CA');
  assert.equal(I18N.lang, 'fr-CA');
  assert.equal(events.at(-1), 'fr-CA');
  I18N.language.setChoice('es-ES');
  assert.equal(I18N.T('Hint: column {n}.', { n: 4 }), 'Pista: columna 4.');
});

test('graphics panel and account strings cover all nine locales', async () => {
  const { LOCALES: GFX } = await import('../js/gfxpanel.js');
  const sandbox = { navigator: {} }; sandbox.self = sandbox;
  (await import('node:vm')).runInNewContext(read('js/platform-i18n.js'), sandbox);
  for (const l of LOCALES) {
    assert.ok(GFX.includes(l), 'gfx ' + l);
    assert.ok(sandbox.FFPlatformStrings.LOCALES.includes(l), 'platform ' + l);
  }
  assert.match(read('js/gfxpanel.js'), /addEventListener\('ff-language'/);
});
