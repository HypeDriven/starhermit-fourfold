// The browser build's pure game scripts, shared with the node tests: the
// seeded random streams (js/rng.js), the rules (js/rules.js), the content
// (js/content.js), the AI (js/ai.js; the engine client runs it on a worker,
// native/ai.ts, and keeps this copy as the fallback), the progress document
// (js/store.js), the string tables and their lookup (js/i18n/*.js) and the
// account strings (js/platform-i18n.js). They are classic UMD scripts,
// evaluated with loadClassic so their globals become this module's exports.
import { loadClassic } from "starhermit:script";

for (const f of [
  "js/rng.js", "js/rules.js", "js/content.js", "js/ai.js", "js/store.js",
  "js/i18n/strings.js", "js/i18n/strings-content.js", "js/i18n/core.js", "js/platform-i18n.js",
]) loadClassic(f);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const G = globalThis as Any;

export interface Rng { state: number; next(): number; int(n: number): number }
export interface Terminal { reason: string; winner: number; line?: [number, number][]; player?: number }
export interface Score { total: number; components: { win: number; parMoves: number; speed: number; draw: number } }
export interface Cfg {
  id: string; name: string; kind: string; seed: number; date?: string; intro?: string; blurb?: string;
  board: { cols: number; rows: number }; connect: number; players: number; bannedCols: number[];
  preset: number[]; ai: number; moveLimit: number; timeLimitSec: number; par: { moves: number; timeSec: number };
  mechanics: { undo: boolean; hint: boolean }; theme: string; mastery?: boolean;
  lesson?: Lesson;
}
export interface State {
  cfg: Cfg; cols: number; rows: number; connect: number; players: number;
  grid: number[]; heights: number[]; current: number; turn: number; drops: number[]; initialDrops: number;
  dropsBy: Record<number, number>; elapsedMs: number; terminal: Terminal | null; score: Score; stats: { invalid: number };
}
export interface Ev { t: string; col?: number; row?: number; player?: number }
export interface Result { ok: boolean; reason?: string; events: Ev[] }
export interface Lesson { id: string; title: string; text: string; goal: string; onlyCols: number[] | null; ai: number; preset: string; seed: number }
export interface Theme { id: string; name: string; palette: { bg: number; floor: number; frame: number; frameGhost: number; cell: number; light: number; accent: number; fog: number } }
export interface Player { name: string; color: number; colorHC: number; icon: string }
export interface Stage extends Cfg { mastery: boolean }
export interface Practice { id: string; name: string; blurb: string; ai: number }
export interface Challenge extends Cfg { blurb: string }

export const RNG = G.FFRNG as {
  create(seed: number): Rng; derive(seed: number, tag: number): Rng; hashString(s: string): number; STREAM_AI: number;
};
export const Rules = G.FFRules as {
  TERMINAL: Record<"LINE" | "FULL" | "RESIGN" | "MOVES" | "TIME", string>;
  INVALID: Record<string, string>;
  createGame(cfg: Any): State;
  applyCommand(state: State, cmd: Any): Result;
  legalActions(state: State): { type: string; col: number; row: number }[];
  cellAt(state: State, col: number, row: number): number;
  starsFor(state: State): number;
  serialize(state: State): string;
  deserialize(text: string): State;
  hashState(state: State): string;
  replay(cfg: Any, log: Any[]): State;
};
export const Content = G.FFContent as {
  PLAYERS: (Player | null)[]; THEMES: Theme[]; LESSONS: Lesson[]; JOURNEY: Stage[]; PRACTICE: Practice[];
  CHALLENGES: Challenge[]; ACHIEVEMENTS: { id: string; name: string }[]; dailyConfig(date: string): Cfg; validate(): string[];
};
export const AI = G.FFAI as {
  chooseMove(state: State, level: number, rng: Rng): number;
  suggestMove(state: State, rng: Rng): number;
};
export const Store = G.FFStore as {
  STORE_VERSION: number; defaults(): Doc; normalize(doc: unknown): Doc | null; readText(text: string | null): Doc | null;
  mergeStores(remote: Doc, local: Doc): Doc;
};
export const I18NCore = G.FFI18NCore as {
  createI18n(tables: Any): { readonly lang: string; setLocale(tag: string): string; T(key: string, vars?: Record<string, string | number>): string; has(key: string): boolean };
};
export const STRINGS = G.FF_STRINGS as Record<string, Record<string, string>>;
/** js/platform-i18n.js: the account surface's strings in the game language (globalThis.FFI18N.lang). */
export const platformStrings = (): Record<string, string> => G.FFPlatformStrings() as Record<string, string>;

export interface SavedGame { key: string; seed: number; drops: number[]; elapsedMs: number }
export interface Doc {
  v: number;
  settings: Record<string, unknown>;
  journey: Record<string, number>;
  challenges: Record<string, number>;
  lessons: Record<string, boolean>;
  daily: Record<string, { score: number; won: boolean }>;
  stats: { played: number; wins: number; streak: number; bestStreak: number };
  achievements: Record<string, boolean>;
  save: SavedGame | null;
}
