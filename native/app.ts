// The controller: the browser build's js/ui.js without its DOM — the screen
// state (title, the mode lists, the board, settings, help, the pause and
// results sheets), the session lifecycle (start from a stable key, replay a
// saved command log, the clock, the AI turn, undo, hints, restart, resign,
// lessons, results, progression, achievements, the resumable save) and the
// status line. native/screens.ts draws it every frame with starhermit:ui;
// native/main.ts routes input to it. Rules state only ever changes through
// FFRules.applyCommand.
//
// Time runs on the game clock (`clock`, advanced in fixed steps by
// main.ts), not performance.now or timers: the board's clock, the AI's
// thinking pause and the time limit pause while the window is suspended and
// are deterministic in checks.
import { clipboard, preferences } from "starhermit:engine";
import * as ui from "starhermit:ui";
import { Content, RNG, Rules, platformStrings, type Cfg, type Doc, type Rng, type State, type Theme } from "./classic.ts";
import { N, T } from "./i18n.ts";
import * as audio from "./audio.ts";
import * as ai from "./ai.ts";
import * as platform from "./platform.ts";
import * as render from "./render.ts";

const AI_DELAY_MS = 420;
const UNDO_LIMIT = 80;

export type Screen = "title" | "practice" | "journey" | "challenges" | "learn" | "play" | "settings" | "help";
export interface Session {
  key: string; cfg: Cfg; state: State; aiLevel: number; rng: Rng; history: string[];
  paused: boolean; over: boolean; elapsedMs: number; hintCol: number; lessonDrops: number[];
  clockWarned: boolean; theme: Theme;
  /** Results shown for a lesson goal (no score breakdown). */
  lessonDone: boolean;
}

export const app = {
  screen: "title" as Screen,
  overlay: null as null | "pause" | "results",
  /** Where Settings' Back returns: the title, or the paused board. */
  settingsFrom: "title" as "title" | "pause",
  /** The fixed step a screen or sheet opened on: its opening key must not act on it. */
  openedAt: 0,
  status: { text: "", error: false },
  /** The title's account notice (invite copied, signed out). */
  notice: "",
  /** Settings › Data: the inline "erase everything?" confirmation (the old window.confirm). */
  confirmErase: false,
  /** The results sheet's leaderboard line (null: hidden). */
  lbLine: null as string | null,
  /** The column the pointer or focus is on (the hover tint and ghost disc). */
  hoverCol: -1,
};
export let session: Session | null = null;

/** The game clock (ms): advanced by main.ts in fixed steps. */
export const clock = { ms: 0, frame: 0 };

// ------------------------------------------------------------------ helpers
export function doc(): Doc { return platform.doc(); }
function saveStore(): void { platform.saveDoc(); }
function clone<T>(o: T): T { return JSON.parse(JSON.stringify(o)) as T; }
export function play(cue: audio.Cue): void { audio.play(cue); }
export function reducedMotion(): boolean { return preferences().reducedMotion; }
export function highContrast(): boolean { return preferences().highContrast || ui.preferences().highContrast; }

export function themeFor(id: string): Theme {
  return Content.THEMES.find((t) => t.id === id) ?? Content.THEMES[0]!;
}
export function playerColor(p: number): number {
  const pl = Content.PLAYERS[p] ?? Content.PLAYERS[1]!;
  return highContrast() ? pl.colorHC : pl.color;
}
export function playerName(p: number): string { const n = Content.PLAYERS[p]?.name; return n ? T(n) : T("Player {n}", { n: p }); }
export function playerIcon(p: number): string { return Content.PLAYERS[p]?.icon ?? "●"; }

function announceSR(text: string): void {
  if (!text) return;
  try { ui.announce(text.slice(0, 500)); } catch { /* no reader */ }
}
export function announce(text: string, isError = false): void {
  app.status = { text, error: isError };
  announceSR(text);
}
function setStatus(text: string): void { app.status = { text, error: false }; }

