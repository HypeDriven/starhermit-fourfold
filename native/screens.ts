// Every screen, sheet and the board's HUD on starhermit:ui, drawn each frame
// from the app's state (the browser build's index.html sections and the
// layout rules of css/app.css): the header bar (wordmark, account name, Help
// and Settings), one screen at a time below it in a centred column (840
// logical px at most, the board's 720; 16 px padding, 12 under 560 px wide),
// the pause and results sheets as modal dialogs over the board. The play
// screen is HUD → board region → status line → tray; on phones the tray's
// buttons pair up in two rows; on short landscape windows (≤ 500 px tall)
// the board sits at the start with the HUD, status and tray in a column
// beside it, as the old @media rules did. The board's columns are ui widgets
// laid over the 3D board (role button, named "Column n, …" as the old
// buttons' aria-labels), so pointer, touch, keyboard focus, Enter, the
// gamepad and screen readers all drive the same targets.
import { frame, openMenu } from "starhermit:engine";
import * as draw from "starhermit:draw";
import * as ui from "starhermit:ui";
import { Content, Rules, platformStrings } from "./classic.ts";
import { N, T } from "./i18n.ts";
import * as render from "./render.ts";
import * as platform from "./platform.ts";
import * as A from "./app.ts";
import { app } from "./app.ts";
import { PAGE_BG } from "./style.ts";

// ------------------------------------------------------------------ viewport and helpers
let VW = 1280, VH = 720, SCALE = 1, SA = { top: 0, left: 0, right: 0, bottom: 0 };
function measureViewport(): void {
  const f = frame();
  SCALE = ui.preferences().scale || 1;
  SA = f.safeArea;
  VW = Math.max(1, (f.width - SA.left - SA.right) / SCALE);
  VH = Math.max(1, (f.height - SA.top - SA.bottom) / SCALE);
}
const narrow = (): boolean => VW < 560;
const shortLandscape = (): boolean => VH <= 500 && VW > VH;
const hex = (n: number): string => "#" + (n >>> 0).toString(16).padStart(6, "0");
const fmtTime = (ms: number): string => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

function lbl(text: string, cls = "text"): void { ui.style(cls).label(text); }
function para(text: string, width: number, cls = "text"): void { ui.style(cls).paragraph(text, Math.max(40, width)); }
function textWidth(text: string, cls: string, kind: "button" | "label" = "button"): number {
  return ui.measureText(text, { kind, style: cls }).width / SCALE;
}
/** A button acknowledging with the menu tap (board columns and tray actions have their own cues). */
function btn(id: string, label: string, cls: string, opts: ui.ButtonOptions = {}, width?: number, tap = true): boolean {
  const s = width ? ui.style(cls, { width }) : ui.style(cls);
  const hit = s.id(id).button(label, opts);
  if (hit && tap) A.play("menu-tap");
  return hit;
}
/** A menu card (the old <button class="card"> with a title and a smaller line). */
function card(id: string, title: string, sub: string, width: number, opts: { mastery?: boolean; stars?: string; disabled?: boolean } = {}): boolean {
  const inner = width - 30;
  const hit = ui.style(opts.mastery ? "card-mastery" : "card", { width }).id(id).button(title, {
    disabled: opts.disabled,
    content: () => {
      ui.style("card-title").paragraph(title, inner);
      if (opts.stars != null) lbl(opts.stars, "card-stars");
      if (sub) ui.style("card-sub").paragraph(sub, inner);
    },
  });
  if (hit) A.play("menu-tap");
  return hit;
}
function fieldset(id: string, legend: string, width: number, build: (w: number) => void): void {
  ui.column(id, () => { lbl(legend, "legend"); build(width - 26); }, { width, spacing: 8, style: "fieldset" });
}

