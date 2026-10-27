// The game's data and the StarHermit platform, on the runtime's modules:
// - progress is the browser build's document (js/store.js: settings,
//   journey stars, challenge bests, lessons, dailies, stats, achievements and
//   the one resumable game), unchanged: it is the game's save
//   (starhermit:storage `saves`, schema 1) on the device and in the player's
//   cloud slot, two devices' copies merged as the browser build merged them
//   (mergeStores: best of each, this device's settings and game in
//   progress). The slot the browser build wrote (the JS SDK's saveJSON of the
//   same document under game:<slug>) shows as foreign, is merged in and
//   replaced once;
// - the browser build's account settings (volume, muted, reducedMotion,
//   highContrast, largeText, the language helper's ui.language, the options
//   panel's audio.options) are the runtime's Options now: they are removed
//   from the account once read (the runtime keeps its own);
// - the player (signed in or a guest), the invite link, the platform's
//   clock (the Daily board's UTC date), and posting a finished game's total
//   through score-script.js (a practice session whose socket carries
//   { type: 'result', scores }, as the JS SDK's submitScores did; the script
//   range-checks it) with the rank on the high-score board.
import type { JsonValue } from "starhermit:engine";
import {
  connectGame, inviteLink as fetchInviteLink, leaderboards, onPlayerChange, player, requestSignIn, serverNow, serverTime, sessions,
  type Leaderboard,
} from "starhermit:platform";
import { saves, settings } from "starhermit:storage";
import { Store, type Doc } from "./classic.ts";

// --- the save ------------------------------------------------------------------------
let current: Doc = Store.defaults();
let lastSavedAt = 0;
let adoptHook: (() => void) | null = null;
/** fn() when another copy (another device, the browser build) was merged in. */
export function onAdopt(fn: () => void): void { adoptHook = fn; }
/** The live document (the app updates it in place, then calls saveDoc). */
export function doc(): Doc { return current; }
export function saveDoc(): void {
  try { saves.save(current as unknown as JsonValue, { schema: Store.STORE_VERSION }); }
  catch (e) { console.warn(`save: ${String(e)}`); }
}
function replaceDoc(next: Doc): void {
  const c = current as unknown as Record<string, unknown>;
  for (const k of Object.keys(c)) delete c[k];
  Object.assign(c, next);
}
/** Merges another copy into the device's (and saves); whether anything changed. */
function adopt(other: unknown): boolean {
  const remote = Store.normalize(other);
  if (!remote) return false;
  const next = Store.mergeStores(remote, current);
  if (JSON.stringify(next) === JSON.stringify(current)) return false;
  replaceDoc(next);
  saveDoc();
  adoptHook?.();
  return true;
}
saves.onConflict((local, remote) => ({
  merged: Store.mergeStores(Store.normalize(remote.data) ?? Store.defaults(), Store.normalize(local?.data ?? null) ?? Store.defaults()) as unknown as JsonValue,
}));
saves.onStatus((_status, state) => {
  if (state === "foreign") { migrateForeign(); return; }
  // The account's save replaced the device's (another device saved last): merge it in.
  const cur = saves.load();
  if (cur && cur.savedAt !== lastSavedAt) {
    lastSavedAt = cur.savedAt;
    adopt(cur.data);
  }
});
/** The browser build's cloud save (its document as JSON text): merged in, saved over it once. */
export function migrateForeign(): void {
  const old = saves.foreign();
  if (!old) return;
  const remote = Store.readText(old.text ?? null);
  if (remote) replaceDoc(Store.mergeStores(remote, current));
  try { saves.save(current as unknown as JsonValue, { schema: Store.STORE_VERSION, replaceForeign: true }); }
  catch (e) { console.warn(`save migration: ${String(e)}`); }
  adoptHook?.();
}
/** For the Settings data line: offline (a guest) | saving | synced | error. */
export function syncState(): "offline" | "loading" | "saving" | "synced" | "error" {
  if (!player()) return "offline";
  const st = saves.state();
  if (st === "error" || st === "read-blocked") return "error";
  if (st === "loading") return "loading";
  if (st === "uploading" || st === "foreign" || saves.status() === "pending") return "saving";
  return "synced";
}
export function flush(): void { void saves.flush().catch(() => undefined); }
/** Erase progress (Settings › Data): a fresh document on the device and, signed in, in the cloud. */
export function resetDoc(): void { replaceDoc(Store.defaults()); saveDoc(); }

