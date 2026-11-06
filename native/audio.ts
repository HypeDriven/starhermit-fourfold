// Sound, as the browser build's js/sfx.js: the 20 authored clips
// (sfx/<name>.opus, sfx/manifest.txt) per rules event and UI cue, `drop`
// picking one of three variants (a SoundBank; never the same one twice). There is no music and
// no ambience by design. The browser build's master volume and mute are the
// runtime's Options › Audio now (effects on the "effects" bus, the menu tap
// on "interface"); its default 0.8 volume is folded into each cue's gain.
// The synthesized stand-ins it played while a clip decoded are not ported (a
// live synthesis graph makes clip loads fail on the engine's web runtime,
// the arrow-exodus port's finding), so a cue whose clip is still loading is
// silent; every clip loads at once in onStart (each loaded clip reaches the
// mixer, natively and on the web). Every cue has a visible
// counterpart (status line, HUD, results), so nothing is audio-only.
import { loadClip, play as playClip, SoundBank, type AudioClip } from "starhermit:audio";
import type { Result } from "./classic.ts";

export type Cue =
  | "drop" | "win" | "draw" | "move-limit" | "resigned" | "time-up" | "column-full" | "bad-column"
  | "banned-column" | "out-of-turn" | "game-ended" | "unknown-command" | "malformed-command"
  | "hint" | "undo" | "lesson-complete" | "clock-warning" | "menu-tap";
const SAMPLES: Record<Cue, string[]> = {
  drop: ["disc-drop-a", "disc-drop-b", "disc-drop-c"],
  win: ["line-win"],
  draw: ["board-draw"],
  "move-limit": ["move-limit-bell"],
  resigned: ["resign-fold"],
  "time-up": ["time-up-tick"],
  "column-full": ["column-full-thud"],
  "bad-column": ["bad-column-knock"],
  "banned-column": ["banned-column-rattle"],
  "out-of-turn": ["out-of-turn-tap"],
  "game-ended": ["game-ended-dull"],
  "unknown-command": ["unknown-command-buzz"],
  "malformed-command": ["malformed-command-click"],
  hint: ["hint-chime"],
  undo: ["undo-rewind"],
  "lesson-complete": ["lesson-complete"],
  "clock-warning": ["clock-warning"],
  "menu-tap": ["menu-tap"],
};
const GAIN = 0.8;

const clips = new Map<string, AudioClip>();
let dropBank: SoundBank | null = null;
let suspended = false;

/** Loads every clip at once (onStart); a cue whose clip is still loading is skipped. */
export function loadSfx(): void {
  for (const [cue, names] of Object.entries(SAMPLES)) {
    const loads = names.map((name) => loadClip(`sfx/${name}.opus`).then((c) => { clips.set(name, c); return c; }, (e: unknown) => { console.warn(`sfx ${name}: ${String(e)}`); return null; }));
    if (cue === "drop") void Promise.all(loads).then((loaded) => {
      const list = loaded.filter((c) => c !== null);
      if (list.length) dropBank = new SoundBank({ clips: list, bus: "effects", gain: GAIN });
    });
  }
}
export function setSuspended(on: boolean): void { suspended = on; }

/** Plays a cue (once its clip is loaded). */
export function play(cue: Cue): void {
  if (suspended) return;
  const clip = clips.get(SAMPLES[cue][0]!);
  try {
    if (cue === "drop") dropBank?.play();
    else if (clip) playClip(clip, { bus: cue === "menu-tap" ? "interface" : "effects", gain: GAIN });
  } catch { /* the mixer is full this frame: skip it */ }
}

/** Plays the cue for an applyCommand result (sfx.js playResult): its events, else its rejection. */
export function playResult(res: Result | null | undefined): void {
  if (!res) return;
  if (!res.ok) { if (res.reason && res.reason in SAMPLES) play(res.reason as Cue); return; }
  for (const e of res.events) if (e && e.t in SAMPLES) play(e.t as Cue);
}