// ------------------------------------------------------------------ header
const HEADER_H = 61;
function header(): void {
  const P = platformStrings();
  ui.row("app-header", () => {
    lbl("▮", "mark");
    ui.style("wordmark").label("FOURFOLD");
    if (platform.signedIn()) {
      const name = platform.displayName() || P.signIn!;
      ui.style("acct", { text: { overflow: "ellipsis" }, width: Math.min(260, VW * 0.38) }).label(name);
    }
    ui.spacer();
    if (btn("hdr-help", T("Help and rules"), "btn-icon", { content: () => lbl("?", "text") })) A.go("help");
    if (btn("hdr-settings", T("Settings"), "btn-icon", { content: () => lbl("⚙", "text") })) { app.settingsFrom = "title"; A.go("settings"); }
  }, { width: VW, height: HEADER_H, spacing: 10, align: "center", style: "app-header" });
}

// ------------------------------------------------------------------ screens
/** A scrolling screen with the centred inner column. */
function screen(id: string, maxW: number, build: (w: number) => void): void {
  const pad = narrow() ? 12 : 16;
  const w = Math.min(maxW, VW - pad * 2);
  const scrollTo = app.openedAt === A.clock.frame || A.clock.frame - app.openedAt < 3 ? { top: 0 } : undefined;
  ui.scrollArea(`${id}-scroll`, { width: VW, height: VH - HEADER_H }, () => {
    ui.column(`${id}-outer`, () => {
      ui.id(`${id}-inner`).column(id, () => build(w), { width: w, spacing: 14 });
    }, { width: VW, align: "center", padding: { top: pad, bottom: pad } });
  }, scrollTo ? { scrollTo } : {});
}
function back(): void {
  ui.row("back-row", () => { if (btn("back", T("Back"), "btn-ghost")) A.go("title"); }, { spacing: 10 });
}

function titleScreen(): void {
  const P = platformStrings();
  screen("title", 840, (w) => {
    if (VH >= 560) ui.column("title-art", () => { /* the art is the box's background */ }, { width: w, height: Math.min(230, w * 9 / 16), style: "title-art-img" });
    ui.style("h2").heading(T("Make four in a row"));
    para(T("Drop a disc into a column; it falls to the lowest free cell. The first player to line up four — across, up, or diagonally — wins the board."), Math.min(w, 660), "lede");
    para(A.titleStats(), w, "status");
    const resume = A.resumeLabel();
    if (resume && btn("resume", resume, "btn-primary", {}, w)) A.resumeSaved();
    if (btn("play", T("Play"), "btn-primary", {}, w)) A.go("practice");
    const gap = 10;
    const cols = Math.max(1, Math.min(4, Math.floor((w + gap) / (210 + gap))));
    const cw = (w - gap * (cols - 1)) / cols;
    ui.grid(T("Modes"), () => {
      if (card("journey", T("Journey"), T("42 authored stages, stars and mastery gates"), cw)) A.go("journey");
      if (card("daily", T("Daily board"), T("One shared ruleset per day"), cw)) A.startDaily();
      if (card("challenges", T("Challenges"), T("Taller grids, five in a row, three players"), cw)) A.go("challenges");
      if (card("learn", T("Learn"), T("Six short lessons"), cw)) A.go("learn");
    }, { columns: cols, gap, width: w, align: "stretch" });
    ui.row("account-row", () => {
      if (!platform.signedIn()) { if (btn("signin", P.signIn!, "btn-ghost")) platform.signIn(); }
      else if (platform.inviteLink()) { if (btn("invite", P.invite!, "btn-ghost")) A.copyInvite(); }
    }, { spacing: 10 });
    if (app.notice) para(app.notice, w, "status");
  });
}

function practiceScreen(): void {
  screen("practice", 840, (w) => {
    ui.style("h2").heading(T("Play"));
    para(T("Pick an opponent. Undo and hints are available; nothing here is ranked."), Math.min(w, 660), "lede");
    ui.column("practice-list", () => {
      for (const p of Content.PRACTICE) if (card(`practice-${p.id}`, T(p.name), T(p.blurb), w)) A.startSession("practice:" + p.id);
    }, { spacing: 10, width: w });
    back();
  });
}