// ------------------------------------------------------------------ configs
/** Config resolution from a stable key, so saves survive a reload. */
export function configFor(key: string, seed?: number): Cfg | null {
  const parts = key.split(":"), kind = parts[0], id = parts.slice(1).join(":");
  if (kind === "journey") { const s = Content.JOURNEY.find((j) => j.id === id); return s ? clone(s) : null; }
  if (kind === "challenge") { const c = Content.CHALLENGES.find((j) => j.id === id); return c ? clone(c) : null; }
  if (kind === "daily") return Content.dailyConfig(id);
  if (kind === "lesson") {
    const l = Content.LESSONS.find((x) => x.id === id);
    if (!l) return null;
    return {
      id: l.id, name: l.title, kind: "lesson", seed: l.seed,
      board: { cols: 7, rows: 6 }, connect: 4, players: 2, bannedCols: [],
      preset: l.preset.split("").map((ch) => ch.charCodeAt(0) - 48),
      ai: l.ai, moveLimit: 0, timeLimitSec: 0, par: { moves: 0, timeSec: 0 },
      mechanics: { undo: true, hint: true }, theme: "glacier", lesson: l,
    };
  }
  if (kind === "practice") {
    const p = Content.PRACTICE.find((x) => x.id === id);
    if (!p) return null;
    return {
      id: "practice-" + p.id, name: p.name, kind: "practice",
      // A fresh seed per board (the browser build's Math.random seed; Restart re-rolls it).
      seed: seed == null ? (Math.random() * 0xffffffff) >>> 0 : seed,
      board: { cols: 7, rows: 6 }, connect: 4, players: 2, bannedCols: [],
      preset: [], ai: p.ai, moveLimit: 0, timeLimitSec: 0, par: { moves: 0, timeSec: 0 },
      mechanics: { undo: true, hint: true }, theme: "glacier",
    };
  }
  return null;
}

// ------------------------------------------------------------------ screens
export function go(screen: Screen): void {
  if (screen !== "play") stopAI();
  app.screen = screen;
  app.openedAt = clock.frame;
  app.confirmErase = false;
  if (screen !== "play") app.hoverCol = -1;
  render.setVisible(screen === "play");
}

// ------------------------------------------------------------------ session
export function startSession(key: string, opts: { seed?: number; drops?: number[]; elapsedMs?: number } = {}): void {
  const cfg = configFor(key, opts.seed);
  if (!cfg) { go("title"); return; }
  stopAI();
  let state: State;
  try { state = Rules.createGame(cfg); }
  catch (e) { go("title"); app.notice = T("Could not start: {error}", { error: (e as Error).message }); return; }
  const s: Session = {
    key, cfg, state, aiLevel: cfg.ai || 0, rng: RNG.derive(cfg.seed, RNG.STREAM_AI), history: [],
    paused: false, over: false, elapsedMs: 0, hintCol: -1, lessonDrops: [], clockWarned: false,
    theme: themeFor(cfg.theme), lessonDone: false,
  };
  // Replaying a saved command log rebuilds an interrupted game exactly.
  if (opts.drops && opts.drops.length) {
    for (const col of opts.drops) {
      s.history.push(Rules.serialize(s.state));
      const res = Rules.applyCommand(s.state, { type: "drop", col });
      if (!res.ok) { s.history.pop(); break; }
    }
    s.elapsedMs = opts.elapsedMs || 0;
  }
  session = s;
  app.overlay = null;
  app.lbLine = null;
  render.setTheme(s.theme);
  render.clearAnims();
  go("play");
  render.sync(s.state);
  const lesson = cfg.lesson;
  if (cfg.intro || (lesson && lesson.text)) setStatus(T(lesson ? lesson.text : cfg.intro!));
  else setStatus("");
  persistSave();
  maybeAI();
}

