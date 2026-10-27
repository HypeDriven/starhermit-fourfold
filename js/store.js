/* Fourfold — the progress document (the browser build's localStorage
 * 'fourfold.v1', now the engine's game save): its defaults, the forward merge
 * that keeps an older or partial document loadable, and the merge of two
 * devices' copies. Pure (no storage, no clock); shared by the engine client
 * (native/platform.ts, loaded as a classic script) and the node tests.
 * UMD: globalThis.FFStore in the engine, module.exports in node.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FFStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STORE_VERSION = 1;

  // settings: the browser build's own options. Volume, mute, reduced motion,
  // high contrast and larger text are the runtime's Options now; the block is
  // kept (and merged) so a document written by either build stays valid.
  var DEFAULT_STORE = {
    v: STORE_VERSION,
    settings: { volume: 0.8, muted: false, reducedMotion: false, highContrast: false, largeText: false },
    journey: {},        // stage id -> stars
    challenges: {},     // challenge id -> best score
    lessons: {},        // lesson id -> true
    daily: {},          // date -> { score, won }
    stats: { played: 0, wins: 0, streak: 0, bestStreak: 0 },
    achievements: {},
    save: null          // { key, seed, drops, elapsedMs }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function defaults() { return clone(DEFAULT_STORE); }

  function mergeDoc(base, doc) {
    Object.keys(base).forEach(function (k) {
      if (k === 'v' || doc[k] == null) return;
      if (typeof base[k] === 'object' && base[k] && !Array.isArray(base[k]) && typeof doc[k] === 'object')
        base[k] = Object.assign(base[k], doc[k]);
      else base[k] = doc[k];
    });
    return base;
  }

  /** A stored document made whole (null when it is not a v1 document). */
  function normalize(doc) {
    if (!doc || typeof doc !== 'object' || doc.v !== STORE_VERSION) return null;
    return mergeDoc(defaults(), clone(doc));
  }

  /** The browser build's cloud save text (its saveJSON of the same document). */
  function readText(text) {
    if (!text) return null;
    try { return normalize(JSON.parse(text)); } catch (e) { return null; }
  }

  // Two devices saved diverging documents: keep the best of each. Stars and
  // challenge bests take the maximum, lessons / achievements / dailies are
  // united (the higher daily score wins a date), counters take the larger
  // value, and this device keeps its settings and its game in progress.
  function mergeStores(remote, local) {
    var a = mergeDoc(defaults(), remote || {}), b = local || defaults();
    var out = clone(b);
    var num = function (x) { return typeof x === 'number' && isFinite(x) ? x : 0; };
    var keys = function (x, y) { return Object.keys(Object.assign({}, x || {}, y || {})); };
    out.journey = {};
    keys(a.journey, b.journey).forEach(function (k) { out.journey[k] = Math.max(num(a.journey[k]), num(b.journey[k])); });
    out.challenges = {};
    keys(a.challenges, b.challenges).forEach(function (k) { out.challenges[k] = Math.max(num(a.challenges[k]), num(b.challenges[k])); });
    out.lessons = Object.assign({}, a.lessons, b.lessons);
    out.achievements = Object.assign({}, a.achievements, b.achievements);
    out.daily = {};
    keys(a.daily, b.daily).forEach(function (k) {
      var x = a.daily[k], y = b.daily[k];
      out.daily[k] = clone(!x ? y : !y ? x : num(y.score) >= num(x.score) ? y : x);
    });
    out.stats = {};
    ['played', 'wins', 'bestStreak'].forEach(function (k) { out.stats[k] = Math.max(num(a.stats[k]), num(b.stats[k])); });
    out.stats.streak = num(b.stats.streak);
    out.save = b.save || a.save || null;
    out.v = STORE_VERSION;
    return out;
  }

  return {
    STORE_VERSION: STORE_VERSION,
    DEFAULT_STORE: DEFAULT_STORE,
    defaults: defaults,
    mergeDoc: mergeDoc,
    normalize: normalize,
    readText: readText,
    mergeStores: mergeStores
  };
});
