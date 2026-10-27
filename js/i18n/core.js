/* Fourfold — the localization lookup without the DOM (the browser build's
 * js/i18n/i18n.js T() and locale fallback). Nine locales: en-US, en-GB,
 * es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR, it-IT; English source strings
 * are the keys; en-GB, es-ES and fr-CA carry only their differences from
 * en-US, es-419 and fr-FR. The engine client picks the locale from the
 * runtime's interface language (native/i18n.ts). UMD: globalThis.FFI18NCore
 * in the engine, module.exports in node.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FFI18NCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LOCALES = ['en-US', 'en-GB', 'es-419', 'es-ES', 'de-DE', 'fr-FR', 'fr-CA', 'pt-BR', 'it-IT'];
  var PARENT = { 'en-GB': 'en-US', 'es-ES': 'es-419', 'fr-CA': 'fr-FR' };
  var hasOwn = Object.prototype.hasOwnProperty;

  /** The shipped locale nearest a BCP 47 tag (es-MX → es-419, en-AU → en-GB, fr → fr-FR, pt-PT → pt-BR). */
  function match(tag) {
    var t = String(tag || '').replace(/_/g, '-');
    for (var i = 0; i < LOCALES.length; i++) if (LOCALES[i].toLowerCase() === t.toLowerCase()) return LOCALES[i];
    var lang = t.slice(0, 2).toLowerCase(), region = t.slice(3).toUpperCase();
    if (lang === 'en') return !region || region === 'US' ? 'en-US' : 'en-GB';
    if (lang === 'es') return region === 'ES' ? 'es-ES' : 'es-419';
    if (lang === 'fr') return region === 'CA' ? 'fr-CA' : 'fr-FR';
    if (lang === 'pt') return 'pt-BR';
    if (lang === 'de') return 'de-DE';
    if (lang === 'it') return 'it-IT';
    return 'en-US';
  }

  function createI18n(tables) {
    var TABLES = tables || {};
    var KEYS = TABLES['es-419'] || {};
    var lang = 'en-US';
    function lookup(key) {
      for (var l = lang; l; l = PARENT[l]) {
        var t = TABLES[l];
        if (t && hasOwn.call(t, key)) return t[key];
      }
      return key;
    }
    return {
      LOCALES: LOCALES,
      get lang() { return lang; },
      /** Sets the locale from a tag; returns the shipped locale chosen. */
      setLocale: function (tag) { lang = match(tag); return lang; },
      /** Translates an English source string; {name} placeholders filled from vars. */
      T: function (key, vars) {
        var s = lookup(String(key));
        if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return hasOwn.call(vars, k) ? String(vars[k]) : m; });
        return s;
      },
      has: function (key) { return hasOwn.call(KEYS, String(key)); }
    };
  }

  return { LOCALES: LOCALES, match: match, createI18n: createI18n };
});