function journeyScreen(): void {
  const store = A.doc();
  screen("journey", 840, (w) => {
    ui.style("h2").heading(T("Journey"));
    para(T("Stars come from winning and from winning under par. Mastery stages (outlined) must be won before the stages after them open."), Math.min(w, 660), "lede");
    const gap = 8;
    const cols = Math.max(2, Math.floor((w + gap) / (112 + gap)));
    const cw = (w - gap * (cols - 1)) / cols;
    let unlocked = true;
    ui.grid(T("Journey"), () => {
      Content.JOURNEY.forEach((l, idx) => {
        const stars = store.journey[l.id] || 0;
        const open = idx === 0 || unlocked;
        const title = `${idx + 1}. ${T(l.name)}`;
        if (card(`stage-${l.id}`, title, open ? "" : T("Locked"), cw, { mastery: l.mastery, stars: "★".repeat(stars) + "☆".repeat(3 - stars), disabled: !open }) && open) A.startSession("journey:" + l.id);
        // A mastery stage gates the stages after it until it is won.
        if (l.mastery && stars === 0) unlocked = false;
      });
    }, { columns: cols, gap, width: w, align: "stretch" });
    back();
  });
}

function challengesScreen(): void {
  const store = A.doc();
  screen("challenges", 840, (w) => {
    ui.style("h2").heading(T("Challenges"));
    para(T("Each challenge states its rules and assists before you commit."), Math.min(w, 660), "lede");
    ui.column("challenge-list", () => {
      for (const c of Content.CHALLENGES) {
        const best = store.challenges[c.id];
        if (card(`challenge-${c.id}`, T(c.name), T(c.blurb) + (best ? " · " + T("best {n}", { n: best }) : ""), w)) A.startSession("challenge:" + c.id);
      }
    }, { spacing: 10, width: w });
    back();
  });
}

function learnScreen(): void {
  const store = A.doc();
  screen("learn", 840, (w) => {
    ui.style("h2").heading(T("Learn"));
    para(T("Short lessons, replayable at any time."), Math.min(w, 660), "lede");
    ui.column("learn-list", () => {
      for (const l of Content.LESSONS) {
        if (card(`lesson-${l.id}`, T(l.title), (store.lessons[l.id] ? "✓ " + T("done") + " · " : "") + T(l.text), w)) A.startSession("lesson:" + l.id);
      }
    }, { spacing: 10, width: w });
    back();
  });
}

const SYNC_TEXT: Record<string, string> = {
  loading: N("Syncing…"), saving: N("Saving…"), synced: N("Cloud saved"), error: N("Cloud sync failed — will retry"),
};
function settingsScreen(): void {
  screen("settings", 840, (w) => {
    ui.style("h2").heading(T("Settings"));
    fieldset("set-options", T("Options"), w, (iw) => {
      para(T("Sound, graphics, language, controls, reduced motion, high contrast and text size are in the StarHermit Options menu (F1)."), iw, "status");
      if (btn("open-options", T("Open Options"), "btn-center")) openMenu();
    });
    fieldset("set-a11y", T("Accessibility"), w, (iw) => {
      para(T("Disc colours are always reinforced by a shape: ● you, ◆ rival, ▲ third, ■ fourth."), iw, "status");
    });
    fieldset("set-data", T("Data"), w, (iw) => {
      const online = platform.signedIn();
      const sync = platform.syncState();
      para(online ? T("Signed in as {name} · {sync}", { name: platform.displayName(), sync: T(SYNC_TEXT[sync] ?? N("Saving…")) }) : T("Progress is stored only on this device."), iw, "status");
      if (!app.confirmErase) {
        if (btn("erase", online ? T("Erase progress on this device and in the cloud") : T("Erase progress on this device"), "btn")) app.confirmErase = true;
      } else {
        para(T("Erase all Fourfold progress on this device?"), iw, "text");
        ui.row("erase-confirm", () => {
          if (btn("erase-yes", T("Erase"), "btn-center")) A.eraseProgress();
          if (btn("erase-no", T("Cancel"), "btn-ghost")) app.confirmErase = false;
        }, { spacing: 10 });
      }
      if (app.notice && app.screen === "settings") para(app.notice, iw, "status");
    });
    ui.row("back-row", () => { if (btn("back", T("Back"), "btn-ghost")) A.settingsBack(); }, { spacing: 10 });
  });
}

