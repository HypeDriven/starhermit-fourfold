/* Fourfold — StarHermit platform adapter over window.StarHermit
 * (starhermit-sdk.js, loaded before this file).
 *
 * The SDK reads the launch token (#game_token=… library launch or
 * #access_token=… sign-in return), strips it, renews it, and owns the
 * cloud-save slot game:<slug>, the per-player settings KV and the controls
 * endpoint. This module keeps the game's FFPlatform API on top of it: the
 * account nickname, the cloud mirror of the local progress document, synced
 * preferences, key bindings, sign-in and the invite link.
 *
 * Offline this module is fully inert: with no launch token no fetch is ever
 * made and localStorage stays the only store.
 *
 * Exposes window.FFPlatform. Consumed by js/ui.js (loaded after it).
 */
(function (root) {
  'use strict';

  var sh = root.StarHermit || null;
  if (sh && !sh.__fourfoldInit) { sh.__fourfoldInit = true; sh.init(); }

  // Keyboard actions (KeyboardEvent.code lists), mirrored as control.* lines
  // in starhermit.txt; the player's platform bindings override them.
  var DEFAULT_KEYS = {
    colLeft: ['ArrowLeft'], colRight: ['ArrowRight'],
    col1: ['Digit1', 'Numpad1'], col2: ['Digit2', 'Numpad2'], col3: ['Digit3', 'Numpad3'],
    col4: ['Digit4', 'Numpad4'], col5: ['Digit5', 'Numpad5'], col6: ['Digit6', 'Numpad6'],
    col7: ['Digit7', 'Numpad7'], col8: ['Digit8', 'Numpad8'], col9: ['Digit9', 'Numpad9'],
    undo: ['KeyU'], hint: ['KeyH'], restart: ['KeyR'], pause: ['KeyP'], back: ['Escape']
  };

  function online() { return !!(sh && sh.signedIn && sh.userId && sh.slug); }
  var nickname = '';
  var status = online() ? 'loading' : 'offline';
  var keys = clone(DEFAULT_KEYS);

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------- listeners ----------

  var listeners = [];
  function state() {
    var on = online();
    return {
      online: on, authed: on, sub: on ? sh.userId : null, slug: on ? sh.slug : null,
      nickname: on ? (nickname || 'Player ' + String(sh.userId).slice(0, 6)) : '',
      status: on ? status : 'offline', canSignIn: !!(sh && sh.canSignIn())
    };
  }
  function emit() {
    var s = state();
    for (var i = 0; i < listeners.length; i++) listeners[i](s);
  }
  function setStatus(s) {
    if (status === s) return;
    status = s;
    emit();
  }

  if (sh) {
    sh.on('saved', function (ok) { setStatus(ok ? 'synced' : 'error'); });
    // Renewal refused: local play continues; the UI re-offers sign-in.
    sh.on('auth', function (a) { if (!a.signedIn) { status = 'offline'; emit(); } });
  }

  // ---------- cloud save (slot game:<slug>, remote wins on load) ----------

  var docProvider = null;   // () => string  (the local progress document as JSON)
  var docApplied = null;    // (obj) => bool (adopt a remote document locally)
  var lastPushed = null;
  // While the start-up pull runs nothing is queued: a stale local doc queued
  // then would still be PUT after the remote one is adopted. A held push is
  // replayed once the pull settles, with the doc as it stands after adoption.
  var pulling = false, pushHeld = false;

  function schedulePush() {
    if (!online() || !docProvider) return;
    if (pulling) { pushHeld = true; return; }
    var json = docProvider();
    if (json === lastPushed) return;
    lastPushed = json;
    setStatus('saving');
    sh.saveJSON(JSON.parse(json));
  }

  function flush() {
    return online() ? sh.flushSave(true) : Promise.resolve(false);
  }

  function pull() {
    if (!online()) return Promise.resolve(false);
    setStatus('loading');
    pulling = true;
    return sh.saveInfo().then(function (info) {
      if (info && info.exists === false) return null;
      return sh.loadJSON();
    }).then(function (doc) {
      pulling = false;
      if (doc) {
        if (docApplied) docApplied(doc);
        lastPushed = docProvider ? docProvider() : null;
        setStatus('synced');
        if (pushHeld) { pushHeld = false; schedulePush(); }
        return true;
      }
      // No remote save yet: upload the local document as the first save.
      pushHeld = false;
      setStatus('synced');
      schedulePush();
      return false;
    }, function () { pulling = false; setStatus('offline'); if (pushHeld) { pushHeld = false; schedulePush(); } return false; });
  }

  if (root.addEventListener) {
    root.addEventListener('pagehide', flush);
    if (root.document) {
      root.document.addEventListener('visibilitychange', function () {
        if (root.document.hidden) flush();
      });
    }
  }

  // ---------- init ----------

  // hooks: { doc, applyRemote, applySettings(remoteSettings), applyKeys(bindings) }
  function init(hooks) {
    docProvider = hooks && hooks.doc || null;
    docApplied = hooks && hooks.applyRemote || null;
    if (!online()) { emit(); return Promise.resolve(false); }
    sh.profile().then(function (p) { nickname = p && p.displayName || ''; emit(); });
    sh.loadBindings(DEFAULT_KEYS).then(function (b) {
      keys = b;
      if (hooks && hooks.applyKeys) hooks.applyKeys(keys);
    }, function () {});
    return pull().then(function (pulled) {
      // Synced preferences are applied after the save doc (platform value wins).
      return sh.getSettings().then(function (s) {
        if (hooks && hooks.applySettings) hooks.applySettings(s || {});
        return pulled;
      }, function () { return pulled; });
    });
  }

  root.FFPlatform = {
    init: init,
    state: state,
    onChange: function (fn) { listeners.push(fn); },
    push: schedulePush,
    flush: flush,
    DEFAULT_KEYS: DEFAULT_KEYS,
    keys: function () { return keys; },
    patchSettings: function (obj) { return online() ? sh.patchSettings(obj) : Promise.resolve(null); },
    signIn: function () { return !!(sh && sh.signIn()); },
    inviteLink: function () { return online() ? sh.inviteLink() : null; },
    get hosted() { return online(); },
    // Post a finished game to the high-score board (score-script.js); resolves
    // { posted, rank } — rank on that board, or null.
    submitScore: function (total) {
      if (!online()) return Promise.resolve({ posted: false, rank: null });
      return sh.submitScores({ 'high-score': total }).then(function (keys) {
        if (keys.indexOf('high-score') < 0) return { posted: false, rank: null };
        return sh.leaderboard('high-score', { pageSize: 100 }).then(function (r) {
          var me = (r.items || []).filter(function (i) { return i.userId === sh.userId; })[0];
          return { posted: true, rank: me ? me.rank : null };
        }, function () { return { posted: true, rank: null }; });
      });
    }
  };
})(typeof self !== 'undefined' ? self : this);