/** The clock runs while the board shows, unpaused and undecided. */
function clockRunning(): boolean {
  return !!session && app.screen === "play" && !session.over && !session.paused && !app.overlay;
}
export function elapsedMs(): number { return session ? session.elapsedMs : 0; }

/** Per fixed step: the board's clock and time limit, the AI's answer. */
export function tick(stepMs: number): void {
  clock.ms += stepMs;
  clock.frame += 1;
  const s = session;
  if (!s) return;
  if (clockRunning()) {
    s.elapsedMs += stepMs;
    const limit = s.cfg.timeLimitSec || 0;
    if (limit > 0 && s.elapsedMs >= limit * 1000) {
      const res = Rules.applyCommand(s.state, { type: "timeout", player: 1, elapsedMs: Math.floor(s.elapsedMs) });
      audio.playResult(res);
      finishGame();
      return;
    }
    // One warning tick when a timed board enters its last ten seconds.
    if (limit > 0 && !s.clockWarned && limit * 1000 - s.elapsedMs <= 10000) { s.clockWarned = true; play("clock-warning"); }
  }
  aiStep();
}

// ------------------------------------------------------------------ commands
/** A drop the player asked for (column widget, number key, tap). */
export function humanDrop(col: number): void {
  const s = session;
  if (!s || s.over || s.paused || app.overlay) return;
  if (s.state.current !== 1 && s.aiLevel > 0) { play("out-of-turn"); return; }
  const lesson = s.cfg.lesson;
  if (lesson && lesson.onlyCols && lesson.onlyCols.indexOf(col) === -1) {
    play("bad-column");
    announce(T("This lesson wants column {n}.", { n: lesson.onlyCols[0]! + 1 }), true);
    return;
  }
  applyDrop(col);
}

function applyDrop(col: number): void {
  const s = session!;
  const before = Rules.serialize(s.state);
  const player = s.state.current;
  const res = Rules.applyCommand(s.state, { type: "drop", col, elapsedMs: Math.floor(s.elapsedMs) });
  audio.playResult(res);
  if (!res.ok) { announce(reasonText(res.reason || ""), true); return; }
  s.history.push(before);
  if (s.history.length > UNDO_LIMIT) s.history.shift();
  s.hintCol = -1;
  cancelHint();
  if (player === 1) s.lessonDrops.push(col);
  render.sync(s.state);
  for (const e of res.events) if (e.t === "drop") render.dropAnim(e.col!, e.row!);
  persistSave();
  if (s.state.terminal) { finishGame(); return; }
  if (checkLessonGoal()) return;
  maybeAI();
}

export function reasonText(reason: string): string {
  const map: Record<string, string> = {
    [Rules.INVALID.FULL_COL!]: N("That column is full."),
    [Rules.INVALID.BANNED!]: N("That column is sealed this round."),
    [Rules.INVALID.BAD_COL!]: N("That column is off the board."),
    [Rules.INVALID.TURN!]: N("Not your turn yet."),
    [Rules.INVALID.ENDED!]: N("This game is over."),
  };
  return T(map[reason] || N("That move is not allowed."));
}

// The AI's turn: the search starts on the worker at once and its answer
// lands once the thinking pause (420 ms, 120 ms with reduced motion) is over.
let aiJob: null | { readyAt: number; col: number | null; rng: number; cancel: () => void; forSession: Session } = null;
function maybeAI(): void {
  stopAI();
  const s = session;
  if (!s || s.over || s.paused || app.overlay) return;
  if (s.aiLevel <= 0) return;            // pass-and-play / solo lesson
  if (s.state.current === 1) return;
  const job = { readyAt: clock.ms + (reducedMotion() ? 120 : AI_DELAY_MS), col: null as number | null, rng: 0, cancel: (() => undefined) as () => void, forSession: s };
  aiJob = job;
  job.cancel = ai.request("move", s.state, s.aiLevel, s.rng, (col, next) => { job.col = col; job.rng = next; });
}
function aiStep(): void {
  const job = aiJob;
  if (!job || job.col === null || clock.ms < job.readyAt) return;
  aiJob = null;
  const s = session;
  if (!s || s !== job.forSession || s.over || s.paused || app.overlay || s.state.current === 1) return;
  s.rng.state = job.rng;
  let col = job.col;
  if (col == null || col < 0) {
    const legal = Rules.legalActions(s.state);
    if (!legal.length) return;
    col = legal[0]!.col;
  }
  applyDrop(col);
}
function stopAI(): void { if (aiJob) { aiJob.cancel(); aiJob = null; } }
/** The rival is searching (the HUD's "is thinking…" stays up). */
export function aiThinking(): boolean { return !!aiJob; }

