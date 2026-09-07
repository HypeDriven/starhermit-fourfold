/* Fourfold — UI shell and session controller.
 *
 * Owns everything that is NOT rules: screens, input, HUD, persistence,
 * settings, the AI turn scheduler, and the accessibility mirror. All game
 * state changes go through FFRules.applyCommand; this module never writes
 * to a state object's fields directly.
 *
 * Exposes window.FFUI. Call FFUI.boot({ createView }) once the board view
 * factory (js/view3d.js) has been imported.
 */
(function (root) {
  'use strict';

  var Rules = root.FFRules, AI = root.FFAI, Content = root.FFContent, Sfx = root.FFSfx;

  var STORE_KEY = 'fourfold.v1';
  var STORE_VERSION = 1;
  var AI_DELAY_MS = 420;
  var UNDO_LIMIT = 80;

  // ---------- persistence ----------

  var DEFAULT_STORE = {
    v: STORE_VERSION,
    settings: { volume: 0.8, muted: false, reducedMotion: false, highContrast: false, largeText: false },
    journey: {},        // stage id -> stars
    challenges: {},     // challenge id -> best score
    lessons: {},        // lesson id -> true
    daily: {},          // date -> { score, result }
    stats: { played: 0, wins: 0, streak: 0, bestStreak: 0 },
    achievements: {},
    save: null          // { key, seed, drops, elapsedMs }
  };

  function loadStore() {
    var s;
    try {
      var raw = root.localStorage && root.localStorage.getItem(STORE_KEY);
      s = raw ? JSON.parse(raw) : null;
    } catch (e) { s = null; }
    if (!s || typeof s !== 'object' || s.v !== STORE_VERSION) return clone(DEFAULT_STORE);
    // Merge forward so a partial or older-shaped document never crashes boot.
    var out = clone(DEFAULT_STORE);
    Object.keys(out).forEach(function (k) {
      if (k === 'v' || s[k] == null) return;
      if (typeof out[k] === 'object' && out[k] && !Array.isArray(out[k]) && typeof s[k] === 'object')
        out[k] = Object.assign(out[k], s[k]);
      else out[k] = s[k];
    });
    return out;
  }

  function saveStore() {
    try { root.localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* private mode */ }
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var store = loadStore();

  // ---------- dom helpers ----------

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function hex(n) { return '#' + (n >>> 0).toString(16).padStart(6, '0'); }

  // ---------- session ----------

  var view = null;
  var session = null;   // { cfg, state, key, meta, history, aiLevel, ... }
  var aiTimer = 0;
  var clockTimer = 0;
  var hoverCol = -1;
  var lastScreen = 'title';

  function themeFor(id) {
    for (var i = 0; i < Content.THEMES.length; i++)
      if (Content.THEMES[i].id === id) return Content.THEMES[i];
    return Content.THEMES[0];
  }

  function playerColor(p) {
    var pl = Content.PLAYERS[p] || Content.PLAYERS[1];
    return store.settings.highContrast ? pl.colorHC : pl.color;
  }
  function playerName(p) { return (Content.PLAYERS[p] || {}).name || ('Player ' + p); }
  function playerIcon(p) { return (Content.PLAYERS[p] || {}).icon || '●'; }

  // Config resolution from a stable key, so saves survive a reload.
  function configFor(key, seed) {
    var parts = key.split(':'), kind = parts[0], id = parts.slice(1).join(':');
    var i;
    if (kind === 'journey') {
      for (i = 0; i < Content.JOURNEY.length; i++)
        if (Content.JOURNEY[i].id === id) return clone(Content.JOURNEY[i]);
      return null;
    }
    if (kind === 'challenge') {
      for (i = 0; i < Content.CHALLENGES.length; i++)
        if (Content.CHALLENGES[i].id === id) return clone(Content.CHALLENGES[i]);
      return null;
    }
    if (kind === 'daily') return Content.dailyConfig(id);
    if (kind === 'lesson') {
      for (i = 0; i < Content.LESSONS.length; i++) {
        var l = Content.LESSONS[i];
        if (l.id !== id) continue;
        return {
          id: l.id, name: l.title, kind: 'lesson', seed: l.seed,
          board: { cols: 7, rows: 6 }, connect: 4, players: 2,
          preset: l.preset.split('').map(function (ch) { return ch.charCodeAt(0) - 48; }),
          ai: l.ai, par: { moves: 0, timeSec: 0 },
          mechanics: { undo: true, hint: true }, theme: 'glacier',
          lesson: l
        };
      }
      return null;
    }
    if (kind === 'practice') {
      for (i = 0; i < Content.PRACTICE.length; i++) {
        var p = Content.PRACTICE[i];
        if (p.id !== id) continue;
        return {
          id: 'practice-' + p.id, name: p.name, kind: 'practice',
          seed: seed == null ? (Math.random() * 0xffffffff) >>> 0 : seed,
          board: { cols: 7, rows: 6 }, connect: 4, players: 2,
          preset: [], ai: p.ai, par: { moves: 0, timeSec: 0 },
          mechanics: { undo: true, hint: true }, theme: 'glacier'
        };
      }
      return null;
    }
    return null;
  }

  function startSession(key, opts) {
    opts = opts || {};
    var cfg = configFor(key, opts.seed);
    if (!cfg) { showScreen('title'); return; }
    stopAI();
    var state;
    try { state = Rules.createGame(cfg); }
    catch (e) { announce('Could not start: ' + e.message, true); showScreen('title'); return; }

    session = {
      key: key,
      cfg: cfg,
      state: state,
      aiLevel: cfg.ai || 0,
      rng: root.FFRNG.derive(cfg.seed, root.FFRNG.STREAM_AI),
      history: [],
      paused: false,
      over: false,
      elapsedMs: 0,
      running: false,
      startedAt: 0,
      hintCol: -1,
      lessonDrops: [],
      theme: themeFor(cfg.theme)
    };

    // Replaying a saved command log rebuilds an interrupted game exactly.
    if (opts.drops && opts.drops.length) {
      for (var i = 0; i < opts.drops.length; i++) {
        session.history.push(Rules.serialize(session.state));
        var res = Rules.applyCommand(session.state, { type: 'drop', col: opts.drops[i] });
        if (!res.ok) { session.history.pop(); break; }
      }
      session.elapsedMs = opts.elapsedMs || 0;
    }

    view.setTheme(session.theme);
    view.clearAnims();
    showScreen('play');
    resumeClock();
    render();
    if (cfg.intro || (cfg.lesson && cfg.lesson.text)) {
      setStatus(cfg.lesson ? cfg.lesson.text : cfg.intro);
    } else {
      setStatus('');
    }
    persistSave();
    maybeAI();
  }

  // ---------- clock ----------

  function resumeClock() {
    if (!session || session.over || session.paused) return;
    session.running = true;
    session.startedAt = (root.performance || Date).now();
    if (!clockTimer) clockTimer = setInterval(tickClock, 250);
    if (view) view.setRunning(true);
  }

  function pauseClock() {
    if (session && session.running) {
      session.elapsedMs += (root.performance || Date).now() - session.startedAt;
      session.running = false;
    }
    if (clockTimer) { clearInterval(clockTimer); clockTimer = 0; }
    if (view) view.setRunning(false);
  }

  function elapsedMs() {
    if (!session) return 0;
    return session.elapsedMs + (session.running ? (root.performance || Date).now() - session.startedAt : 0);
  }

  function tickClock() {
    if (!session || session.over) return;
    var limit = session.cfg.timeLimitSec || 0;
    if (limit > 0 && elapsedMs() >= limit * 1000) {
      var res = Rules.applyCommand(session.state, { type: 'timeout', player: 1, elapsedMs: elapsedMs() });
      Sfx.playResult(res);
      finishGame();
      return;
    }
    updateMeta();
  }

  // ---------- commands ----------

  function humanDrop(col) {
    if (!session || session.over || session.paused) return;
    if (session.state.current !== 1 && session.aiLevel > 0) { Sfx.play('out-of-turn'); return; }
    var lesson = session.cfg.lesson;
    if (lesson && lesson.onlyCols && lesson.onlyCols.indexOf(col) === -1) {
      Sfx.play('bad-column');
      announce('This lesson wants column ' + (lesson.onlyCols[0] + 1) + '.', true);
      return;
    }
    applyDrop(col);
  }

  function applyDrop(col) {
    var before = Rules.serialize(session.state);
    var player = session.state.current;
    var res = Rules.applyCommand(session.state, { type: 'drop', col: col, elapsedMs: elapsedMs() });
    Sfx.playResult(res);
    if (!res.ok) { announce(reasonText(res.reason), true); return; }
    session.history.push(before);
    if (session.history.length > UNDO_LIMIT) session.history.shift();
    session.hintCol = -1;
    if (player === 1) session.lessonDrops.push(col);
    for (var i = 0; i < res.events.length; i++)
      if (res.events[i].t === 'drop') view.dropAnim(res.events[i].col, res.events[i].row);
    render();
    persistSave();
    if (session.state.terminal) { finishGame(); return; }
    if (checkLessonGoal()) return;
    maybeAI();
  }

  function reasonText(reason) {
    var map = {};
    map[Rules.INVALID.FULL_COL] = 'That column is full.';
    map[Rules.INVALID.BANNED] = 'That column is sealed this round.';
    map[Rules.INVALID.BAD_COL] = 'That column is off the board.';
    map[Rules.INVALID.TURN] = 'Not your turn yet.';
    map[Rules.INVALID.ENDED] = 'This game is over.';
    return map[reason] || 'That move is not allowed.';
  }

  function maybeAI() {
    stopAI();
    if (!session || session.over || session.paused) return;
    if (session.aiLevel <= 0) return;            // pass-and-play / solo lesson
    if (session.state.current === 1) return;
    updateTurn();
    aiTimer = setTimeout(function () {
      aiTimer = 0;
      if (!session || session.over || session.paused || session.state.current === 1) return;
      var col;
      try { col = AI.chooseMove(session.state, session.aiLevel, session.rng); }
      catch (e) { col = -1; }
      if (col == null || col < 0) {
        var legal = Rules.legalActions(session.state);
        if (!legal.length) return;
        col = legal[0].col;
      }
      applyDrop(col);
    }, store.settings.reducedMotion ? 120 : AI_DELAY_MS);
  }

  function stopAI() { if (aiTimer) { clearTimeout(aiTimer); aiTimer = 0; } }

  function undo() {
    if (!session || session.over || session.paused) return;
    if (!session.cfg.mechanics.undo) { announce('Undo is disabled in this mode.', true); return; }
    stopAI();
    // Step back to the most recent position where the local player is to move.
    var steps = 0;
    while (session.history.length && steps < 4) {
      session.state = Rules.deserialize(session.history.pop());
      steps++;
      if (session.state.current === 1 || session.aiLevel === 0) break;
    }
    if (!steps) { announce('Nothing to undo.'); return; }
    session.hintCol = -1;
    if (session.lessonDrops.length) session.lessonDrops.pop();
    view.clearAnims();
    render();
    persistSave();
    announce('Undid ' + steps + (steps === 1 ? ' drop.' : ' drops.'));
    maybeAI();
  }

  function hint() {
    if (!session || session.over || session.paused) return;
    if (!session.cfg.mechanics.hint) { announce('Hints are disabled in this mode.', true); return; }
    if (session.state.current !== 1 && session.aiLevel > 0) return;
    var col;
    try { col = AI.suggestMove(session.state, session.rng); } catch (e) { col = -1; }
    if (col == null || col < 0) { announce('No hint available.'); return; }
    session.hintCol = col;
    render();
    announce('Hint: column ' + (col + 1) + '.');
  }

  function resign() {
    if (!session || session.over) return;
    var res = Rules.applyCommand(session.state, { type: 'resign', player: 1, elapsedMs: elapsedMs() });
    Sfx.playResult(res);
    finishGame();
  }

  function restart() {
    if (!session) return;
    var key = session.key, seed = session.cfg.seed;
    closePause();
    startSession(key, { seed: key.indexOf('practice:') === 0 ? undefined : seed });
  }

  // ---------- results ----------

  function finishGame() {
    pauseClock();
    stopAI();
    session.over = true;
    var st = session.state;
    var t = st.terminal;
    var won = t && t.winner === 1;
    var stars = Rules.starsFor(st);

    // Progression: recorded once per finished game.
    store.stats.played++;
    if (won) {
      store.stats.wins++;
      store.stats.streak++;
      if (store.stats.streak > store.stats.bestStreak) store.stats.bestStreak = store.stats.streak;
    } else if (session.aiLevel > 0) {
      store.stats.streak = 0;
    }
    var kind = session.cfg.kind;
    if (kind === 'journey' && stars > (store.journey[session.cfg.id] || 0)) store.journey[session.cfg.id] = stars;
    if (kind === 'challenge' && won && st.score.total > (store.challenges[session.cfg.id] || 0))
      store.challenges[session.cfg.id] = st.score.total;
    if (kind === 'daily') store.daily[session.cfg.date] = { score: st.score.total, won: won };
    if (session.cfg.lesson && t && t.reason !== Rules.TERMINAL.RESIGN &&
        (won || session.cfg.lesson.goal === 'play')) store.lessons[session.cfg.lesson.id] = true;
    store.save = null;
    grantAchievements(won);
    saveStore();

    render();
    showResults();
  }

  function grantAchievements(won) {
    var a = store.achievements;
    if (won) a['first-line'] = true;
    if (store.stats.streak >= 3) a['streak-3'] = true;
    if (store.stats.played >= 100) a['centurion'] = true;
    if (Object.keys(store.challenges).length >= 4) a['challenge-set'] = true;
    var masteryDone = Content.JOURNEY.every(function (l) { return !l.mastery || (store.journey[l.id] || 0) > 0; });
    if (masteryDone) a['journey-mastery'] = true;
  }

  function outcomeHeadline(st) {
    var t = st.terminal;
    if (!t) return { text: 'Game paused', cls: '' };
    if (t.reason === Rules.TERMINAL.FULL) return { text: 'Board full — a draw', cls: '' };
    if (t.winner === 1) return { text: 'You made four', cls: 'win' };
    if (t.reason === Rules.TERMINAL.RESIGN) return { text: 'You resigned', cls: 'loss' };
    if (t.reason === Rules.TERMINAL.TIME) return { text: 'Time up', cls: 'loss' };
    if (t.reason === Rules.TERMINAL.MOVES) return { text: 'Drop budget spent', cls: 'loss' };
    return { text: playerName(t.winner) + ' made four', cls: 'loss' };
  }

  function showResults() {
    var st = session.state, head = outcomeHeadline(st);
    var h = $('res-headline');
    h.textContent = head.text;
    h.className = 'headline ' + head.cls;

    var stars = Rules.starsFor(st);
    $('res-stars').textContent = session.cfg.kind === 'journey'
      ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';

    var dl = $('res-breakdown');
    clear(dl);
    var comp = st.score.components;
    var rows = [
      ['Line completed', comp.win],
      ['Draw', comp.draw],
      ['Under par drops', comp.parMoves],
      ['Speed bonus', comp.speed]
    ].filter(function (r) { return r[1] > 0; });
    rows.push(['Your drops', st.dropsBy[1]]);
    rows.push(['Time', formatTime(elapsedMs())]);
    rows.forEach(function (r) {
      dl.appendChild(el('dt', null, r[0]));
      dl.appendChild(el('dd', null, String(r[1])));
    });
    dl.appendChild(el('dt', 'total', 'Score'));
    dl.appendChild(el('dd', 'total', String(st.score.total)));

    var next = nextStage();
    var btn = $('res-next');
    btn.hidden = !next;
    if (next) btn.textContent = 'Next: ' + next.name;

    openOverlay('overlay-results');
    announce(head.text + '. Score ' + st.score.total + '.');
  }

  function nextStage() {
    if (!session || session.cfg.kind !== 'journey') return null;
    if (!session.state.terminal || session.state.terminal.winner !== 1) return null;
    for (var i = 0; i < Content.JOURNEY.length; i++)
      if (Content.JOURNEY[i].id === session.cfg.id) return Content.JOURNEY[i + 1] || null;
    return null;
  }

  // ---------- lessons ----------

  function checkLessonGoal() {
    var l = session.cfg.lesson;
    if (!l || session.over) return false;
    var done = false;
    if (l.goal === 'drop-any') done = session.lessonDrops.length >= 1;
    else if (l.goal === 'stack') {
      var counts = {};
      done = session.lessonDrops.some(function (c) { counts[c] = (counts[c] || 0) + 1; return counts[c] >= 2; });
    }
    if (!done) return false;
    pauseClock();
    stopAI();
    session.over = true;
    store.lessons[l.id] = true;
    store.save = null;
    saveStore();
    $('res-headline').textContent = 'Lesson complete';
    $('res-headline').className = 'headline win';
    $('res-stars').textContent = '';
    clear($('res-breakdown'));
    $('res-next').hidden = true;
    openOverlay('overlay-results');
    announce('Lesson complete.');
    return true;
  }

  // ---------- save / resume ----------

  function persistSave() {
    if (!session || session.over) return;
    if (session.cfg.kind === 'lesson') return;   // lessons restart cheaply
    store.save = {
      key: session.key,
      seed: session.cfg.seed,
      drops: session.state.drops.slice(session.state.initialDrops),
      elapsedMs: Math.floor(elapsedMs())
    };
    saveStore();
  }

  function resumeSaved() {
    var s = store.save;
    if (!s) return;
    startSession(s.key, { seed: s.seed, drops: s.drops, elapsedMs: s.elapsedMs });
  }

  // ---------- rendering ----------

  function render() {
    if (!session) return;
    var st = session.state;
    view.sync(st, { theme: session.theme, hover: hoverCol });
    updateTurn();
    updateMeta();
    updateColumns();
    updateGridMirror();
    var t = $('btn-undo'), hh = $('btn-hint');
    t.disabled = session.over || !session.cfg.mechanics.undo || !session.history.length;
    hh.disabled = session.over || !session.cfg.mechanics.hint || (st.current !== 1 && session.aiLevel > 0);
  }

  function updateTurn() {
    if (!session) return;
    var st = session.state, chip = $('turn-chip'), label = $('turn-label');
    var p = st.terminal ? (st.terminal.winner || 1) : st.current;
    chip.style.background = hex(playerColor(p));
    chip.textContent = playerIcon(p);
    if (st.terminal) label.textContent = outcomeHeadline(st).text;
    else if (session.aiLevel === 0) label.textContent = playerName(st.current) === 'You' ? 'Your turn' : playerName(st.current) + '’s turn';
    else if (st.current === 1) label.textContent = 'Your turn';
    else label.textContent = playerName(st.current) + ' is thinking…';
  }

  function formatTime(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function updateMeta() {
    if (!session) return;
    var st = session.state, cfg = session.cfg;
    var bits = [];
    if (cfg.timeLimitSec > 0) {
      bits.push('<span>Time left <b>' + formatTime(cfg.timeLimitSec * 1000 - elapsedMs()) + '</b></span>');
    } else {
      bits.push('<span>Time <b>' + formatTime(elapsedMs()) + '</b></span>');
    }
    if (cfg.moveLimit > 0) bits.push('<span>Drops left <b>' + Math.max(0, cfg.moveLimit - st.dropsBy[1]) + '</b></span>');
    else bits.push('<span>Drops <b>' + st.dropsBy[1] + '</b></span>');
    if (cfg.par && cfg.par.moves > 0) bits.push('<span>Par <b>' + cfg.par.moves + '</b></span>');
    $('hud-meta').innerHTML = bits.join('');
    $('hud-objective').textContent = objectiveText();
  }

  function objectiveText() {
    var cfg = session.cfg;
    var goal = 'Connect ' + cfg.connect + ' of your discs in a row.';
    if (cfg.lesson) return cfg.lesson.text;
    if (cfg.kind === 'challenge') return goal + ' ' + (cfg.blurb || '');
    if (cfg.moveLimit > 0) return goal + ' Within ' + cfg.moveLimit + ' of your drops.';
    if (cfg.timeLimitSec > 0) return goal + ' Within ' + cfg.timeLimitSec + ' seconds.';
    return goal;
  }

  // Column buttons are laid over the canvas so pointer, keyboard, and
  // assistive tech all drive the same target set.
  function updateColumns() {
    var layer = $('col-layer'), st = session.state;
    if (layer.childElementCount !== st.cols) {
      clear(layer);
      for (var c = 0; c < st.cols; c++) {
        var b = el('button');
        b.type = 'button';
        b.dataset.col = String(c);
        layer.appendChild(b);
      }
    }
    var banned = st.cfg.bannedCols;
    for (var i = 0; i < layer.children.length; i++) {
      var btn = layer.children[i];
      var col = i;
      var rect = view.columnRect(col);
      btn.style.left = rect.left + 'px';
      btn.style.top = rect.top + 'px';
      btn.style.width = rect.width + 'px';
      btn.style.height = rect.height + 'px';
      var full = st.heights[col] >= st.rows;
      var isBanned = banned.indexOf(col) !== -1;
      var mine = st.current === 1 || session.aiLevel === 0;
      btn.disabled = !!st.terminal || full || isBanned || !mine;
      var desc = 'Column ' + (col + 1) + ', ' + st.heights[col] + ' of ' + st.rows + ' filled';
      if (isBanned) desc += ', sealed';
      else if (full) desc += ', full';
      else desc += ', drops into row ' + (st.heights[col] + 1);
      if (session.hintCol === col) desc += ' (hint)';
      btn.setAttribute('aria-label', desc);
      btn.style.borderColor = session.hintCol === col ? hex(playerColor(1)) : 'transparent';
    }
  }

  // Concise navigable text model of the board for screen readers.
  function updateGridMirror() {
    var st = session.state, lines = [];
    for (var r = st.rows - 1; r >= 0; r--) {
      var cells = [];
      for (var c = 0; c < st.cols; c++) {
        var v = Rules.cellAt(st, c, r);
        cells.push(v ? playerName(v) : 'empty');
      }
      lines.push('Row ' + (r + 1) + ': ' + cells.join(', '));
    }
    $('grid-mirror').textContent = lines.join('. ');
  }

  function announce(text, isError) {
    var n = $('play-status');
    n.textContent = text;
    n.className = 'status-line' + (isError ? ' error' : '');
  }
  function setStatus(text) { announce(text, false); }

  // ---------- screens & overlays ----------

  function showScreen(name) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++)
      screens[i].classList.toggle('active', screens[i].id === 'screen-' + name);
    if (name !== 'play') { pauseClock(); stopAI(); }
    lastScreen = name;
    var heading = document.querySelector('#screen-' + name + ' h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    }
    if (name === 'title') refreshTitle();
  }

  function openOverlay(id) {
    var o = $(id);
    o.classList.add('active');
    var focusable = o.querySelector('button:not([hidden])');
    if (focusable) focusable.focus();
  }
  function closeOverlay(id) { $(id).classList.remove('active'); }

  function openPause() {
    if (!session || session.over) return;
    if ($('overlay-pause').classList.contains('active')) return;
    session.paused = true;
    pauseClock();
    stopAI();
    openOverlay('overlay-pause');
  }

  function closePause() {
    if (!session) return;
    session.paused = false;
    closeOverlay('overlay-pause');
    if (!session.over) { resumeClock(); maybeAI(); }
  }

  function leaveGame() {
    persistSave();
    pauseClock();
    stopAI();
    closeOverlay('overlay-pause');
    closeOverlay('overlay-results');
    if (session) session.paused = false;
    showScreen('title');
  }

  // ---------- menus ----------

  function refreshTitle() {
    var totalStars = Object.keys(store.journey).reduce(function (a, k) { return a + store.journey[k]; }, 0);
    $('title-stats').textContent = store.stats.played
      ? store.stats.played + ' games · ' + store.stats.wins + ' wins · ' + totalStars + ' stars'
      : 'New player — start with Learn or Play.';
    var resume = $('btn-resume');
    resume.hidden = !store.save;
    if (store.save) {
      var cfg = configFor(store.save.key, store.save.seed);
      resume.textContent = 'Resume ' + ((cfg && cfg.name) || 'game');
    }
  }

  function buildJourney() {
    var wrap = $('journey-list');
    clear(wrap);
    var unlocked = true;
    Content.JOURNEY.forEach(function (l, idx) {
      var stars = store.journey[l.id] || 0;
      var open = idx === 0 || unlocked;
      var b = el('button', 'card' + (l.mastery ? ' mastery' : ''));
      b.type = 'button';
      b.appendChild(el('span', 'title', (idx + 1) + '. ' + l.name));
      b.appendChild(el('span', 'stars', '★'.repeat(stars) + '☆'.repeat(3 - stars)));
      if (!open) {
        b.disabled = true;
        b.setAttribute('aria-disabled', 'true');
        b.appendChild(el('span', 'sub', 'Locked'));
      } else {
        b.addEventListener('click', function () { startSession('journey:' + l.id); });
      }
      wrap.appendChild(b);
      // A mastery stage gates the stages after it until it is won.
      if (l.mastery && stars === 0) unlocked = false;
    });
  }

  function buildList(container, items, onPick) {
    clear(container);
    items.forEach(function (it) {
      var b = el('button', 'card');
      b.type = 'button';
      b.appendChild(el('span', 'title', it.title));
      if (it.sub) b.appendChild(el('span', 'sub', it.sub));
      b.addEventListener('click', function () { onPick(it); });
      container.appendChild(b);
    });
  }

  function buildPractice() {
    buildList($('practice-list'), Content.PRACTICE.map(function (p) {
      return { id: p.id, title: p.name, sub: p.blurb };
    }), function (it) { startSession('practice:' + it.id); });
  }

  function buildChallenges() {
    buildList($('challenge-list'), Content.CHALLENGES.map(function (c) {
      var best = store.challenges[c.id];
      return { id: c.id, title: c.name, sub: c.blurb + (best ? ' · best ' + best : '') };
    }), function (it) { startSession('challenge:' + it.id); });
  }

  function buildLearn() {
    buildList($('learn-list'), Content.LESSONS.map(function (l) {
      return { id: l.id, title: l.title, sub: (store.lessons[l.id] ? '✓ done · ' : '') + l.text };
    }), function (it) { startSession('lesson:' + it.id); });
  }

  function todayUTC() { return new Date().toISOString().slice(0, 10); }

  function startDaily() {
    var d = todayUTC();
    var done = store.daily[d];
    if (done) announce('You already played today’s board. Replaying for practice.');
    startSession('daily:' + d);
  }

  // ---------- settings ----------

  function applySettings() {
    document.body.classList.toggle('high-contrast', store.settings.highContrast);
    document.body.classList.toggle('large-text', store.settings.largeText);
    Sfx.setVolume(store.settings.volume);
    Sfx.setMuted(store.settings.muted);
    if (view) {
      view.setReducedMotion(store.settings.reducedMotion);
      view.setHighContrast(store.settings.highContrast);
    }
    $('set-volume').value = String(Math.round(store.settings.volume * 100));
    $('set-muted').checked = store.settings.muted;
    $('set-motion').checked = store.settings.reducedMotion;
    $('set-contrast').checked = store.settings.highContrast;
    $('set-text').checked = store.settings.largeText;
    if (session) render();
  }

  function bindSettings() {
    $('set-volume').addEventListener('input', function () {
      store.settings.volume = (+this.value || 0) / 100; saveStore(); applySettings();
    });
    [['set-muted', 'muted'], ['set-motion', 'reducedMotion'],
     ['set-contrast', 'highContrast'], ['set-text', 'largeText']].forEach(function (pair) {
      $(pair[0]).addEventListener('change', function () {
        store.settings[pair[1]] = this.checked; saveStore(); applySettings();
      });
    });
    $('set-reset').addEventListener('click', function () {
      if (!root.confirm('Erase all Fourfold progress on this device?')) return;
      store = clone(DEFAULT_STORE);
      saveStore();
      applySettings();
      refreshTitle();
      announce('Progress erased.');
    });
  }

  // ---------- input ----------

  function bindInput() {
    var layer = $('col-layer'), canvas = $('board');

    layer.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-col]');
      if (!b || b.disabled) return;
      humanDrop(+b.dataset.col);
    });
    layer.addEventListener('pointermove', function (e) {
      var b = e.target.closest('button[data-col]');
      var c = b ? +b.dataset.col : -1;
      if (c !== hoverCol) { hoverCol = c; view.setHover(c); }
    });
    layer.addEventListener('pointerleave', function () { hoverCol = -1; view.setHover(-1); });
    layer.addEventListener('focusin', function (e) {
      var b = e.target.closest('button[data-col]');
      if (b) { hoverCol = +b.dataset.col; view.setHover(hoverCol); }
    });
    layer.addEventListener('keydown', function (e) {
      var b = e.target.closest('button[data-col]');
      if (!b) return;
      var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      var n = layer.children.length, i = +b.dataset.col;
      for (var k = 1; k <= n; k++) {
        var j = (i + dir * k + n * k) % n;
        if (!layer.children[j].disabled) { layer.children[j].focus(); break; }
      }
    });

    // Clicking the canvas itself (outside a button) still drops, matching
    // the "tap the board" expectation on touch.
    canvas.addEventListener('click', function (e) {
      var c = view.columnFromPoint(e.clientX, e.clientY);
      if (c >= 0) humanDrop(c);
    });

    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input, textarea, select')) return;
      var playing = $('screen-play').classList.contains('active');
      if (e.key === 'Escape') {
        if ($('overlay-results').classList.contains('active')) return;
        if ($('overlay-pause').classList.contains('active')) { closePause(); return; }
        if (playing) { openPause(); return; }
        showScreen('title');
        return;
      }
      if (!playing || $('overlay-pause').classList.contains('active') ||
          $('overlay-results').classList.contains('active')) return;
      var k = e.key.toLowerCase();
      if (k === 'p') { e.preventDefault(); openPause(); }
      else if (k === 'u') { e.preventDefault(); undo(); }
      else if (k === 'h') { e.preventDefault(); hint(); }
      else if (k === 'r') { e.preventDefault(); restart(); }
      else if (k >= '1' && k <= '9') {
        var c = +k - 1;
        if (session && c < session.state.cols) { e.preventDefault(); humanDrop(c); }
      }
    });

    root.addEventListener('resize', function () { if (session) updateColumns(); });
    root.addEventListener('orientationchange', function () { if (session) setTimeout(updateColumns, 120); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if ($('screen-play').classList.contains('active') && session && !session.over) openPause();
      }
    });
  }

  function bindNav() {
    document.querySelectorAll('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = b.dataset.goto;
        if (t === 'journey') buildJourney();
        if (t === 'practice') buildPractice();
        if (t === 'challenges') buildChallenges();
        if (t === 'learn') buildLearn();
        showScreen(t);
      });
    });
    $('btn-resume').addEventListener('click', resumeSaved);
    $('btn-daily').addEventListener('click', startDaily);
    $('btn-pause').addEventListener('click', openPause);
    $('btn-undo').addEventListener('click', undo);
    $('btn-hint').addEventListener('click', hint);
    $('btn-restart').addEventListener('click', restart);
    $('pause-resume').addEventListener('click', closePause);
    $('pause-restart').addEventListener('click', restart);
    $('pause-resign').addEventListener('click', function () { closeOverlay('overlay-pause'); if (session) session.paused = false; resign(); });
    $('pause-leave').addEventListener('click', leaveGame);
    $('pause-settings').addEventListener('click', function () { closeOverlay('overlay-pause'); showScreen('settings'); });
    $('res-retry').addEventListener('click', function () { closeOverlay('overlay-results'); restart(); });
    $('res-next').addEventListener('click', function () {
      var n = nextStage();
      closeOverlay('overlay-results');
      if (n) startSession('journey:' + n.id); else showScreen('title');
    });
    $('res-menu').addEventListener('click', function () { closeOverlay('overlay-results'); showScreen('title'); });
  }

  // ---------- boot ----------

  function boot(deps) {
    var canvas = $('board');
    view = deps.createView(canvas, {
      theme: Content.THEMES[0],
      colors: { 1: Content.PLAYERS[1].color, 2: Content.PLAYERS[2].color,
                3: Content.PLAYERS[3].color, 4: Content.PLAYERS[4].color },
      icons: { 1: Content.PLAYERS[1].icon, 2: Content.PLAYERS[2].icon,
               3: Content.PLAYERS[3].icon, 4: Content.PLAYERS[4].icon }
    });
    view.setRunning(false);

    if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches
        && store.settings.reducedMotion !== true) {
      store.settings.reducedMotion = true;
    }

    bindNav();
    bindInput();
    bindSettings();
    applySettings();
    showScreen('title');

    root.FFUI.store = store;
    root.FFUI.startSession = startSession;
    root.FFUI.getSession = function () { return session; };
    root.__ffReady = true;
  }

  root.FFUI = { boot: boot };
})(typeof self !== 'undefined' ? self : this);