function helpScreen(): void {
  screen("help", 840, (w) => {
    ui.style("h2").heading(T("How to play"));
    para(T("Players take turns dropping a disc into a column. Each disc falls to the lowest free cell. The first player with four of their own discs in a straight line — horizontal, vertical, or diagonal — wins. If every cell fills with no line, it is a draw."), Math.min(w, 660), "lede");
    fieldset("help-controls", T("Controls"), w, (iw) => {
      for (const line of [
        T("Click or tap a column to drop."),
        T("← → move between columns; Enter or Space drops."),
        T("1–9 drop straight into that column number."),
        T("U undo, H hint, R restart, P or Esc pause."),
        T("Gamepad: the D-pad moves between columns, A drops, X hints, Y undoes, Start pauses."),
      ]) para("• " + line, iw, "text");
    });
    fieldset("help-scoring", T("Scoring"), w, (iw) => {
      para(T("A win is worth 1000. Winning under the stage's par drops adds 25 per drop saved, and beating a par time adds 5 per second saved. A draw is worth 300."), iw, "text");
    });
    back();
  });
}

// ------------------------------------------------------------------ the board
let boardRect: render.Rect = { x: 0, y: 0, width: 0, height: 0 };
/** The board region's rectangle in window pixels, as last laid out. */
export function boardRegion(): render.Rect { return boardRect; }

function hudPanel(w: number, compact: boolean): void {
  const s = A.session!;
  const st = s.state, cfg = s.cfg;
  const p = st.terminal ? (st.terminal.winner || 1) : st.current;
  let turn: string;
  if (st.terminal) turn = A.outcomeHeadline(st).text;
  else if (s.lessonDone) turn = T("Lesson complete");
  else if (s.aiLevel === 0) turn = st.current === 1 ? T("Your turn") : T("{name}’s turn", { name: A.playerName(st.current) });
  else if (st.current === 1) turn = T("Your turn");
  else turn = T("{name} is thinking…", { name: A.playerName(st.current) });
  const meta: [string, string][] = [];
  if (cfg.timeLimitSec > 0) meta.push([T("Time left"), fmtTime(cfg.timeLimitSec * 1000 - A.elapsedMs())]);
  else meta.push([T("Time"), fmtTime(A.elapsedMs())]);
  if (cfg.moveLimit > 0) meta.push([T("Drops left"), String(Math.max(0, cfg.moveLimit - st.dropsBy[1]!))]);
  else meta.push([T("Drops"), String(st.dropsBy[1])]);
  if (cfg.par && cfg.par.moves > 0) meta.push([T("Par"), String(cfg.par.moves)]);
  const inner = w - 26;
  ui.column("hud", () => {
    const chip = (): void => {
      const color = hex(A.playerColor(p)), icon = A.playerIcon(p);
      ui.widget("turn-chip", {
        role: "none", size: { width: 24, height: 24 },
        draw: (r) => {
          draw.circle(r.x + r.width / 2, r.y + r.height / 2, r.width / 2, color);
          const m = draw.measureText(icon, { size: 14 * SCALE });
          draw.text(icon, r.x + r.width / 2, r.y + (r.height - m.height) / 2, { size: 14 * SCALE, color: "#06101f", align: "center" });
        },
      });
    };
    const metaRow = (): void => {
      for (const [k, v] of meta) ui.row(`meta-${k}`, () => { lbl(k, "meta"); lbl(v, "meta-b"); }, { spacing: 4, align: "center" });
    };
    const metaW = meta.reduce((a, [k, v]) => a + textWidth(k, "meta", "label") + textWidth(v, "meta-b", "label") + 4 + 12, 0);
    const turnW = textWidth(turn, "turn", "label") + 32;
    if (compact || turnW + metaW > inner) {
      ui.row("hud-turn", () => { chip(); ui.style("turn").paragraph(turn, inner - 32); }, { spacing: 8, align: "center", width: inner });
      ui.row("hud-meta", metaRow, { spacing: 12, align: "center" });
    } else {
      ui.row("hud-top", () => { chip(); lbl(turn, "turn"); ui.spacer(); metaRow(); }, { spacing: 8, align: "center", width: inner });
    }
    para(objectiveText(), inner, "objective");
  }, { width: w, spacing: 6, style: "hud" });
}

