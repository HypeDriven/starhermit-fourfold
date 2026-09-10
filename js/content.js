/* Fourfold — versioned content: themes, tutorial lessons, journey stages,
 * challenges, practice presets, daily ruleset generator, achievements.
 * Shared browser (window.FFContent) / Node. Content is data-only; all
 * randomness enters through config seeds.
 *
 * Journey rows are compact authored records:
 * [id, name, seed, preset, aiLevel, moveLimit, timeLimitSec, parMoves,
 *  themeIdx, flags, intro]
 * preset: string of column digits; drops alternate P1,P2,... from an empty
 * board (P1 first). An even-length preset means the local player moves next.
 * flags: 'm' = mastery stage, 'mate1' = validator requires an immediate win.
 */
(function (root, factory) {
  var RNG = (typeof module === 'object' && module.exports) ? require('./rng.js') : root.FFRNG;
  var Rules = (typeof module === 'object' && module.exports) ? require('./rules.js') : root.FFRules;
  var api = factory(RNG, Rules);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FFContent = api;
})(typeof self !== 'undefined' ? self : this, function (RNG, Rules) {
  'use strict';

  var CONTENT_VERSION = 1;

  // ---------- player identities (shape reinforces color) ----------
  var PLAYERS = [
    null,
    { name: 'You',     color: 0xffb54d, colorHC: 0xffd60a, icon: '●' },
    { name: 'Rival',   color: 0x4dc9ff, colorHC: 0x2e6fe4, icon: '◆' },
    { name: 'Third',   color: 0x7fe08a, colorHC: 0x17a398, icon: '▲' },
    { name: 'Fourth',  color: 0xd98cff, colorHC: 0x8e24aa, icon: '■' }
  ];

  // ---------- themes (cosmetic only: materials, light, ambience) ----------
  var THEMES = [
    { id: 'glacier', name: 'Glacier Hall', unlockStars: 0,
      palette: { bg: 0x0e1424, floor: 0x141c30, frame: 0x5f7fc9, frameGhost: 0x2a3a5f,
                 cell: 0x0a0f1e, light: 0xbfd8ff, accent: 0x7fb0ff, fog: 0x0e1424 } },
    { id: 'ember', name: 'Ember Vault', unlockStars: 10,
      palette: { bg: 0x1d1310, floor: 0x2a1c16, frame: 0xc97a4a, frameGhost: 0x4a2e20,
                 cell: 0x140d0a, light: 0xffd9a8, accent: 0xffb066, fog: 0x1d1310 } },
    { id: 'verdant', name: 'Verdant Atrium', unlockStars: 25,
      palette: { bg: 0x101a14, floor: 0x18261e, frame: 0x5aa86e, frameGhost: 0x24402e,
                 cell: 0x0b120d, light: 0xd8ffb0, accent: 0x9fe080, fog: 0x101a14 } },
    { id: 'violet', name: 'Violet Observatory', unlockStars: 45,
      palette: { bg: 0x171226, floor: 0x211a36, frame: 0x8a6fd0, frameGhost: 0x352a55,
                 cell: 0x100c1e, light: 0xd8c8ff, accent: 0xb48cff, fog: 0x171226 } },
    { id: 'ivory', name: 'Ivory Gallery', unlockStars: 70,
      palette: { bg: 0x3a3630, floor: 0x4a443c, frame: 0xb09a78, frameGhost: 0x6a5c48,
                 cell: 0x2a2620, light: 0xfff2dd, accent: 0xffd9a0, fog: 0x3a3630 } }
  ];

  // ---------- tutorial lessons (Learn mode) ----------
  // `onlyCols` restricts legal targets (the lesson rejects other drops with
  // an explanation). `goal` decides when the lesson completes.
  var LESSONS = [
    { id: 'l-drop', title: 'Drop a disc', seed: 11, preset: '', ai: 0,
      onlyCols: null, goal: 'drop-any',
      text: 'Pick any column — click it, tap it, or press ← → then Enter. Your disc falls to the lowest free cell.' },
    { id: 'l-gravity', title: 'Discs fall and stack', seed: 12, preset: '', ai: 0,
      onlyCols: null, goal: 'stack',
      text: 'Drop two discs into the SAME column. The second one lands on top of the first.' },
    { id: 'l-center', title: 'Own the middle', seed: 13, preset: '', ai: 0,
      onlyCols: [3], goal: 'drop-any',
      text: 'The center column joins the most possible lines. Drop a disc in the middle column.' },
    { id: 'l-connect', title: 'Make four', seed: 14, preset: '324150', ai: 0,
      onlyCols: [6], goal: 'win',
      text: 'You have three discs in a row along the bottom. Drop in the glowing column to complete four — and win.' },
    { id: 'l-block', title: 'Block the threat', seed: 15, preset: '030214', ai: 0,
      onlyCols: [5], goal: 'drop-any',
      text: 'Your rival has three along the bottom and wins on the next drop at the right end. Drop in the glowing column to block.' },
    { id: 'l-duel', title: 'First duel', seed: 16, preset: '', ai: 1,
      onlyCols: null, goal: 'play',
      text: 'Now play a real game against a casual rival. Make a line of four before they do. Undo and hints are allowed here.' }
  ];

  // ---------- journey (42 authored stages) ----------
  var J = [
    ['j01','First Drops',      701,'',            1, 0,  0,14,0,'',  'Drop discs into any column. First line of four wins.'],
    ['j02','Open Board',       702,'',            1, 0,  0,14,0,'',  ''],
    ['j03','Stack Up',         703,'',            1, 0,  0,13,0,'',  'Vertical lines count too. Watch the columns you build.'],
    ['j04','Quick Finish',     704,'324150',      1, 0,  0, 2,0,'mate1','You already have three along the bottom. Finish the line.'],
    ['j05','Vertical Answer',  705,'343434',      1, 0,  0, 2,0,'mate1','Three stacked discs. One more drop ends it.'],
    ['j06','First Mastery',    706,'',            2, 0,  0,12,0,'m', 'MASTERY: a steadier rival. Combine attack and defense.'],
    ['j07','Crossfire',        707,'',            2, 0,  0,13,1,'',  ''],
    ['j08','Left Edge',        708,'405162',      2, 0,  0, 2,1,'mate1','The winning cell is on the left this time.'],
    ['j09','Second Stack',     709,'565656',      2, 0,  0, 2,1,'mate1',''],
    ['j10','Long Game',        710,'',            2, 0,  0,14,1,'',  ''],
    ['j11','Diagonal Eye',     711,'011262236363',2, 0,  0, 2,1,'mate1','Diagonals are easy to miss — yours is ready.'],
    ['j12','Budget Mastery',   712,'',            2,16, 0,12,1,'m',  'MASTERY: win within 16 of your drops.'],
    ['j13','Mirror Match',     713,'',            2, 0,  0,13,2,'',  ''],
    ['j14','Gap Fill',         714,'203156',      2, 0,  0, 2,2,'mate1','A line with a hole. Plug it.'],
    ['j15','Tall Threat',      715,'121212',      2, 0,  0, 2,2,'mate1',''],
    ['j16','Sharp Start',      716,'',            3, 0,  0,14,2,'',  'A sharp rival searches several moves ahead.'],
    ['j17','Falling Diagonal', 717,'655404430303',3, 0,  0, 2,2,'mate1',''],
    ['j18','Sharp Mastery',    718,'',            3, 0,  0,12,2,'m', 'MASTERY: beat the sharp rival.'],
    ['j19','Center Squeeze',   719,'',            3, 0,  0,13,0,'',  ''],
    ['j20','Quiet Corner',     720,'324150',      3, 0,  0, 3,0,'mate1','Same shape, sharper defender behind it.'],
    ['j21','Edge Runner',      721,'',            3, 0,  0,13,0,'',  ''],
    ['j22','Late Diagonal',    722,'62216110605004',3,0,  0, 2,0,'mate1',''],
    ['j23','Pressure',         723,'',            3, 0,  0,12,0,'',  ''],
    ['j24','Timed Mastery',    724,'',            3, 0,120,12,0,'m', 'MASTERY: win within two minutes.'],
    ['j25','Counter Punch',    725,'030214',      3, 0,  0, 4,1,'',  'Block first, then build your own line.'],
    ['j26','Two Fronts',       726,'',            3, 0,  0,13,1,'',  ''],
    ['j27','Deep Stack',       727,'343434',      3, 0,  0, 3,1,'mate1',''],
    ['j28','Close Ranks',      728,'',            3, 0,  0,12,1,'',  ''],
    ['j29','Fast Finish',      729,'405162',      3, 0,  0, 3,1,'mate1',''],
    ['j30','Clock Mastery',    730,'',            3,14, 90,12,1,'m', 'MASTERY: 14 drops, 90 seconds, sharp rival.'],
    ['j31','Narrow Window',    731,'',            3,12,  0,11,2,'',  'A tight drop budget.'],
    ['j32','Quiet Diagonal',   732,'011262236363',3,0,  0, 3,2,'mate1',''],
    ['j33','Heavy Middle',     733,'',            4, 0,  0,14,2,'',  'A master rival. Expect no gifts.'],
    ['j34','Endgame Read',     734,'203156',      4, 0,  0, 3,2,'mate1',''],
    ['j35','Long Diagonal',    735,'655404430303',4,0,  0, 3,2,'mate1',''],
    ['j36','Master Mastery',   736,'',            4, 0,  0,12,2,'m', 'MASTERY: defeat the master.'],
    ['j37','Thin Ice',         737,'',            4,12,  0,11,0,'',  ''],
    ['j38','Last Puzzle',      738,'62216110605004',4,0,  0, 3,0,'mate1',''],
    ['j39','Full Stretch',     739,'',            4, 0,150,13,0,'',  ''],
    ['j40','Grand Mastery',    740,'',            4,14,120,12,0,'m', 'MASTERY: every skill at once.'],
    ['j41','Rematch',          741,'',            4, 0,  0,11,0,'',  ''],
    ['j42','Fourfold',         742,'',            4,12, 90,11,0,'m', 'MASTERY: the definitive duel. Good luck.']
  ];

  function expandLevel(row) {
    var preset = [];
    for (var i = 0; i < row[3].length; i++) preset.push(row[3].charCodeAt(i) - 48);
    var flags = row[9] || '';
    return {
      id: row[0], name: row[1], version: CONTENT_VERSION, kind: 'journey',
      seed: row[2], board: { cols: 7, rows: 6 }, connect: 4, players: 2,
      preset: preset,
      ai: row[4], moveLimit: row[5] || 0, timeLimitSec: row[6] || 0,
      par: { moves: row[7] || 0, timeSec: row[6] || 0 },
      mechanics: { undo: true, hint: true },
      theme: THEMES[row[8]].id,
      // Whole-word match: 'mate1' is a puzzle flag, not a mastery gate.
      mastery: /(^|\s)m(\s|$)/.test(flags),
      mate1: flags.indexOf('mate1') !== -1,
      intro: row[10] || ''
    };
  }

  var JOURNEY = J.map(expandLevel);

  // ---------- practice presets ----------
  var PRACTICE = [
    { id: 'casual', name: 'Casual AI', ai: 1, blurb: 'Learning rival. Room to experiment.' },
    { id: 'steady', name: 'Steady AI', ai: 2, blurb: 'Blocks threats, punishes mistakes.' },
    { id: 'sharp',  name: 'Sharp AI',  ai: 3, blurb: 'Searches six moves deep.' },
    { id: 'master', name: 'Master AI', ai: 4, blurb: 'Eight moves deep. No mercy.' },
    { id: 'local',  name: 'Two players (local)', ai: 0, blurb: 'Pass-and-play on one device.' }
  ];

  // ---------- challenges ----------
  var CHALLENGES = [
    { id: 'blitz', name: 'Blitz Ninety', seed: 501, kind: 'challenge',
      board: { cols: 7, rows: 6 }, connect: 4, players: 2, ai: 2,
      timeLimitSec: 90, par: { moves: 0, timeSec: 90 },
      mechanics: { undo: false, hint: false }, theme: 'ember',
      blurb: 'Win within 90 seconds against a steady rival. No undo, no hints.' },
    { id: 'budget', name: 'Twelve Drops', seed: 502, kind: 'challenge',
      board: { cols: 7, rows: 6 }, connect: 4, players: 2, ai: 2,
      moveLimit: 12, par: { moves: 12, timeSec: 0 },
      mechanics: { undo: false, hint: true }, theme: 'glacier',
      blurb: 'Win within 12 of your own drops. No undo.' },
    { id: 'off-center', name: 'Off-Center', seed: 503, kind: 'challenge',
      board: { cols: 7, rows: 6 }, connect: 4, players: 2, ai: 2,
      bannedCols: [3], par: { moves: 14, timeSec: 0 },
      mechanics: { undo: true, hint: true }, theme: 'verdant',
      blurb: 'The middle column is sealed. Win without it.' },
    { id: 'high-rise', name: 'High Rise', seed: 504, kind: 'challenge',
      board: { cols: 7, rows: 8 }, connect: 4, players: 2, ai: 3,
      par: { moves: 16, timeSec: 0 },
      mechanics: { undo: true, hint: true }, theme: 'violet',
      blurb: 'A taller grid — eight rows — against a sharp rival.' },
    { id: 'pentafold', name: 'Pentafold', seed: 505, kind: 'challenge',
      board: { cols: 9, rows: 7 }, connect: 5, players: 2, ai: 3,
      par: { moves: 18, timeSec: 0 },
      mechanics: { undo: true, hint: true }, theme: 'violet',
      blurb: 'Nine columns, and it takes FIVE in a row to win.' },
    { id: 'threefold', name: 'Threefold Table', seed: 506, kind: 'challenge',
      board: { cols: 7, rows: 6 }, connect: 4, players: 3, ai: 2,
      par: { moves: 14, timeSec: 0 },
      mechanics: { undo: false, hint: true }, theme: 'verdant',
      blurb: 'Two rivals at one table. Complete your line before either of them.' },
    { id: 'grandmaster', name: 'Grandmaster Row', seed: 507, kind: 'challenge',
      board: { cols: 7, rows: 6 }, connect: 4, players: 2, ai: 4,
      par: { moves: 12, timeSec: 0 },
      mechanics: { undo: false, hint: false }, theme: 'ivory',
      blurb: 'The master, unassisted. The hardest seat in the house.' }
  ];

  // ---------- daily ----------
  // One immutable ruleset per UTC day: same seed, same opening everywhere.
  function dailyConfig(dateStr) {
    var seed = RNG.hashString('fourfold-daily-' + dateStr);
    var dayNum = Math.floor(Date.parse(dateStr + 'T00:00:00Z') / 86400000);
    var ai = 1 + (dayNum % 3); // rotates casual → steady → sharp
    var rng = RNG.derive(seed, RNG.STREAM_RULES);

    // Deterministic short opening: 0–2 pairs of alternating legal drops.
    var probe = Rules.createGame({
      id: 'daily-probe', seed: seed, board: { cols: 7, rows: 6 }, connect: 4, players: 2
    });
    var preset = [];
    var pairs = rng.int(3);
    for (var i = 0; i < pairs * 2; i++) {
      var legal = Rules.legalActions(probe);
      var pick = legal[rng.int(legal.length)];
      Rules.applyCommand(probe, { type: 'drop', col: pick.col });
      preset.push(pick.col);
      if (probe.terminal) break; // unreachable in 4 drops, kept for safety
    }

    return {
      id: 'daily-' + dateStr, version: CONTENT_VERSION, kind: 'daily',
      seed: seed, board: { cols: 7, rows: 6 }, connect: 4, players: 2,
      preset: preset, ai: ai, moveLimit: 0, timeLimitSec: 0,
      par: { moves: 12, timeSec: 0 },
      mechanics: { undo: false, hint: false },
      theme: THEMES[dayNum % THEMES.length].id,
      date: dateStr,
      blurb: 'Shared seed for ' + dateStr + ' · rival: ' + ['', 'Casual', 'Steady', 'Sharp'][ai]
    };
  }

  // ---------- achievements (stable lowercase keys, idempotent) ----------
  var ACHIEVEMENTS = [
    { key: 'first-line', name: 'First Line', desc: 'Win your first game.' },
    { key: 'journey-mastery', name: 'Master of the Grid', desc: 'Earn stars on every journey mastery stage.' },
    { key: 'streak-3', name: 'Hat Trick', desc: 'Win three games in a row.' },
    { key: 'challenge-set', name: 'Challenger', desc: 'Complete four different challenges.' },
    { key: 'centurion', name: 'Centurion', desc: 'Play one hundred games.' }
  ];

  // ---------- offline validators (run in tests and at boot in dev) ----------
  function validate() {
    var problems = [];
    function checkCfg(cfg, label, opts) {
      opts = opts || {};
      try {
        var s = Rules.createGame(cfg);
        if (s.current !== 1) problems.push(label + ': local player does not move first');
        if (s.terminal) problems.push(label + ': starts terminal');
        if (cfg.mate1) {
          var b = { cols: s.cols, rows: s.rows, grid: s.grid, heights: s.heights };
          var wins = [];
          for (var c = 0; c < s.cols; c++) {
            if (s.heights[c] >= s.rows) continue;
            if (Rules.findLine(s, c, s.heights[c], 1)) wins.push(c);
          }
          if (!wins.length) problems.push(label + ': mate1 stage has no immediate win');
        }
        if (!Rules.legalActions(s).length && !s.terminal) problems.push(label + ': no legal actions');
      } catch (e) {
        problems.push(label + ': ' + e.message);
      }
    }
    JOURNEY.forEach(function (l) { checkCfg(l, 'journey ' + l.id); });
    CHALLENGES.forEach(function (c) { checkCfg(c, 'challenge ' + c.id); });
    LESSONS.forEach(function (l) {
      checkCfg({ id: l.id, seed: l.seed, board: { cols: 7, rows: 6 }, connect: 4, players: 2, preset: l.preset.split('').map(function (ch) { return ch.charCodeAt(0) - 48; }) }, 'lesson ' + l.id);
    });
    // Daily generator sanity over a rolling window.
    ['2026-01-01', '2026-06-15', '2026-12-31'].forEach(function (d) {
      var a = dailyConfig(d), b2 = dailyConfig(d);
      if (Rules.stableStringify(a) !== Rules.stableStringify(b2)) problems.push('daily ' + d + ': not deterministic');
      checkCfg(a, 'daily ' + d);
    });
    // Theme ids referenced by content must exist.
    var themeIds = {};
    THEMES.forEach(function (t) { themeIds[t.id] = true; });
    JOURNEY.concat(CHALLENGES).forEach(function (c) {
      if (!themeIds[c.theme]) problems.push(c.id + ': unknown theme ' + c.theme);
    });
    return problems;
  }

  return {
    CONTENT_VERSION: CONTENT_VERSION,
    PLAYERS: PLAYERS,
    THEMES: THEMES,
    LESSONS: LESSONS,
    JOURNEY: JOURNEY,
    PRACTICE: PRACTICE,
    CHALLENGES: CHALLENGES,
    ACHIEVEMENTS: ACHIEVEMENTS,
    dailyConfig: dailyConfig,
    validate: validate
  };
});
