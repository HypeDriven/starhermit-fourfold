// Fourfold on the StarHermit engine: the entry module (starhermit.txt
// engine.entry), played natively by the StarHermit client and in browsers by
// the engine's web runtime. The rules, content, AI, seeded streams and the
// progress document are the browser build's js/*.js (classic scripts,
// native/classic.ts), unchanged in behaviour; the screens and HUD are
// starhermit:ui (screens.ts), the board starhermit:scene (render.ts), the
// controller app.ts, the AI's searches a worker (ai.ts), saves and the
// platform platform.ts.
import { frame, onFixedUpdate, onPreferencesChange, onQuit, onRender, onResume, onStart, onSuspend, onUpdate, preferences, setFixedRate } from "starhermit:engine";
import { onAction } from "starhermit:input";
import { onSessionEnded } from "starhermit:platform";
import * as ui from "starhermit:ui";
import { platformStrings } from "./classic.ts";
import { initLanguage } from "./i18n.ts";
import * as render from "./render.ts";
import * as audio from "./audio.ts";
import * as ai from "./ai.ts";
import * as platform from "./platform.ts";
import { lookFor } from "./quality.ts";
import { initStyles } from "./style.ts";
import { boardRegion, drawScreens } from "./screens.ts";
import * as A from "./app.ts";
import { app } from "./app.ts";

const STEP_MS = 1000 / 60;

onStart(() => {
  setFixedRate(60);
  initLanguage();
  initStyles();
  platform.initPlatform();
  applyLook();
  audio.loadSfx();
  ai.warm();
  A.go("title");
});
function applyPrefs(): void {
  render.setReducedMotion(preferences().reducedMotion);
  render.setHighContrast(A.highContrast());
}
onPreferencesChange(applyPrefs);
onSessionEnded(() => { app.notice = platformStrings().signedOut!; });

let hidden = false;
onSuspend(() => { hidden = true; audio.setSuspended(true); A.onSuspend(); platform.flush(); });
onResume(() => { hidden = false; audio.setSuspended(false); });
onQuit(() => { A.saveProgress(); platform.flush(); });

// ------------------------------------------------------------------ keys and pads
function fresh(): boolean { return A.clock.frame !== app.openedAt; }
onAction((e) => {
  if (!e.pressed || ui.capturingKeys()) return;
  const playing = app.screen === "play" && !!A.session;
  if (e.action === "back") {
    // Esc: the pause sheet (its dialog closes itself on Back), a menu screen's Back.
    if (app.overlay) return;
    if (playing) { if (fresh() && !A.session!.over) { A.play("menu-tap"); A.openPause(); } return; }
    if (app.screen === "settings") { if (fresh()) A.settingsBack(); return; }
    if (app.screen !== "title" && fresh()) A.go("title");
    return;
  }
  if (!playing || app.overlay) return;
  switch (e.action) {
    case "pause": if (fresh()) { A.play("menu-tap"); A.openPause(); } return;
    case "undo": A.undo(); return;
    case "hint": A.hint(); return;
    case "restart": A.restart(); return;
    case "col_left": case "col_right": {
      // With a column focused the UI moves focus itself; from nothing focused, the arrow picks a column.
      if (ui.focused()) return;
      const st = A.session!.state;
      const from = app.hoverCol >= 0 ? app.hoverCol : Math.floor(st.cols / 2) - (e.action === "col_right" ? 1 : 0);
      const dir = e.action === "col_right" ? 1 : -1;
      for (let k = 1; k <= st.cols; k++) {
        const j = (((from + dir * k) % st.cols) + st.cols) % st.cols;
        if (st.heights[j]! < st.rows && st.cfg.bannedCols.indexOf(j) === -1) { ui.setFocus(`col-${j}`); break; }
      }
      return;
    }
    default: {
      const m = /^col(\d)$/.exec(e.action);
      if (m) {
        const c = Number(m[1]) - 1;
        if (c < A.session!.state.cols) A.humanDrop(c);
      }
    }
  }
});

// ------------------------------------------------------------------ frame
let lookKey = "";
function applyLook(): void {
  const f = frame();
  const key = `${f.quality}:${f.levelIndex}`;
  if (key === lookKey) return;
  lookKey = key;
  render.applyLook(lookFor(f.quality, f.levelIndex));
}
onFixedUpdate(() => {
  if (hidden) return;
  A.tick(STEP_MS);
});
let frameDt = 0;
onUpdate((dt) => {
  frameDt = dt;
  applyLook();
  applyPrefs();
  audio.update();
});
onRender(() => {
  drawScreens();
  const f = frame();
  render.setFrameScale(ui.preferences().scale);
  render.setHover(app.overlay ? -1 : app.hoverCol);
  render.update(frameDt, boardRegion(), f.width, f.height, hidden || !!A.session?.paused);
});