function objectiveText(): string {
  const cfg = A.session!.cfg;
  const goal = T("Connect {n} of your discs in a row.", { n: cfg.connect });
  if (cfg.lesson) return T(cfg.lesson.text);
  if (cfg.kind === "challenge") return goal + " " + (cfg.blurb ? T(cfg.blurb) : "");
  if (cfg.moveLimit > 0) return goal + " " + T("Within {n} of your drops.", { n: cfg.moveLimit });
  if (cfg.timeLimitSec > 0) return goal + " " + T("Within {n} seconds.", { n: cfg.timeLimitSec });
  return goal;
}

/** The board region: the column targets over the 3D board. */
function boardColumns(w: number, h: number | null): void {
  const s = A.session!;
  const st = s.state;
  const r = ui.id("board-region").column(T("Columns — choose one to drop a disc"), () => {
    if (!boardRect.width) return;
    const first = render.columnRect(0);
    const colW = first.width / SCALE;
    const padStart = Math.max(0, (first.x - boardRect.x) / SCALE);
    const top = Math.max(0, (first.y - boardRect.y) / SCALE);
    const colH = Math.max(1, first.height / SCALE);
    let hovered = -1, focused = -1;
    const mine = st.current === 1 || s.aiLevel === 0;
    const pressed: number[] = [];
    ui.row("cols", () => {
      for (let c = 0; c < st.cols; c++) {
        const full = st.heights[c]! >= st.rows;
        const banned = st.cfg.bannedCols.indexOf(c) !== -1;
        const dv = { n: c + 1, filled: st.heights[c]!, rows: st.rows, row: st.heights[c]! + 1 };
        let desc = banned ? T("Column {n}, {filled} of {rows} filled, sealed", dv)
          : full ? T("Column {n}, {filled} of {rows} filled, full", dv)
            : T("Column {n}, {filled} of {rows} filled, drops into row {row}", dv);
        // The hint's column, and a lesson's taught column ("the glowing column"), outlined in your colour.
        const taught = !!s.cfg.lesson?.onlyCols && s.cfg.lesson.onlyCols.indexOf(c) !== -1 && !s.over;
        const isHint = s.hintCol === c;
        if (isHint) desc += " " + T("(hint)");
        const disabled = !!st.terminal || s.over || full || banned || !mine || !!app.overlay;
        const res = ui.id(`col-${c}`).widget(desc, {
          role: "button", size: { width: colW, height: colH }, style: "col-target", disabled,
          draw: (rect, state) => {
            const color = isHint || taught ? hex(A.playerColor(1)) : state.hovered && !state.disabled ? "#7fb0ff8c" : null;
            if (color) draw.strokeRoundRect(rect.x + SCALE, rect.y + SCALE, rect.width - 2 * SCALE, rect.height - 2 * SCALE, 8 * SCALE, color, 2 * SCALE);
          },
        });
        if (res.hovered) hovered = c;
        if (res.focused) focused = c;
        if (res.activated && !disabled) pressed.push(c);
      }
    }, { spacing: 0, padding: { start: padStart, top } });
    // The whole board as text for screen readers (the old #grid-mirror): "Row 6: empty, You, Rival…".
    const lines: string[] = [];
    for (let row = st.rows - 1; row >= 0; row--) {
      const cells: string[] = [];
      for (let c = 0; c < st.cols; c++) { const v = Rules.cellAt(st, c, row); cells.push(v ? A.playerName(v) : T("empty")); }
      lines.push(T("Row {n}: {cells}", { n: row + 1, cells: cells.join(", ") }));
    }
    ui.id("grid-mirror").target(lines.join(". "), boardRect, { role: "label" });
    app.hoverCol = hovered >= 0 ? hovered : focused;
    // Presses act after the frame's widgets are built (a drop changes the board they read).
    if (pressed.length) queueMicrotask(() => A.humanDrop(pressed[0]!));
  }, h == null ? { width: w, grow: 1 } : { width: w, height: h });
  boardRect = { x: r.x, y: r.y, width: r.width, height: r.height };
}

