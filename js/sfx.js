/* Fourfold — SFX engine: authored opus samples with synthesized fallback.
 * Browser-only module, exposes window.FFSfx (loaded by index.html).
 *
 * Event names mirror the rules engine's event and invalid-reason strings
 * (js/rules.js): drop, win, draw, move-limit, resigned, time-up,
 * column-full, bad-column, banned-column, out-of-turn, game-ended,
 * unknown-command, malformed-command. Five UI cues are owned by js/ui.js:
 * hint, undo, lesson-complete, clock-warning, menu-tap. Call
 * FFSfx.playResult() with the object returned by FFRules.applyCommand(),
 * or FFSfx.play(event). The full table is sfx/manifest.txt.
 *
 * Samples live in sfx/<name>.opus (see sfx/manifest.json). Each is
 * lazy-fetched and decoded on first use, after the first user gesture
 * unlocks the AudioContext. While a sample is still loading — or if it
 * fails to load — the event plays its synthesized fallback instead, so
 * a clip is never double-played (no play-on-load-completion).
 */
(function (root) {
  'use strict';

  var BASE = 'sfx/';
  var EXT = '.opus';

  // Runtime event map: event -> sample basenames (multiple = random variant).
  var EVENT_SAMPLES = {
    'drop': ['disc-drop-a', 'disc-drop-b', 'disc-drop-c'],
    'win': ['line-win'],
    'draw': ['board-draw'],
    'move-limit': ['move-limit-bell'],
    'resigned': ['resign-fold'],
    'time-up': ['time-up-tick'],
    'column-full': ['column-full-thud'],
    'bad-column': ['bad-column-knock'],
    'banned-column': ['banned-column-rattle'],
    'out-of-turn': ['out-of-turn-tap'],
    'game-ended': ['game-ended-dull'],
    'unknown-command': ['unknown-command-buzz'],
    'malformed-command': ['malformed-command-click'],
    // UI-owned cues (js/ui.js), not rules events.
    'hint': ['hint-chime'],
    'undo': ['undo-rewind'],
    'lesson-complete': ['lesson-complete'],
    'clock-warning': ['clock-warning'],
    'menu-tap': ['menu-tap']
  };

  var ctx = null;
  var master = null;  // master gain -> destination; carries mute + volume
  var fxBus = null;   // all effects (samples and synth) route through here
  var volume = 0.8;
  var muted = false;
  var cache = {};     // name -> { state: 'loading'|'ready'|'failed', buf }

  function applyGain() {
    if (master) master.gain.value = muted ? 0 : volume;
  }

  // AudioContext creation is deferred to the first user gesture.
  function unlock() {
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
      fxBus = ctx.createGain();
      fxBus.connect(master);
      applyGain();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  if (typeof root.addEventListener === 'function') {
    root.addEventListener('pointerdown', unlock);
    root.addEventListener('keydown', unlock);
  }

  // ---------- samples ----------

  function loadSample(name) {
    if (cache[name]) return;
    var entry = cache[name] = { state: 'loading', buf: null };
    if (typeof fetch !== 'function') { entry.state = 'failed'; return; }
    fetch(BASE + name + EXT)
      .then(function (res) {
        if (!res.ok) throw new Error('sfx ' + name + ': HTTP ' + res.status);
        return res.arrayBuffer();
      })
      .then(function (bytes) { return ctx.decodeAudioData(bytes); })
      .then(function (buf) { entry.state = 'ready'; entry.buf = buf; })
      .catch(function () { entry.state = 'failed'; });
  }

  function playBuffer(buf) {
    var src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(fxBus);
    src.start();
  }

  // ---------- synthesized fallback ----------

  function tone(freq, dur, type, peak, when) {
    var t = ctx.currentTime + (when || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak || 0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(fxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function thump(dur, cutoff, peak, when) {
    var t = ctx.currentTime + (when || 0);
    var len = Math.ceil(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    var g = ctx.createGain();
    g.gain.value = peak || 0.5;
    src.connect(f);
    f.connect(g);
    g.connect(fxBus);
    src.start(t);
  }

  function synth(event) {
    switch (event) {
      case 'drop':
        thump(0.09, 900, 0.6);
        tone(180, 0.08, 'sine', 0.25);
        break;
      case 'win':
        tone(523, 0.15, 'triangle', 0.3);
        tone(659, 0.15, 'triangle', 0.3, 0.12);
        tone(784, 0.15, 'triangle', 0.3, 0.24);
        tone(1047, 0.35, 'triangle', 0.3, 0.36);
        break;
      case 'draw':
        tone(392, 0.15, 'sine', 0.25);
        tone(392, 0.2, 'sine', 0.2, 0.2);
        break;
      case 'move-limit':
        tone(880, 0.12, 'square', 0.15);
        tone(587, 0.25, 'sine', 0.25, 0.14);
        break;
      case 'resigned':
        tone(330, 0.2, 'sine', 0.25);
        tone(220, 0.35, 'sine', 0.22, 0.18);
        break;
      case 'time-up':
        tone(1200, 0.05, 'square', 0.2);
        tone(1200, 0.05, 'square', 0.2, 0.1);
        tone(700, 0.25, 'sawtooth', 0.15, 0.22);
        break;
      case 'column-full':
        thump(0.12, 300, 0.6);
        break;
      case 'bad-column':
        thump(0.07, 1200, 0.4);
        tone(160, 0.1, 'square', 0.15);
        break;
      case 'banned-column':
        thump(0.04, 1500, 0.4);
        thump(0.04, 1500, 0.4, 0.07);
        thump(0.04, 1500, 0.4, 0.14);
        break;
      case 'out-of-turn':
        thump(0.05, 1000, 0.35);
        thump(0.05, 1000, 0.3, 0.12);
        break;
      case 'game-ended':
        tone(110, 0.3, 'sine', 0.35);
        break;
      case 'unknown-command':
        tone(140, 0.25, 'sawtooth', 0.2);
        break;
      case 'malformed-command':
        thump(0.03, 2500, 0.4);
        thump(0.05, 1800, 0.3, 0.08);
        break;
      case 'hint':
        tone(1318, 0.18, 'sine', 0.18);
        tone(1760, 0.3, 'sine', 0.14, 0.09);
        break;
      case 'undo':
        tone(420, 0.12, 'triangle', 0.18);
        tone(300, 0.14, 'triangle', 0.16, 0.08);
        thump(0.03, 1800, 0.25, 0.2);
        break;
      case 'lesson-complete':
        tone(523, 0.18, 'triangle', 0.25);
        tone(784, 0.3, 'triangle', 0.25, 0.16);
        thump(0.05, 900, 0.3, 0.4);
        break;
      case 'clock-warning':
        thump(0.04, 1400, 0.4);
        tone(660, 0.12, 'sine', 0.18);
        break;
      case 'menu-tap':
        thump(0.025, 2200, 0.25);
        tone(900, 0.05, 'sine', 0.08);
        break;
    }
  }

  // ---------- public API ----------

  // Play one event: prefer the mapped sample, fall back to synthesis
  // while it loads or after a load failure.
  function play(event) {
    if (!ctx || ctx.state !== 'running') return;
    var names = EVENT_SAMPLES[event];
    if (!names) return;
    var name = names[(Math.random() * names.length) | 0];
    var entry = cache[name];
    if (entry && entry.state === 'ready') { playBuffer(entry.buf); return; }
    if (!entry) loadSample(name);
    synth(event);
  }

  // Dispatch the events array produced by FFRules.applyCommand/place.
  function playEvents(events) {
    if (!events) return;
    for (var i = 0; i < events.length; i++) play(events[i] && events[i].t);
  }

  root.FFSfx = {
    play: play,
    playEvents: playEvents,
    // Dispatch a full applyCommand result: result events on success,
    // the invalid-reason string on failure.
    playResult: function (res) {
      if (!res) return;
      if (res.ok) playEvents(res.events);
      else play(res.reason);
    },
    unlock: unlock,
    setVolume: function (v) { volume = Math.min(1, Math.max(0, +v || 0)); applyGain(); },
    getVolume: function () { return volume; },
    setMuted: function (m) { muted = !!m; applyGain(); },
    isMuted: function () { return muted; }
  };
})(typeof self !== 'undefined' ? self : this);