export function undo(): void {
  const s = session;
  if (!s || s.over || s.paused || app.overlay) return;
  if (!s.cfg.mechanics.undo) { announce(T("Undo is disabled in this mode."), true); return; }
  stopAI();
  cancelHint();
  // Step back to the most recent position where the local player is to move.
  let steps = 0;
  while (s.history.length && steps < 4) {
    s.state = Rules.deserialize(s.history.pop()!);
    steps++;
    if (s.state.current === 1 || s.aiLevel === 0) break;
  }
  if (!steps) { announce(T("Nothing to undo.")); return; }
  play("undo");
  s.hintCol = -1;
  if (s.lessonDrops.length) s.lessonDrops.pop();
  render.clearAnims();
  render.sync(s.state);
  persistSave();
  announce(steps === 1 ? T("Undid 1 drop.") : T("Undid {n} drops.", { n: steps }));
  maybeAI();
}

let cancelHintJob: (() => void) | null = null;
function cancelHint(): void { if (cancelHintJob) { cancelHintJob(); cancelHintJob = null; } }
export function hint(): void {
  const s = session;
  if (!s || s.over || s.paused || app.overlay) return;
  if (!s.cfg.mechanics.hint) { announce(T("Hints are disabled in this mode."), true); return; }
  if (s.state.current !== 1 && s.aiLevel > 0) return;
  if (cancelHintJob) return;
  const turn = s.state.turn;
  cancelHintJob = ai.request("hint", s.state, 0, s.rng, (col, next) => {
    cancelHintJob = null;
    if (session !== s || s.state.turn !== turn || s.over) return;
    s.rng.state = next;
    if (col == null || col < 0) { announce(T("No hint available.")); return; }
    s.hintCol = col;
    play("hint");
    announce(T("Hint: column {n}.", { n: col + 1 }));
  });
}

export function resign(): void {
  const s = session;
  if (!s || s.over) return;
  app.overlay = null;
  s.paused = false;
  const res = Rules.applyCommand(s.state, { type: "resign", player: 1, elapsedMs: Math.floor(s.elapsedMs) });
  audio.playResult(res);
  finishGame();
}

export function restart(): void {
  const s = session;
  if (!s) return;
  const key = s.key, seed = s.cfg.seed;
  app.overlay = null;
  startSession(key, { seed: key.indexOf("practice:") === 0 ? undefined : seed });
}

// ------------------------------------------------------------------ results
function finishGame(): void {
  const s = session!;
  stopAI();
  cancelHint();
  s.over = true;
  const st = s.state;
  const t = st.terminal;
  const won = !!t && t.winner === 1;
  const stars = Rules.starsFor(st);
  const store = doc();
  // Progression: recorded once per finished game.
  store.stats.played++;
  if (won) {
    store.stats.wins++;
    store.stats.streak++;
    if (store.stats.streak > store.stats.bestStreak) store.stats.bestStreak = store.stats.streak;
  } else if (s.aiLevel > 0) store.stats.streak = 0;
  const kind = s.cfg.kind;
  if (kind === "journey" && stars > (store.journey[s.cfg.id] || 0)) store.journey[s.cfg.id] = stars;
  if (kind === "challenge" && won && st.score.total > (store.challenges[s.cfg.id] || 0)) store.challenges[s.cfg.id] = st.score.total;
  if (kind === "daily") store.daily[s.cfg.date!] = { score: st.score.total, won };
  if (s.cfg.lesson && t && t.reason !== Rules.TERMINAL.RESIGN && (won || s.cfg.lesson.goal === "play")) store.lessons[s.cfg.lesson.id] = true;
  store.save = null;
  grantAchievements(won);
  saveStore();
  render.sync(st);
  showResults();
}

