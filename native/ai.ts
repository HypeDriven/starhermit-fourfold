// The rival and the hint search (js/ai.js) on a worker (native/ai-worker.js)
// so a deep search never stalls a frame: natively the Master's eight-ply
// search takes seconds, past the 32 ms a frame call may run. A request
// carries the session's AI stream state and its answer brings the stream's
// new state back, so moves are the same as the browser build's for the same
// position and seed. Without a worker (it failed to start) the search runs
// on the game's thread as before.
import { worker, type Worker } from "starhermit:script";
import { AI, RNG, type Rng, type State } from "./classic.ts";

type Reply = { id: number; col: number; rng: number };
let w: Worker | null = null;
let failed = false;
let nextId = 1;
const waiting = new Map<number, (col: number, rng: number) => void>();

function ensure(): Worker | null {
  if (w || failed) return w;
  try {
    w = worker("native/ai-worker.js", { type: "module" });
    w.on("message", (m) => {
      const r = m as unknown as Reply;
      const job = waiting.get(r.id);
      if (!job) return;
      waiting.delete(r.id);
      job(r.col, r.rng >>> 0);
    });
    // A long search reports "not responding" but goes on: the answer still comes.
    w.on("error", (msg) => { if (!/not responding/i.test(msg)) console.warn(`ai worker: ${msg}`); });
    w.on("stopped", () => {
      failed = true; w = null;
      // Whatever was asked runs here instead.
      for (const [id, job] of waiting) { waiting.delete(id); job(-1, -1); }
    });
  } catch (e) { console.warn(`ai worker: ${String(e)}`); failed = true; w = null; }
  return w;
}

/** Starts the worker ahead of the first request (its module loads meanwhile). */
export function warm(): void { ensure(); }

/** Asks for a column; `done` hears it (-1: none) with the AI stream's state
 * after the search, which the caller adopts when it uses the answer (the
 * stream stays untouched for an answer it drops). Returns a cancel. */
export function request(kind: "move" | "hint", state: State, level: number, rng: Rng, done: (col: number, rngState: number) => void): () => void {
  const sync = (): void => {
    const r = RNG.create(rng.state);
    let col = -1;
    try { col = kind === "hint" ? AI.suggestMove(state, r) : AI.chooseMove(state, level, r); } catch { col = -1; }
    done(col == null ? -1 : col, r.state);
  };
  const wk = ensure();
  if (!wk) { sync(); return () => undefined; }
  const id = nextId++;
  let cancelled = false;
  waiting.set(id, (col, next) => { if (cancelled) return; if (next < 0) sync(); else done(col, next); });
  try { wk.post({ id, kind, state: JSON.parse(JSON.stringify(state)), level, rng: rng.state >>> 0 }); }
  catch (e) { waiting.delete(id); console.warn(`ai worker: ${String(e)}`); sync(); }
  return () => { cancelled = true; waiting.delete(id); };
}