function statusLine(w: number): void {
  const st = app.status;
  ui.column("status", () => { if (st.text) para(st.text, w, st.error ? "status-error" : "status"); }, { width: w, height: 22 + (narrow() ? 20 : 0) });
}

function tray(w: number, vertical: boolean): void {
  const s = A.session!;
  const st = s.state;
  const undoOff = s.over || !s.cfg.mechanics.undo || !s.history.length || !!app.overlay;
  const hintOff = s.over || !s.cfg.mechanics.hint || (st.current !== 1 && s.aiLevel > 0) || !!app.overlay;
  const items: [string, string, boolean, () => void][] = [
    ["tray-undo", T("Undo") + " (U)", undoOff, () => A.undo()],
    ["tray-hint", T("Hint") + " (H)", hintOff, () => A.hint()],
    ["tray-restart", T("Restart") + " (R)", !!app.overlay, () => A.restart()],
    ["tray-pause", T("Pause") + " (P)", s.over || !!app.overlay, () => A.openPause()],
  ];
  const gap = vertical ? 6 : 8;
  const run = (it: [string, string, boolean, () => void], width: number): void => {
    if (btn(it[0], it[1], "btn-center", { disabled: it[2] }, width, false)) it[3]();
  };
  if (vertical) {
    ui.column("tray", () => { for (const it of items) run(it, w); }, { width: w, spacing: gap });
    return;
  }
  const perRow = narrow() ? 2 : 4;
  const each = (w - gap * (perRow - 1)) / perRow;
  ui.column("tray", () => {
    for (let i = 0; i < items.length; i += perRow) {
      ui.row(`tray-r${i}`, () => { for (const it of items.slice(i, i + perRow)) run(it, each); }, { spacing: gap, width: w });
    }
  }, { width: w, spacing: gap });
}

function playScreen(): void {
  const s = A.session;
  if (!s) { A.go("title"); return; }
  const mainH = VH - HEADER_H;
  if (shortLandscape()) {
    // Board beside HUD and tray, nothing scrolls.
    const pad = 8;
    const side = Math.max(190, Math.min(240, VW * 0.3));
    const boardW = VW - side - pad * 3;
    ui.row("play-land", () => {
      boardColumns(boardW, mainH - pad * 2);
      ui.column("play-side", () => {
        hudPanel(side, true);
        statusLine(side);
        ui.spacer();
        tray(side, true);
      }, { width: side, height: mainH - pad * 2, spacing: 8 });
    }, { width: VW, height: mainH, spacing: pad, padding: pad });
    return;
  }
  const pad = 10;
  const w = Math.min(720, VW - pad * 2);
  ui.column("play-outer", () => {
    ui.column("play", () => {
      hudPanel(w, narrow());
      boardColumns(w, null);
      statusLine(w);
      tray(w, false);
    }, { width: w, height: mainH - pad * 2, spacing: 14 });
  }, { width: VW, height: mainH, align: "center", padding: { top: pad, bottom: pad } });
}

// ------------------------------------------------------------------ sheets
function sheetWidth(): number { return Math.min(460, VW - 32); }

function pauseSheet(): void {
  const w = sheetWidth() - 36;
  const open = ui.dialog(T("Paused"), "", true, () => {
    ui.column("pause-sheet", () => {
      ui.style("sheet-h").heading(T("Paused"));
      if (btn("pause-resume", T("Resume"), "btn-primary", {}, w)) A.closePause();
      if (btn("pause-restart", T("Restart this board"), "btn", {}, w)) A.restart();
      if (btn("pause-settings", T("Settings"), "btn", {}, w)) A.pauseSettings();
      if (btn("pause-resign", T("Resign"), "btn", {}, w)) queueMicrotask(() => A.resign());
      if (btn("pause-leave", T("Leave to menu"), "btn-ghost", {}, w)) A.leaveGame();
    }, { width: w, spacing: 12 });
  });
  // Back / Escape closes the sheet (resume), but not on the frame whose Escape opened it.
  if (!open && A.clock.frame !== app.openedAt && app.overlay === "pause") A.closePause();
}