// --- the browser build's account settings ----------------------------------------------
const LEGACY = ["volume", "muted", "reducedMotion", "highContrast", "largeText", "ui.language", "audio.options"];
function dropLegacy(): void {
  const keys = settings.legacyKeys();
  if (!keys) return;
  for (const key of keys) if (LEGACY.includes(key)) settings.removeLegacy(key);
}

/** Reads the device's save (from onStart). */
export function initPlatform(): void {
  const cur = saves.load();
  lastSavedAt = cur?.savedAt ?? 0;
  replaceDoc(Store.normalize(cur?.data ?? null) ?? Store.defaults());
  settings.onLegacy(dropLegacy);
  dropLegacy();
  if (saves.state() === "foreign") migrateForeign();
  refreshPlayer();
  void serverTime().catch(() => undefined);
}

// --- the player and the clock -----------------------------------------------------------
export function signedIn(): boolean { return !!player(); }
export function displayName(): string { return player()?.displayName ?? ""; }
export function signIn(): void { void requestSignIn().catch(() => undefined); }
let invite: string | null = null;
/** The invite link, fetched ahead so a button press can copy it at once. */
export function inviteLink(): string | null { return player() ? invite : null; }
const playerListeners = new Set<(signedIn: boolean) => void>();
export function onPlayer(fn: (signedIn: boolean) => void): void { playerListeners.add(fn); }
function refreshPlayer(): void {
  invite = null;
  board = null;
  for (const fn of playerListeners) fn(!!player());
  if (!player()) return;
  fetchInviteLink().then((u) => { invite = u; }, () => { invite = null; });
}
onPlayerChange(() => refreshPlayer());

/** Now in ms by the platform's clock when it has answered, else the device's. */
export function nowMs(): number {
  try { return serverNow() ?? Date.now(); } catch { return Date.now(); }
}
/** Today's UTC date (YYYY-MM-DD) by nowMs(): the Daily board's seed. */
export function todayUTC(): string { return new Date(nowMs()).toISOString().slice(0, 10); }

// --- the StarHermit high-score board ------------------------------------------------------
let board: Leaderboard | null = null;
async function highScoreBoard(): Promise<Leaderboard | null> {
  if (board) return board;
  const list = await leaderboards.list();
  board = list.find((b) => b.key === "high-score") ?? list[0] ?? null;
  return board;
}
export interface Posted { posted: boolean; rank: number | null }

/** Signed in only: post a finished game's total through score-script.js; never rejects. */
export async function postLeaderboard(total: number): Promise<Posted> {
  const me = player();
  if (!me) return { posted: false, rank: null };
  const score = Math.max(0, Math.round(total));
  let accepted: string[] = [];
  try {
    const sessionId = await sessions.practice();
    accepted = await new Promise<string[]>((resolve) => {
      const socket = connectGame(sessionId);
      let done = false;
      const finish = (v: string[]): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        socket.close();
        resolve(v);
      };
      const timer = setTimeout(() => finish([]), 15000);
      socket.on("open", () => { socket.sendCommand({ type: "result", scores: { "high-score": score } }); });
      socket.on("game", (data) => {
        const d = data as { type?: string; accepted?: string[] } | null;
        if (d && d.type === "result-ack") finish(Array.isArray(d.accepted) ? d.accepted : []);
      });
      socket.on("error", () => finish([]));
      socket.on("stopped", () => finish([]));
      socket.on("abandoned", () => finish([]));
    });
  } catch { return { posted: false, rank: null }; }
  if (!accepted.includes("high-score")) return { posted: false, rank: null };
  try {
    const b = await highScoreBoard();
    if (!b) return { posted: true, rank: null };
    const r = await leaderboards.entries(b.id, { pageSize: 100 });
    const mine = r.items.find((e) => e.userId === me.userId);
    return { posted: true, rank: mine ? mine.rank : null };
  } catch { return { posted: true, rank: null }; }
}
