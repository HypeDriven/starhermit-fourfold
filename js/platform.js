/* Fourfold — StarHermit platform adapter.
 *
 * Owns everything platform-shaped: the launch token from the URL fragment
 * (#game_token=<jwt>), keeping it fresh, the account nickname, and the
 * cloud mirror of the local progress document (one stored-zip slot).
 *
 * Offline this module is fully inert: with no launch token no fetch is
 * ever made, no timer is scheduled, and localStorage stays the only store.
 * Hosted mode activates iff a token was read. Platform contract: same-origin
 * /api, Bearer auth on every call, never a hard-coded API base.
 *
 * Exposes window.FFPlatform. Consumed by js/ui.js (loaded before it).
 */
(function (root) {
  'use strict';

  var REFRESH_MS = 45 * 60 * 1000;   // re-mint scoped tokens before the 60-min expiry
  var REFRESH_RETRY_MS = 60 * 1000;
  var PUSH_DEBOUNCE_MS = 2000;

  // ---------- stored zip (single entry, no compression, CRC32) ----------

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zipStore(name, dataBytes) {
    var enc = new TextEncoder();
    var nameB = enc.encode(name);
    var crc = crc32(dataBytes);
    var out = [];
    var u16 = function (v) { out.push(v & 0xff, (v >> 8) & 0xff); };
    var u32 = function (v) { out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff); };
    u32(0x04034b50); u16(20); u16(0); u16(0); u16(0); u16(0);
    u32(crc); u32(dataBytes.length); u32(dataBytes.length);
    u16(nameB.length); u16(0);
    var head = new Uint8Array(out);
    var cd = [];
    var c16 = function (v) { cd.push(v & 0xff, (v >> 8) & 0xff); };
    var c32 = function (v) { cd.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff); };
    c32(0x02014b50); c16(20); c16(20); c16(0); c16(0); c16(0); c16(0);
    c32(crc); c32(dataBytes.length); c32(dataBytes.length);
    c16(nameB.length); c16(0); c16(0); c16(0); c16(0); c32(0); c32(0);
    var cdHead = new Uint8Array(cd);
    var cdOff = head.length + nameB.length + dataBytes.length;
    var parts = [head, nameB, dataBytes, cdHead, nameB];
    var eocd = [];
    var e32 = function (v) { eocd.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff); };
    var e16 = function (v) { eocd.push(v & 0xff, (v >> 8) & 0xff); };
    e32(0x06054b50); e16(0); e16(0); e16(1); e16(1);
    e32(cdHead.length + nameB.length); e32(cdOff); e16(0);
    parts.push(new Uint8Array(eocd));
    var total = parts.reduce(function (sum, p) { return sum + p.length; }, 0);
    var buf = new Uint8Array(total), o = 0;
    for (var i = 0; i < parts.length; i++) { buf.set(parts[i], o); o += parts[i].length; }
    return buf;
  }

  function unzipFirstEntry(zipBytes) {
    // Stored single-entry reader: scan local headers for compression 0.
    var dv = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
    var off = 0;
    while (off + 30 <= zipBytes.length && dv.getUint32(off, true) === 0x04034b50) {
      var method = dv.getUint16(off + 8, true);
      var size = dv.getUint32(off + 18, true);
      var nameLen = dv.getUint16(off + 26, true);
      var extraLen = dv.getUint16(off + 28, true);
      var dataOff = off + 30 + nameLen + extraLen;
      if (method !== 0) throw new Error('unsupported zip entry');
      return zipBytes.slice(dataOff, dataOff + size);
    }
    throw new Error('bad zip');
  }

  function bytesToBase64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000)
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return root.btoa(s);
  }

  function base64ToBytes(b64) {
    var s = root.atob(b64);
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  // ---------- launch token ----------

  function decodeJwt(t) {
    try {
      var payload = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (payload.length % 4) payload += '=';
      return JSON.parse(root.atob(payload));
    } catch (e) { return null; }
  }

  // Read the token exactly once, then strip it from the URL. Query-param
  // fallbacks exist for local dev only; hosted launches use the fragment.
  function readLaunchToken() {
    var t = null;
    if (!root.location) return null;
    try {
      var params = new URLSearchParams(root.location.hash.replace(/^#/, ''));
      t = params.get('game_token');
      if (t) {
        params.delete('game_token');
        var rest = params.toString();
        root.history.replaceState(null, '',
          root.location.pathname + root.location.search + (rest ? '#' + rest : ''));
      }
    } catch (e) { t = null; }
    if (!t) {
      try {
        var q = new URLSearchParams(root.location.search);
        t = q.get('game_token') || q.get('token') || q.get('launch');
      } catch (e) { t = null; }
    }
    return t;
  }

  var token = readLaunchToken();
  var claims = token ? decodeJwt(token) : null;
  var sub = claims && claims.sub ? String(claims.sub) : null;
  var slug = claims && claims.game_scope ? String(claims.game_scope) : null; // never hard-coded
  var authed = !!(token && sub);          // enough for the profile endpoint
  var online = !!(authed && slug);        // enough for game-scoped endpoints
  var nickname = sub ? 'Player ' + sub.slice(0, 8) : '';
  var status = online ? 'loading' : 'offline';

  // ---------- REST ----------

  function api(method, path, body, extra) {
    var opts = {
      method: method,
      headers: { 'Authorization': 'Bearer ' + token },
      credentials: 'same-origin'
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    if (extra) Object.keys(extra).forEach(function (k) { opts[k] = extra[k]; });
    return root.fetch(path, opts).then(function (r) {
      if (!r.ok) {
        var err = new Error('HTTP ' + r.status + ' for ' + path);
        err.status = r.status;
        throw err;
      }
      return r;
    });
  }

  // ---------- listeners ----------

  var listeners = [];
  function state() {
    return { online: online, authed: authed, sub: sub, slug: slug, nickname: nickname, status: status };
  }
  function emit() {
    for (var i = 0; i < listeners.length; i++) listeners[i](state());
  }
  function setStatus(s) {
    if (status === s) return;
    status = s;
    emit();
  }

  // ---------- profile (nickname only — never /api/v1/me, never usernames) ----------

  function loadProfile(attempt) {
    if (!authed) return Promise.resolve(null);
    return api('GET', '/api/v1/users/' + encodeURIComponent(sub) + '/profile')
      .then(function (r) { return r.json(); })
      .then(function (p) {
        if (p && p.nickname) nickname = String(p.nickname);
        emit();
        return nickname;
      })
      .catch(function () {
        // One soft retry: a flaky network must not pin the fallback name.
        if (!attempt) {
          return new Promise(function (res) {
            root.setTimeout(function () { res(loadProfile(1)); }, 1500);
          });
        }
        emit();
        return null;
      });
  }

  // ---------- token refresh (45-min schedule, ~60-s retry on failure) ----------

  function scheduleRefresh() {
    if (!online) return;
    root.setTimeout(remint, REFRESH_MS);
  }
  function remint() {
    api('POST', '/api/v1/games/' + encodeURIComponent(slug) + '/launch-token')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.token) {
          token = d.token;
          var c = decodeJwt(token);
          if (c) {
            if (c.sub) sub = String(c.sub);
            if (c.game_scope) slug = String(c.game_scope);
          }
        }
        scheduleRefresh();
      })
      .catch(function () { root.setTimeout(remint, REFRESH_RETRY_MS); });
  }

  // ---------- cloud save (one slot, stored zip + base64, remote wins) ----------

  var docProvider = null;   // () => string  (the local progress document as JSON)
  var docApplied = null;    // (obj) => bool (adopt a remote document locally)
  var pushTimer = 0;
  var pushChain = Promise.resolve();
  var lastPushed = null;

  function cloudPath() {
    return '/api/v1/me/cloud-saves/' + encodeURIComponent(slug);
  }

  function encodeDoc(json) {
    return bytesToBase64(zipStore('fourfold.json', new TextEncoder().encode(json)));
  }

  function pushNow(keepalive) {
    if (!online || !docProvider) return Promise.resolve(false);
    var json = docProvider();
    if (json === lastPushed) return Promise.resolve(false);
    setStatus('saving');
    var done = api('PUT', cloudPath(), { dataBase64: encodeDoc(json) },
        keepalive ? { keepalive: true } : null)
      .then(function () { lastPushed = json; setStatus('synced'); return true; })
      .catch(function () { setStatus('error'); return false; });
    pushChain = pushChain.then(function () { return done; }, function () { return done; });
    return pushChain;
  }

  function schedulePush() {
    if (!online) return;
    if (pushTimer) root.clearTimeout(pushTimer);
    pushTimer = root.setTimeout(function () { pushTimer = 0; pushNow(false); }, PUSH_DEBOUNCE_MS);
  }

  function flush() {
    if (pushTimer) { root.clearTimeout(pushTimer); pushTimer = 0; }
    return pushNow(true);
  }

  function pull() {
    if (!online) return Promise.resolve(false);
    setStatus('loading');
    return api('GET', cloudPath())
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (buf) {
        var doc = JSON.parse(new TextDecoder().decode(unzipFirstEntry(new Uint8Array(buf))));
        // On conflict prefer remote: the remote document becomes local truth.
        if (docApplied) docApplied(doc);
        lastPushed = docProvider ? docProvider() : null;
        setStatus('synced');
        return true;
      })
      .catch(function (e) {
        if (e && e.status === 404) {
          // No remote save yet: upload the local document as the first save.
          setStatus('synced');
          pushNow(false);
          return false;
        }
        setStatus('offline');
        return false;
      });
  }

  // Flush any pending save when the page is hidden or torn down.
  if (root.addEventListener) {
    root.addEventListener('pagehide', flush);
    if (root.document) {
      root.document.addEventListener('visibilitychange', function () {
        if (root.document.hidden) flush();
      });
    }
  }

  // ---------- init ----------

  function init(hooks) {
    docProvider = hooks && hooks.doc || null;
    docApplied = hooks && hooks.applyRemote || null;
    if (!online) { emit(); return Promise.resolve(false); }
    scheduleRefresh();
    var pulled = pull();
    loadProfile(0);
    return pulled;
  }

  root.FFPlatform = {
    init: init,
    state: state,
    onChange: function (fn) { listeners.push(fn); },
    push: schedulePush,
    flush: flush
  };
})(typeof self !== 'undefined' ? self : this);
