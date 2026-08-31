/* Fourfold — pure deterministic rules engine.
 * No rendering, no DOM, no Date.now(): every transition derives from
 * (state, command) only. Usable from browser (window.FFRules) and Node.
 *
 * Core loop: pick a column, a disc falls to the lowest free cell, lines
 * of `connect` are tested, and the turn passes. First line wins; a full
 * board is a draw. Board size, connect length, and player count (2–4)
 * are config-driven so challenges can alter the layout.
 */
(function (root, factory) {
  var RNG = (typeof module === 'object' && module.exports) ? require('./rng.js') : root.FFRNG;
  var api = factory(RNG);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FFRules = api;
})(typeof self !== 'undefined' ? self : this, function (RNG) {
  'use strict';

  var STATE_VERSION = 1;
  var WIN_BASE = 1000;       // points for completing a line
  var DRAW_BASE = 300;       // points for a full-board draw
  var PAR_MOVE_PT = 25;      // win bonus per drop under par
  var SPEED_PT_PER_SEC = 5;  // win bonus per second under par time

  var TERMINAL = {
    LINE: 'line-four',       // a player completed a line of `connect`
    FULL: 'board-full',      // draw
    RESIGN: 'resigned',
    MOVES: 'move-limit',     // player 1 exceeded the challenge drop budget
    TIME: 'time-up'
  };

  var INVALID = {
    ENDED: 'game-ended',
    BAD_CMD: 'unknown-command',
    BAD_SHAPE: 'malformed-command',
    BAD_COL: 'bad-column',
    BANNED: 'banned-column',
    FULL_COL: 'column-full',
    TURN: 'out-of-turn'
  };

  var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  // ---------- helpers ----------

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // Stable stringify: object keys sorted recursively → canonical hashing.
  function stableStringify(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) {
      return JSON.stringify(k) + ':' + stableStringify(v[k]);
    }).join(',') + '}';
  }

  function hashStr(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }

  function normalizeCfg(cfg) {
    if (!cfg || typeof cfg !== 'object') throw new Error('bad cfg');
    var board = cfg.board || {};
    var cols = board.cols == null ? 7 : board.cols;
    var rows = board.rows == null ? 6 : board.rows;
    if (!Number.isInteger(cols) || cols < 4 || cols > 12) throw new Error('bad cols');
    if (!Number.isInteger(rows) || rows < 4 || rows > 12) throw new Error('bad rows');
    var connect = cfg.connect == null ? 4 : cfg.connect;
    if (!Number.isInteger(connect) || connect < 3 || connect > Math.max(cols, rows)) throw new Error('bad connect');
    var players = cfg.players == null ? 2 : cfg.players;
    if (!Number.isInteger(players) || players < 2 || players > 4) throw new Error('bad players');
    var out = Object.assign({}, cfg, {
      id: String(cfg.id || 'game'),
      version: cfg.version == null ? 1 : cfg.version,
      kind: cfg.kind || 'practice',
      seed: (cfg.seed >>> 0),
      board: { cols: cols, rows: rows },
      connect: connect,
      players: players,
      bannedCols: (cfg.bannedCols || []).filter(function (c) { return Number.isInteger(c) && c >= 0 && c < cols; }),
      preset: cfg.preset || [],
      moveLimit: cfg.moveLimit || 0,
      timeLimitSec: cfg.timeLimitSec || 0,
      par: Object.assign({ moves: 0, timeSec: 0 }, cfg.par || {}),
      mechanics: Object.assign({ undo: true, hint: true }, cfg.mechanics || {}),
      theme: cfg.theme || 'glacier'
    });
    return out;
  }

  // ---------- creation ----------

  function createGame(cfg) {
    var c = normalizeCfg(cfg);
    var streams = RNG.streams(c.seed);
    var state = {
      v: STATE_VERSION,
      seed: c.seed,
      cfg: c,
      cols: c.board.cols,
      rows: c.board.rows,
      connect: c.connect,
      players: c.players,
      grid: new Array(c.board.cols * c.board.rows).fill(0), // col*rows+row, row 0 = bottom
      heights: new Array(c.board.cols).fill(0),
      current: 1,
      turn: 0,                 // monotonic; increments once per applied drop
      drops: [],               // ordered drop history (preset + play)
      dropsBy: {},             // player -> drops made during play (excludes preset)
      initialDrops: 0,
      elapsedMs: 0,            // authoritative elapsed, fed in via commands
      terminal: null,          // {reason, winner, line?}
      score: { components: { win: 0, draw: 0, parMoves: 0, speed: 0 }, total: 0 },
      stats: { invalid: 0 },
      rngState: streams.rules.state
    };
    for (var p = 1; p <= c.players; p++) state.dropsBy[p] = 0;

    // Preset = versioned initial state, authored as alternating drop columns
    // starting with player 1. Validated through the same drop path as play.
    for (var i = 0; i < c.preset.length; i++) {
      var col = c.preset[i];
      if (!Number.isInteger(col) || col < 0 || col >= state.cols) throw new Error('preset out of range');
      if (state.heights[col] >= state.rows) throw new Error('preset overflows column ' + col);
      place(state, col, false);
      if (state.terminal) throw new Error('preset already terminal');
    }
    state.initialDrops = state.drops.length;
    for (var q = 1; q <= c.players; q++) state.dropsBy[q] = 0;
    return state;
  }

  // ---------- core ----------

  function cellAt(state, col, row) { return state.grid[col * state.rows + row]; }

  function countDir(state, col, row, dc, dr, player) {
    var n = 0, c = col + dc, r = row + dr;
    while (c >= 0 && c < state.cols && r >= 0 && r < state.rows && cellAt(state, c, r) === player) {
      n++; c += dc; r += dr;
    }
    return n;
  }

  // Returns the winning line through (col,row) for player, or null.
  function findLine(state, col, row, player) {
    for (var d = 0; d < DIRS.length; d++) {
      var dc = DIRS[d][0], dr = DIRS[d][1];
      var a = countDir(state, col, row, dc, dr, player);
      var b = countDir(state, col, row, -dc, -dr, player);
      if (a + b + 1 >= state.connect) {
        var line = [[col, row]];
        var i, c, r;
        for (i = 1; i <= a; i++) line.push([col + dc * i, row + dr * i]);
        for (i = 1; i <= b; i++) line.push([col - dc * i, row - dr * i]);
        return line;
      }
    }
    return null;
  }

  function boardFull(state) {
    for (var c = 0; c < state.cols; c++)
      if (state.heights[c] < state.rows && state.cfg.bannedCols.indexOf(c) === -1) return false;
    return true;
  }

  // Internal placement shared by preset and live drops.
  function place(state, col, countForPlayer) {
    var row = state.heights[col];
    var player = state.current;
    state.grid[col * state.rows + row] = player;
    state.heights[col] = row + 1;
    state.drops.push(col);
    if (countForPlayer) state.dropsBy[player]++;
    state.turn++;
    var events = [{ t: 'drop', col: col, row: row, player: player, turn: state.turn }];

    var line = findLine(state, col, row, player);
    if (line) {
      state.terminal = { reason: TERMINAL.LINE, winner: player, line: line };
      events.push({ t: 'win', player: player, line: line });
    } else if (boardFull(state)) {
      state.terminal = { reason: TERMINAL.FULL, winner: 0 };
      events.push({ t: 'draw' });
    } else if (countForPlayer && player === 1 && state.cfg.moveLimit > 0 &&
               state.dropsBy[1] >= state.cfg.moveLimit) {
      state.terminal = { reason: TERMINAL.MOVES, winner: state.players === 2 ? 2 : 0 };
      events.push({ t: 'move-limit' });
    } else {
      state.current = (state.current % state.players) + 1;
    }
    if (state.terminal) finalizeScore(state);
    return events;
  }

  // Score is always from player 1's (the local player's) perspective.
  function finalizeScore(state) {
    var comp = { win: 0, draw: 0, parMoves: 0, speed: 0 };
    var t = state.terminal;
    if (t.winner === 1) {
      comp.win = WIN_BASE;
      if (state.cfg.par.moves > 0) {
        comp.parMoves = Math.max(0, state.cfg.par.moves - state.dropsBy[1]) * PAR_MOVE_PT;
      }
      if (state.cfg.par.timeSec > 0) {
        var under = state.cfg.par.timeSec * 1000 - state.elapsedMs;
        comp.speed = Math.max(0, Math.floor(under / 1000)) * SPEED_PT_PER_SEC;
      }
    } else if (t.winner === 0 && t.reason === TERMINAL.FULL) {
      comp.draw = DRAW_BASE;
    }
    state.score = { components: comp, total: comp.win + comp.draw + comp.parMoves + comp.speed };
  }

  // Stars (journey): 0 not won; 1 win; +1 at/under par drops; +1 well under.
  function starsFor(state) {
    if (!state.terminal || state.terminal.winner !== 1) return 0;
    var par = state.cfg.par.moves;
    if (!par) return 1;
    var d = state.dropsBy[1];
    if (d <= Math.max(1, Math.floor(par * 0.7))) return 3;
    if (d <= par) return 2;
    return 1;
  }

  // ---------- public API ----------

  function legalActions(state) {
    if (state.terminal) return [];
    var out = [];
    for (var c = 0; c < state.cols; c++) {
      if (state.cfg.bannedCols.indexOf(c) !== -1) continue;
      if (state.heights[c] >= state.rows) continue;
      out.push({ type: 'drop', col: c, row: state.heights[c] });
    }
    return out;
  }

  // Shape check only — returns an error string or null. Used at trust
  // boundaries (network input, replay logs) before applyCommand.
  function validateCommandShape(cmd) {
    if (!cmd || typeof cmd !== 'object') return INVALID.BAD_SHAPE;
    if (cmd.id != null && typeof cmd.id !== 'string') return INVALID.BAD_SHAPE;
    switch (cmd.type) {
      case 'drop':
        if (!Number.isInteger(cmd.col)) return INVALID.BAD_SHAPE;
        if (cmd.player != null && !Number.isInteger(cmd.player)) return INVALID.BAD_SHAPE;
        if (cmd.elapsedMs != null && (typeof cmd.elapsedMs !== 'number' || !(cmd.elapsedMs >= 0))) return INVALID.BAD_SHAPE;
        return null;
      case 'resign':
      case 'timeout':
        if (cmd.player != null && !Number.isInteger(cmd.player)) return INVALID.BAD_SHAPE;
        return null;
      default:
        return INVALID.BAD_CMD;
    }
  }

  function applyCommand(state, cmd) {
    var shapeErr = validateCommandShape(cmd);
    if (shapeErr) { state.stats.invalid++; return { ok: false, reason: shapeErr, state: state }; }
    if (state.terminal) { state.stats.invalid++; return { ok: false, reason: INVALID.ENDED, state: state }; }

    if (typeof cmd.elapsedMs === 'number' && cmd.elapsedMs > state.elapsedMs) {
      state.elapsedMs = Math.floor(cmd.elapsedMs);
    }

    if (cmd.type === 'drop') {
      var player = cmd.player == null ? state.current : cmd.player;
      if (player !== state.current) { state.stats.invalid++; return { ok: false, reason: INVALID.TURN, state: state }; }
      var col = cmd.col;
      if (col < 0 || col >= state.cols) { state.stats.invalid++; return { ok: false, reason: INVALID.BAD_COL, state: state }; }
      if (state.cfg.bannedCols.indexOf(col) !== -1) { state.stats.invalid++; return { ok: false, reason: INVALID.BANNED, state: state }; }
      if (state.heights[col] >= state.rows) { state.stats.invalid++; return { ok: false, reason: INVALID.FULL_COL, state: state }; }
      var events = place(state, col, true);
      return { ok: true, state: state, events: events };
    }

    // resign / timeout
    var who = cmd.player == null ? state.current : cmd.player;
    if (who < 1 || who > state.players) { state.stats.invalid++; return { ok: false, reason: INVALID.BAD_SHAPE, state: state }; }
    if (cmd.type === 'timeout' && state.cfg.timeLimitSec <= 0) {
      state.stats.invalid++; return { ok: false, reason: INVALID.BAD_CMD, state: state };
    }
    var winner = 0;
    if (state.players === 2) winner = who === 1 ? 2 : 1;
    state.terminal = { reason: cmd.type === 'timeout' ? TERMINAL.TIME : TERMINAL.RESIGN, winner: winner };
    finalizeScore(state);
    return { ok: true, state: state, events: [{ t: state.terminal.reason, player: who }] };
  }

  // ---------- serialization ----------

  function serialize(state) { return JSON.stringify(state); }

  function deserialize(json) {
    var s = JSON.parse(json);
    if (!s || typeof s !== 'object' || s.v > STATE_VERSION) throw new Error('unsupported state version');
    s.v = STATE_VERSION;
    // Re-derive invariants rather than trusting the payload.
    s.cfg = normalizeCfg(s.cfg);
    if (!Array.isArray(s.grid) || s.grid.length !== s.cfg.board.cols * s.cfg.board.rows) throw new Error('bad grid');
    return s;
  }

  function hashState(state) {
    return hashStr(stableStringify({
      v: state.v, seed: state.seed, cfg: {
        board: state.cfg.board, connect: state.connect, players: state.players,
        bannedCols: state.cfg.bannedCols, moveLimit: state.cfg.moveLimit,
        timeLimitSec: state.cfg.timeLimitSec
      },
      grid: state.grid, current: state.current, turn: state.turn,
      drops: state.drops, dropsBy: state.dropsBy,
      terminal: state.terminal, score: state.score
    }));
  }

  // Replay a command log from scratch; returns final state or throws.
  function replay(cfg, log) {
    var state = createGame(cfg);
    var seen = {};
    for (var i = 0; i < log.length; i++) {
      var cmd = log[i];
      if (validateCommandShape(cmd)) throw new Error('malformed command at ' + i);
      if (cmd.id) { if (seen[cmd.id]) continue; seen[cmd.id] = true; }
      var res = applyCommand(state, cmd);
      if (!res.ok) throw new Error('illegal command at ' + i + ': ' + res.reason);
    }
    return state;
  }

  return {
    STATE_VERSION: STATE_VERSION,
    TERMINAL: TERMINAL,
    INVALID: INVALID,
    WIN_BASE: WIN_BASE, DRAW_BASE: DRAW_BASE,
    PAR_MOVE_PT: PAR_MOVE_PT, SPEED_PT_PER_SEC: SPEED_PT_PER_SEC,
    createGame: createGame,
    normalizeCfg: normalizeCfg,
    legalActions: legalActions,
    validateCommandShape: validateCommandShape,
    applyCommand: applyCommand,
    findLine: findLine,
    cellAt: cellAt,
    starsFor: starsFor,
    serialize: serialize,
    deserialize: deserialize,
    hashState: hashState,
    stableStringify: stableStringify,
    replay: replay
  };
});