function grantAchievements(won: boolean): void {
  const store = doc();
  const a = store.achievements;
  if (won) a["first-line"] = true;
  if (store.stats.streak >= 3) a["streak-3"] = true;
  if (store.stats.played >= 100) a["centurion"] = true;
  if (Object.keys(store.challenges).length >= 4) a["challenge-set"] = true;
  if (Content.JOURNEY.every((l) => !l.mastery || (store.journey[l.id] || 0) > 0)) a["journey-mastery"] = true;
}

export function outcomeHeadline(st: State): { text: string; cls: "" | "win" | "loss" } {
  const t = st.terminal;
  if (!t) return { text: T("Game paused"), cls: "" };
  if (t.reason === Rules.TERMINAL.FULL) return { text: T("Board full — a draw"), cls: "" };
  if (t.winner === 1) return { text: T("You made four"), cls: "win" };
  if (t.reason === Rules.TERMINAL.RESIGN) return { text: T("You resigned"), cls: "loss" };
  if (t.reason === Rules.TERMINAL.TIME) return { text: T("Time up"), cls: "loss" };
  if (t.reason === Rules.TERMINAL.MOVES) return { text: T("Drop budget spent"), cls: "loss" };
  return { text: T("{name} made four", { name: playerName(t.winner) }), cls: "loss" };
}

function showResults(): void {
  const s = session!;
  const head = outcomeHeadline(s.state);
  openOverlay("results");
  announce(T("{headline}. Score {n}.", { headline: head.text, n: s.state.score.total }));
  postToLeaderboard(s.state.score.total);
}

// Signed in only: a finished game against the AI (practice, journey, daily,
// challenge — not pass-and-play or lessons) goes to the high-score board and
// the results sheet shows the player's rank.
function postToLeaderboard(total: number): void {
  const s = session!;
  app.lbLine = null;
  if (!platform.signedIn() || s.aiLevel <= 0 || s.cfg.kind === "lesson") return;
  const ps = platformStrings();
  app.lbLine = ps.lbPosting!;
  void platform.postLeaderboard(total).then((r) => {
    if (session !== s) return;
    app.lbLine = !r.posted ? ps.lbFailed! : r.rank ? ps.lbRank!.replace("{rank}", String(r.rank)) : ps.lbPosted!;
  });
}

export function nextStage(): Cfg | null {
  const s = session;
  if (!s || s.cfg.kind !== "journey") return null;
  if (!s.state.terminal || s.state.terminal.winner !== 1) return null;
  const i = Content.JOURNEY.findIndex((j) => j.id === s.cfg.id);
  return i >= 0 ? Content.JOURNEY[i + 1] ?? null : null;
}

// ------------------------------------------------------------------ lessons
function checkLessonGoal(): boolean {
  const s = session!;
  const l = s.cfg.lesson;
  if (!l || s.over) return false;
  let done = false;
  if (l.goal === "drop-any") done = s.lessonDrops.length >= 1;
  else if (l.goal === "stack") {
    const counts: Record<number, number> = {};
    done = s.lessonDrops.some((c) => { counts[c] = (counts[c] || 0) + 1; return counts[c]! >= 2; });
  }
  if (!done) return false;
  stopAI();
  s.over = true;
  s.lessonDone = true;
  const store = doc();
  store.lessons[l.id] = true;
  store.save = null;
  saveStore();
  play("lesson-complete");
  app.lbLine = null;
  openOverlay("results");
  announce(T("Lesson complete."));
  return true;
}