function resultsSheet(): void {
  const s = A.session!;
  const st = s.state;
  const w = sheetWidth() - 36;
  const head = s.lessonDone ? { text: T("Lesson complete"), cls: "win" as const } : A.outcomeHeadline(st);
  const next = A.nextStage();
  ui.dialog(head.text, "", true, () => {
    ui.column("results-sheet", () => {
      const art = head.cls === "win" ? "results-win-img" : head.cls === "loss" ? "results-lose-img" : null;
      if (art && VH >= 560) ui.column("results-art", () => { /* background */ }, { width: w, height: 140, style: art });
      ui.style(head.cls === "win" ? "headline-win" : head.cls === "loss" ? "headline-loss" : "headline").paragraph(head.text, w);
      if (!s.lessonDone) {
        if (s.cfg.kind === "journey") { const n = Rules.starsFor(st); lbl("★".repeat(n) + "☆".repeat(3 - n), "stars"); }
        const comp = st.score.components;
        const rows: [string, string][] = ([
          [T("Line completed"), comp.win], [T("Draw"), comp.draw], [T("Under par drops"), comp.parMoves], [T("Speed bonus"), comp.speed],
        ] as [string, number][]).filter((r) => r[1] > 0).map(([k, v]) => [k, String(v)]);
        rows.push([T("Your drops"), String(st.dropsBy[1])]);
        rows.push([T("Time"), fmtTime(A.elapsedMs())]);
        ui.grid(T("Score"), () => {
          for (const [k, v] of rows) { lbl(k, "bd-key"); lbl(v, "bd-val"); }
          lbl(T("Score"), "bd-total-key"); lbl(String(st.score.total), "bd-total-val");
        }, { columns: [{ fr: 1 }, { width: "auto", align: "end" }], gap: { row: 4, column: 12 }, width: w });
        if (app.lbLine) para(app.lbLine, w, "lb-line");
      }
      if (next && btn("res-next", T("Next: {name}", { name: T(next.name) }), "btn-primary", {}, w)) A.resultsNext();
      if (btn("res-retry", T("Play again"), "btn", {}, w)) A.resultsRetry();
      if (btn("res-menu", T("Back to menu"), "btn-ghost", {}, w)) A.resultsMenu();
    }, { width: w, spacing: 12 });
  });
}

// ------------------------------------------------------------------ frame
export function drawScreens(): void {
  measureViewport();
  ui.setViewport({ x: SA.left, y: SA.top, width: VW * SCALE, height: VH * SCALE });
  const playing = app.screen === "play" && !!A.session;
  if (playing && boardRect.width) {
    // The page around the board region (the scene shows through it alone).
    const f = frame(), b = boardRect;
    draw.rect(0, 0, f.width, b.y, PAGE_BG);
    draw.rect(0, b.y + b.height, f.width, f.height - b.y - b.height, PAGE_BG);
    draw.rect(0, b.y, b.x, b.height, PAGE_BG);
    draw.rect(b.x + b.width, b.y, f.width - b.x - b.width, b.height, PAGE_BG);
  }
  ui.column("app", () => {
    header();
    switch (app.screen) {
      case "title": titleScreen(); break;
      case "practice": practiceScreen(); break;
      case "journey": journeyScreen(); break;
      case "challenges": challengesScreen(); break;
      case "learn": learnScreen(); break;
      case "settings": settingsScreen(); break;
      case "help": helpScreen(); break;
      case "play": playScreen(); break;
    }
  }, { width: VW, height: VH, spacing: 0 });
  if (playing) {
    if (app.overlay === "pause") pauseSheet();
    else if (app.overlay === "results") resultsSheet();
  }
}
