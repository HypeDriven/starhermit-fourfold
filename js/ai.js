/* Fourfold — deterministic practice AI.
 * All difficulty levels consume the same legal-action API as the player;
 * search randomness comes from a seeded stream derived per position, so
 * the same (state, seed, level) always yields the same column.
 * UMD: browser (window.FFAI) and Node.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FFAI = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LEVELS = [
    { id: 1, name: 'Casual',  depth: 0 },
    { id: 2, name: 'Steady',  depth: 1 },
    { id: 3, name: 'Sharp',   depth: 6 },
    { id: 4, name: 'Master',  depth: 8 }
  ];

  // ---------- lightweight mutable board (apply/undo, no allocation) ----------

  function fromState(state) {
    return {
      cols: state.cols,
      rows: state.rows,
      connect: state.connect,
      grid: Int8Array.from(state.grid),
      heights: Int8Array.from(state.heights),
      banned: state.cfg.bannedCols
    };
  }

  function legalCols(b) {
    var out = [];
    for (var c = 0; c < b.cols; c++)
      if (b.heights[c] < b.rows && b.banned.indexOf(c) === -1) out.push(c);
    return out;
  }

  function drop(b, col, player) {
    b.grid[col * b.rows + b.heights[col]] = player;
    b.heights[col]++;
  }
  function undrop(b, col) {
    b.heights[col]--;
    b.grid[col * b.rows + b.heights[col]] = 0;
  }

  function winsAt(b, col, player) {
    var row = b.heights[col];
    if (row >= b.rows) return false;
    var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (var d = 0; d < 4; d++) {
      var n = 1;
      for (var s = -1; s <= 1; s += 2) {
        var dc = DIRS[d][0] * s, dr = DIRS[d][1] * s;
        var c = col + dc, r = row + dr;
        while (c >= 0 && c < b.cols && r >= 0 && r < b.rows &&
               b.grid[c * b.rows + r] === player) { n++; c += dc; r += dr; }
      }
      if (n >= b.connect) return true;
    }
    return false;
  }

  // Immediate winning columns for a player.
  function winningCols(b, player) {
    var out = [];
    var cols = legalCols(b);
    for (var i = 0; i < cols.length; i++)
      if (winsAt(b, cols[i], player)) out.push(cols[i]);
    return out;
  }

  // ---------- heuristic evaluation (2-player) ----------

  function evalWindows(b, me, opp) {
    var score = 0, k = b.connect;
    var center = (b.cols - 1) / 2;
    for (var c = 0; c < b.cols; c++)
      for (var r = 0; r < b.heights[c]; r++) {
        var v = b.grid[c * b.rows + r];
        if (v === me) score += 3 - Math.min(3, Math.abs(c - center));
        else if (v === opp) score -= 3 - Math.min(3, Math.abs(c - center));
      }
    var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (var c0 = 0; c0 < b.cols; c0++)
      for (var r0 = 0; r0 < b.rows; r0++)
        for (var d = 0; d < 4; d++) {
          var dc = DIRS[d][0], dr = DIRS[d][1];
          var ec = c0 + dc * (k - 1), er = r0 + dr * (k - 1);
          if (ec < 0 || ec >= b.cols || er < 0 || er >= b.rows) continue;
          var mine = 0, theirs = 0, empty = 0;
          for (var i = 0; i < k; i++) {
            var v2 = b.grid[(c0 + dc * i) * b.rows + (r0 + dr * i)];
            if (v2 === me) mine++;
            else if (v2 === opp) theirs++;
            else empty++;
          }
          if (mine > 0 && theirs > 0) continue;
          if (mine === k - 1 && empty === 1) score += 80;
          else if (mine === k - 2 && empty === 2) score += 12;
          else if (mine === k - 3 && empty === 3) score += 3;
          if (theirs === k - 1 && empty === 1) score -= 90;
          else if (theirs === k - 2 && empty === 2) score -= 14;
        }
    return score;
  }

  // Center-out column order makes search deterministic without randomness.
  function orderedCols(b, rng) {
    var cols = legalCols(b);
    cols.sort(function (a, b2) {
      var ca = Math.abs(a - (b.cols - 1) / 2), cb = Math.abs(b2 - (b.cols - 1) / 2);
      return ca - cb || a - b2;
    });
    return cols;
  }

  var WIN_SCORE = 1000000;

  function negamax(b, player, depth, alpha, beta, ply) {
    var cols = orderedCols(b);
    if (cols.length === 0) return 0; // draw
    if (depth === 0) return evalWindows(b, player, 3 - player);
    var best = -Infinity;
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      if (winsAt(b, c, player)) return WIN_SCORE - ply; // faster win preferred
      drop(b, c, player);
      var v = -negamax(b, 3 - player, depth - 1, -beta, -alpha, ply + 1);
      undrop(b, c);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  function searchMove(b, player, depth, rng) {
    var cols = orderedCols(b, rng);
    var best = -Infinity, bestCols = [];
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      var v;
      if (winsAt(b, c, player)) v = WIN_SCORE;
      else {
        drop(b, c, player);
        v = -negamax(b, 3 - player, depth - 1, -Infinity, Infinity, 1);
        undrop(b, c);
      }
      if (v > best) { best = v; bestCols = [c]; }
      else if (v === best) bestCols.push(c);
    }
    // Seeded tie-break among equally-scored columns.
    return bestCols[rng ? rng.int(bestCols.length) : 0];
  }

  // ---------- level behaviors ----------

  function pickRandom(cols, rng) { return cols[rng.int(cols.length)]; }

  function safeCols(b, player) {
    // Columns that do not hand the opponent an immediate win.
    var opp = 3 - player;
    var out = [];
    var cols = legalCols(b);
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      drop(b, c, player);
      var danger = winningCols(b, opp).length > 0;
      undrop(b, c);
      if (!danger) out.push(c);
    }
    return out.length ? out : cols; // all moves lose: pick any
  }

  // Multi-player (>2): win now, block anyone's immediate win, else safe-ish.
  function multiMove(b, player, players, rng) {
    var wins = winningCols(b, player);
    if (wins.length) return pickRandom(wins, rng);
    for (var p = 1; p <= players; p++) {
      if (p === player) continue;
      var blocks = winningCols(b, p);
      if (blocks.length) return pickRandom(blocks, rng);
    }
    return pickRandom(legalCols(b), rng);
  }

  /**
   * chooseMove(state, level, rng) → column index.
   * state: a rules-engine state whose `current` is the AI player.
   * level: 1..4. rng: seeded stream (deterministic tie-breaks).
   */
  function chooseMove(state, level, rng) {
    var b = fromState(state);
    var me = state.current;
    var cols = legalCols(b);
    if (!cols.length) return -1;
    if (state.players > 2) return multiMove(b, me, state.players, rng);
    var opp = 3 - me;

    if (level <= 1) {
      // Casual: sometimes misses wins and blocks, prefers random play.
      var w = winningCols(b, me);
      if (w.length && rng.next() < 0.55) return pickRandom(w, rng);
      var bl = winningCols(b, opp);
      if (bl.length && rng.next() < 0.5) return pickRandom(bl, rng);
      return pickRandom(cols, rng);
    }

    if (level === 2) {
      var w2 = winningCols(b, me);
      if (w2.length) return pickRandom(w2, rng);
      var bl2 = winningCols(b, opp);
      if (bl2.length) return pickRandom(bl2, rng);
      return pickRandom(safeCols(b, me), rng);
    }

    var depth = level >= 4 ? 8 : 6;
    return searchMove(b, me, depth, rng);
  }

  /** Hint for the local player: strong search on their behalf. */
  function suggestMove(state, rng) {
    if (state.players > 2) return multiMove(fromState(state), state.current, state.players, rng);
    return searchMove(fromState(state), state.current, 6, rng);
  }

  return { LEVELS: LEVELS, chooseMove: chooseMove, suggestMove: suggestMove };
});