// ------------------------------------------------------------------ save / resume
function persistSave(): void {
  const s = session;
  if (!s || s.over) return;
  if (s.cfg.kind === "lesson") return;   // lessons restart cheaply
  doc().save = {
    key: s.key, seed: s.cfg.seed,
    drops: s.state.drops.slice(s.state.initialDrops),
    elapsedMs: Math.floor(s.elapsedMs),
  };
  saveStore();
}
/** Keeps the clock reading of a game in progress (on quit and suspend). */
export function saveProgress(): void { persistSave(); }
export function resumeSaved(): void {
  const s = doc().save;
  if (!s) return;
  startSession(s.key, { seed: s.seed, drops: s.drops, elapsedMs: s.elapsedMs });
}
export function resumeLabel(): string | null {
  const s = doc().save;
  if (!s) return null;
  const cfg = configFor(s.key, s.seed);
  return cfg && cfg.name ? T("Resume {name}", { name: T(cfg.name) }) : T("Resume game");
}

// ------------------------------------------------------------------ overlays
function openOverlay(kind: "pause" | "results"): void {
  app.overlay = kind;
  app.openedAt = clock.frame;
}
export function openPause(): void {
  const s = session;
  if (!s || s.over || app.screen !== "play" || app.overlay) return;
  s.paused = true;
  stopAI();
  cancelHint();
  persistSave();
  openOverlay("pause");
}
export function closePause(): void {
  const s = session;
  if (!s) return;
  s.paused = false;
  if (app.overlay === "pause") app.overlay = null;
  if (!s.over) maybeAI();
}
export function leaveGame(): void {
  persistSave();
  stopAI();
  app.overlay = null;
  if (session) session.paused = false;
  go("title");
}
export function pauseSettings(): void {
  app.overlay = null;
  app.settingsFrom = "pause";
  go("settings");
}
/** Settings › Back: the paused board it came from, else the title. */
export function settingsBack(): void {
  if (app.settingsFrom === "pause" && session && !session.over) {
    app.settingsFrom = "title";
    go("play");
    openOverlay("pause");
    return;
  }
  app.settingsFrom = "title";
  go("title");
}
export function resultsRetry(): void { app.overlay = null; restart(); }
export function resultsNext(): void {
  const n = nextStage();
  app.overlay = null;
  if (n) startSession("journey:" + n.id); else go("title");
}
export function resultsMenu(): void { app.overlay = null; go("title"); }

// ------------------------------------------------------------------ menus
export function titleStats(): string {
  const store = doc();
  const totalStars = Object.keys(store.journey).reduce((a, k) => a + (store.journey[k] || 0), 0);
  return store.stats.played
    ? T("{games} games · {wins} wins · {stars} stars", { games: store.stats.played, wins: store.stats.wins, stars: totalStars })
    : T("New player — start with Learn or Play.");
}
export function startDaily(): void {
  const d = platform.todayUTC();
  const done = doc().daily[d];
  startSession("daily:" + d);
  if (done) announce(T("You already played today’s board. Replaying for practice."));
}
export function copyInvite(): void {
  const link = platform.inviteLink();
  if (!link) return;
  const ps = platformStrings();
  try { clipboard.writeText(link); app.notice = ps.inviteCopied!; } catch { app.notice = ps.inviteFailed!; }
}
export function eraseProgress(): void {
  platform.resetDoc();
  app.confirmErase = false;
  app.notice = T("Progress erased.");
  announceSR(app.notice);
}
/** A game in progress that just lost the window: the pause sheet (the old tab-hidden pause). */
export function onSuspend(): void {
  if (app.screen === "play" && session && !session.over) openPause();
  persistSave();
}
