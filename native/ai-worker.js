// The AI off the game's thread (starhermit:script worker, a module): the
// browser build's js/ai.js and js/rng.js unchanged. The Master's eight-ply
// search takes up to a few seconds in the native interpreter, longer than a
// frame may run; on the worker the board keeps drawing meanwhile.
// Message in:  { id, kind: "move" | "hint", state, level, rng }  (rng: the AI
// stream's mulberry32 state). Message out: { id, col, rng } (the stream's
// state after the search, so the session's stream continues exactly as it
// would have on the main thread).
import "../js/rng.js";
import "../js/ai.js";

globalThis.onmessage = (e) => {
  const d = e.data;
  const rng = globalThis.FFRNG.create(d.rng >>> 0);
  let col = -1;
  try {
    col = d.kind === "hint" ? globalThis.FFAI.suggestMove(d.state, rng) : globalThis.FFAI.chooseMove(d.state, d.level, rng);
  } catch (err) { col = -1; }
  postMessage({ id: d.id, col: col == null ? -1 : col, rng: rng.state });
};
