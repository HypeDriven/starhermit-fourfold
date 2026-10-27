# Fourfold — Game Design Document (running spec)

**Status:** running specification. Present tense; describes the game as it ships: a StarHermit engine script game (engine 1.19.1, host API 1.21), played natively by the StarHermit client and in browsers by the engine's web runtime. Design intent that the code does not yet implement is collected in the final section only.

## 1. Overview

**Pitch.** Drop glossy resin discs into a translucent glass slab and be the first to line up four — across, up, or on a diagonal — against a deterministic rival that ranges from "misses half its wins" to an eight-ply search.

| | |
|---|---|
| Genre | Turn-based alignment / connection game |
| Players | 1 vs AI (four levels), 2 local pass-and-play, one 3-player table vs two AIs |
| Session | 1–4 minutes per board; Journey stages chain with a Next button |
| Platforms | The StarHermit client (Windows, natively) and desktop and mobile browsers (the engine's web runtime: `index.html` is the loader `npm run package` writes), portrait and landscape; keyboard, mouse, touch and gamepad |
| Rendering | `starhermit:scene` (three.js-like): an orthographic view of the slab framed into the board region; every control is `starhermit:ui` (immediate mode), the columns are UI widgets laid over the board |
| Persistence | The engine's game save (`starhermit:storage` `saves`, schema 1: settings, progress, one resumable game) on the device and, signed in, in the player's cloud slot |
| Server | `score-script.js` platform script (leaderboard posts only, server-authoritative range check); `server.js` local static host + `/api/health`; no authoritative play |

File map (what the package and the tests load):

| Path | Responsibility |
|---|---|
| `starhermit.txt` | Manifest: name, owner, `server=score-script.js`, cover, `launch=index.html`, `engine.api=1`, `engine.entry=native/main.ts`, `engine.version=1.19.1`, `engine.minor=19`, `engine.capabilities=platform,storage,clipboard`, `control.*` and `engine.gamepad.*` per action |
| `index.html`, `starhermit-files.json` | The engine's web loader and the package's file index (written by `npm run package`; never edited) |
| `native/main.ts` | Entry: lifecycle (start, suspend, resume, quit), actions (keys and pads), the frame (look per graphics tier, preferences, audio, screens, board) |
| `native/app.ts` | Controller: screen state, sessions (start from a stable key, replay a saved log), the game clock, the AI turn, undo, hints, restart, resign, lessons, results, progression, achievements, the resumable save, the status line |
| `native/screens.ts` | Every screen, the HUD, the column widgets, the tray, the pause and results sheets (`starhermit:ui`) |
| `native/render.ts` | The board on `starhermit:scene`: slab, sockets, discs with relief markers, plate, shadow catchers, light pool, particles, drop/win animation, post effects, the backdrop colour |
| `native/quality.ts` | The four looks (Low, Balanced, High, Ultra) and their budgets, chosen by the runtime's graphics tier |
| `native/ai.ts`, `native/ai-worker.js` | The rival and the hint search (`js/ai.js`) on a `starhermit:script` worker, with the main-thread fallback |
| `native/platform.ts` | The save, its merge and the browser build's foreign cloud save, legacy account settings, the player, invite link, platform clock, leaderboard posting |
| `native/audio.ts` | The 20 authored clips per event on the runtime's mixer |
| `native/i18n.ts`, `native/style.ts`, `native/classic.ts` | Language from the runtime; the style sheet and theme; the classic scripts loaded with `loadClassic` |
| `js/rng.js` | mulberry32 PRNG, FNV-1a string hash, four named streams per master seed |
| `js/rules.js` | Pure rules engine: `createGame`, `legalActions`, `applyCommand`, scoring, stars, serialize/replay/hash |
| `js/content.js` | Player identities, 5 themes, 6 lessons, 42 journey stages, 5 practice presets, 7 challenges, daily generator, achievements, offline validator |
| `js/ai.js` | Four AI levels and the hint search; deterministic per (state, level, seed) |
| `js/store.js` | The progress document: defaults, forward merge, the old cloud text, `mergeStores` |
| `js/i18n/strings.js`, `js/i18n/strings-content.js`, `js/i18n/core.js`, `js/platform-i18n.js` | Translation tables (nine locales), the DOM-free lookup, the account strings |
| `assets/ui-style.json` (from `tools/ui-style.css`) | The UI styles converted with `starhermit css` (`npm run css`) |
| `assets/key-art.webp`, `assets/results-win.webp`, `assets/results-lose.webp` | Title and results illustrations (FLUX.2 klein) |
| `sfx/*.opus`, `sfx/manifest.txt` (canonical), `sfx/manifest.json`, `sfx/manifest.md` | 20 authored clips and their event bindings |
| `cover.jpg`, `coverart.png`, `icon.png` | Store cover, source art, icon |
| `score-script.js`, `server.js`, `LICENSE.md` | Platform script (range-checks a finished game's score and posts it to `high-score`), local static host (dev only, not packaged), PolyForm Noncommercial 1.0.0 |
| `tests/`, `tools/` | `npm test` (unit + engine checks), `npm run test:browser`, generators and converters (not packaged) |

## 2. Vision and design pillars

1. **The slab is the truth.** Every rule is visible on the board itself: sealed columns are plugged with frame glass, a full column's target is disabled, the winning four lift and pulse, and the ghost disc shows exactly where a drop lands. Rules in: state changes that are readable with all effects off. Rules out: HUD-only information about the board, hidden modifiers, animations that finish in a state different from the rules state.
2. **One column, one gesture.** The only in-game verb is "choose a column". Click, tap, arrow-key, number key, gamepad and screen reader all target the same seven (or nine) column widgets. Rules in: anything that keeps a drop to one deliberate input. Rules out: drag-to-drop, confirm dialogs, hover-only affordances, multi-touch.
3. **A rival you can read.** The AI never cheats and never rolls dice you cannot see: each level has a stated behaviour ("blocks threats", "searches six moves deep") and a seeded stream, so the same position gives the same reply. Rules in: difficulty from search depth and deliberate blind spots. Rules out: random strength swings, per-turn luck, adaptive rubber-banding.
4. **Puzzles teach, mastery gates.** Journey alternates open boards with "mate in one" puzzle presets that spotlight one line shape (vertical, gap, diagonal) and blocks progress only at eight labelled mastery stages. Rules in: presets validated by the engine, one new pressure (budget, clock, deeper rival) at a time. Rules out: stages that only "add more of the same", unwinnable presets, unlock currencies.
5. **Quiet glass, warm light.** Cool navy glass, amber for you, cyan for the rival, and short physical sounds (resin on plastic, wood on wood). Rules in: material sounds, restrained glow on the winning line, one hero illustration per screen. Rules out: music beds, particle bursts, camera moves, text-heavy chrome.

## 3. Player experience

**Target player.** Anyone who knows the four-in-a-row idea from childhood and wants a two-minute board with a rival that is honest about its strength; also keyboard-only and screen-reader players, who get the full game.

**First 60 seconds.** The title shows the key art, a one-line rule ("Drop a disc into a column; it falls to the lowest free cell…"), a status line reading "New player — start with Learn or Play", and one dominant Play button. Play lists five opponents with a one-line blurb each; Steady AI is the intended first pick. On the board the HUD reads "Your turn" with your amber ● chip, the objective line says "Connect 4 of your discs in a row", and hovering or focusing a column shows a translucent preview disc at the landing row. Learn's six lessons (`js/content.js` `LESSONS`) each state one instruction in the status line, restrict drops to the taught column where relevant (outlined in your colour: "the glowing column"), and finish in one to six drops. Journey stage 1 opens with "Drop discs into any column. First line of four wins."

**Session shape.** Title → pick a mode (one or two taps) → 8–20 of your drops → results sheet with headline, score breakdown and stars → Next / Play again / Back to menu. A game left or closed mid-way leaves a Resume button on the title. Mastery stages are the natural stopping points in Journey; the Daily is a single board per UTC day.

**Emotional beat.** The moment the fourth disc clicks home and the line lifts out of the glass — or the moment you see the rival's three and have one column to answer it. Everything (drop sound, ghost disc, lifted win line, warm results art) is built to make that instant land cleanly.

## 4. Core loop and rules contract (`js/rules.js`)

**Board and entities.** `createGame(cfg)` normalises the config (`normalizeCfg`): `board.cols` 4–12 (default 7), `board.rows` 4–12 (default 6), `connect` 3..max(cols, rows) (default 4), `players` 2–4 (default 2), `bannedCols` (sealed columns), `preset` (opening drops), `moveLimit`, `timeLimitSec`, `par {moves, timeSec}`, `mechanics {undo, hint}`, `theme`. State: `grid` is column-major (`grid[col*rows+row]`, row 0 is the bottom), `heights[col]`, `current` player (1 = local), monotonic `turn`, `drops` (full history incl. preset), `dropsBy[p]` (play drops only), `elapsedMs`, `terminal`, `score`, `stats.invalid`.

**Legal actions.** `legalActions(state)` returns `{type:'drop', col, row}` for every column that is not sealed and not full; an empty list once `terminal` is set.

**Commands and resolution order** (`applyCommand(state, cmd)`):
1. `validateCommandShape` — non-object, non-integer `col`/`player`, negative `elapsedMs` → `malformed-command`; unknown `type` → `unknown-command`.
2. Terminal state → `game-ended`.
3. `cmd.elapsedMs` advances `state.elapsedMs` only forwards (never rewinds).
4. `drop`: `player` (default `current`) must equal `current` → else `out-of-turn`; then `bad-column` (out of range), `banned-column`, `column-full`, checked in that order. Then `place()`: writes the cell, bumps `heights`, `turn`, `dropsBy`; emits `{t:'drop', col,row,player,turn}`; tests the four directions through the new cell (`findLine`) — a run of `connect` or more sets `terminal {reason:'line-four', winner, line}` and emits `win`; else if every non-sealed column is full → `board-full` draw; else if the dropper is player 1, `moveLimit > 0` and `dropsBy[1] >= moveLimit` → `move-limit` (winner 2 in a two-player game, 0 otherwise); else `current` rotates `(current % players) + 1`.
5. `resign` / `timeout`: `timeout` is rejected (`unknown-command`) unless `timeLimitSec > 0`. Winner is the other player in a two-player game, 0 at a three- or four-player table. Emits `{t: reason, player}`.
Every rejection increments `stats.invalid`. Presets run through the same `place()` path at creation and throw if they overflow or end the game.

**Terminal reasons.** `line-four`, `board-full`, `resigned`, `move-limit`, `time-up`. A win by any player ends the board; there is no "play on".

**Scoring** (`finalizeScore`, always from player 1's view, integers only):
- `win` = 1000 if `winner === 1`
- `parMoves` = max(0, `par.moves` − `dropsBy[1]`) × 25, only on a win and only when `par.moves > 0`
- `speed` = floor(max(0, `par.timeSec`×1000 − `elapsedMs`) / 1000) × 5, only on a win when `par.timeSec > 0`
- `draw` = 300 only for `board-full`
- total = sum; a loss, resign, time-up or move-limit scores 0.

Worked example — Journey 24 "Timed Mastery" (`par.moves` 12, `timeLimitSec` 120 so `par.timeSec` 120): you complete a line on your 9th drop at 47 s → win 1000 + parMoves (12−9)×25 = 75 + speed floor(73)×5 = 365 → **1440**. Stars (`starsFor`): 0 unless player 1 won; 1 when the stage has no par; 3 if `dropsBy[1] ≤ max(1, floor(par×0.7))` (= 8 here), 2 if ≤ par, else 1 → **2 stars** for that example.

**Tie-breaks.** None exist in the game; a draw is a draw. The platform `high-score` board (section 12) orders by score only.

**RNG and seeding** (`js/rng.js`). One 32-bit master seed per game; `streams(seed)` derives `rules`, `decor`, `av`, `ai` streams by XOR with fixed tags. The rules stream is created and stored (`rngState`) but the drop rules use no randomness. The AI stream (`native/app.ts` `session.rng`) breaks ties among equally scored columns and drives the Casual level's lapses. Seeds: Journey and challenge seeds are authored constants; Daily seed = FNV-1a of `fourfold-daily-YYYY-MM-DD`; practice boards take a fresh `Math.random()` seed per board (Restart re-rolls it).

**Undo and hints** (`native/app.ts`). `undo()` pops serialized snapshots (cap 80) until it reaches a position where player 1 is to move or 4 steps, whichever first; disabled when `mechanics.undo` is false, while the AI is thinking, or with no history. `hint()` runs `FFAI.suggestMove` (six-ply search; win/block heuristic at 3+ players) on the AI worker and outlines the column in your colour and in its accessible name until the next drop.

**Serialization and replay.** `serialize`/`deserialize` (re-normalises `cfg`, rejects newer `v`), `hashState` (FNV-1a over a stable-stringified subset), `replay(cfg, log)` (skips duplicate command `id`s, throws on any illegal command). The saved game (`store.save`) is exactly `{key, seed, drops after preset, elapsedMs}` and is rebuilt through `applyCommand`.

## 5. Modes and progression (`js/content.js`, `native/app.ts`)

| Mode | Entry | Content | Assists | Progress recorded |
|---|---|---|---|---|
| Play (practice) | Title → Play | Casual, Steady, Sharp, Master AI; Two players (local) | Undo + hint | `stats` only; random seed |
| Journey | Title → Journey | 42 authored 7x6 stages | Undo + hint | best stars per stage; mastery gating |
| Daily board | Title → Daily board | one config per UTC date | none | `daily[date] = {score, won}` (overwritten on replay) |
| Challenges | Title → Challenges | 7 authored rule variants | per challenge | best winning score per challenge |
| Learn | Title → Learn | 6 lessons | Undo + hint | `lessons[id] = true` |

**AI levels** (`js/ai.js` `LEVELS`): Casual — takes an immediate win 55 % of the time, blocks 50 %, otherwise random; Steady — always wins/blocks, otherwise avoids columns that hand over an immediate win; Sharp — negamax depth 6 with a window heuristic (centre bias, +80 open three, −90 opponent three); Master — depth 8. At three or four players every AI plays win → block anyone → random. The AI answers once its search (run on a worker, `native/ai.ts`) is back and 420 ms of game time have passed (120 ms with reduced motion); natively the Master's search can take a few seconds, during which the HUD reads "Rival is thinking…" and the board keeps drawing.

**Journey curve.** Stages 1–5 Casual, 6–15 Steady, 16–32 Sharp, 33–42 Master. Sixteen `mate1` puzzle stages (4, 5, 8, 9, 11, 14, 15, 17, 20, 22, 27, 29, 32, 34, 35, 38) start from a preset where you have a win in one and set par 2–4 drops. Pressure is added one at a time: drop budgets (12: 16 drops; 31 and 37: 12; 30, 40: 14; 42: 12), clocks (24: 120 s; 30: 90 s; 39: 150 s; 40: 120 s; 42: 90 s). The eight mastery stages — 6, 12, 18, 24, 30, 36, 40, 42 — are outlined in amber and lock every later stage until won (`buildJourney`). Theme changes with the stage (`themeIdx`). A win shows "Next: <stage>" on the results sheet.

**Daily.** `dailyConfig(date)`: rival level rotates Casual → Steady → Sharp by day number, an opening of 0–2 legal drop pairs is generated from the seeded stream, par 12 drops, no undo, no hint, theme rotates through all five. The date is the UTC date by the platform's clock (`serverNow()`, the device's clock until the platform has answered or offline); replaying the same day is allowed and announced ("Replaying for practice").

**Challenges.** Blitz Ninety (90 s clock, Steady, no assists), Twelve Drops (budget 12, no undo), Off-Center (column 4 sealed), High Rise (7x8, Sharp), Pentafold (9x7, connect five, Sharp), Threefold Table (three players, two Steady rivals, no undo), Grandmaster Row (Master, no assists).

**Achievements** (local flags only): first-line, journey-mastery (all mastery stages starred), streak-3, challenge-set (four challenges with a best score), centurion (100 games). Streak resets on any loss to an AI.

**Themes** (cosmetic; picked by stage/challenge/day): Glacier Hall, Ember Vault, Verdant Atrium, Violet Observatory, Ivory Gallery.


## 6. Controls and interaction

Actions (`starhermit.txt`; players rebind keys and pads in the runtime's Options › Controls):

| Action | Keys | Gamepad | Pointer / touch | Feedback |
|---|---|---|---|---|
| Drop in a column | click or tap a column; Enter / Space on a focused column; `col1`–`col9`: 1–9 (and numpad) | South on a focused column | click / tap the column (the whole board region's height) | ghost disc + column tint on hover/focus; drop animation; `drop` sound |
| Move between columns | `col_left` / `col_right`: ← → (from nothing focused they pick the next open column; with a column focused the UI moves focus) | D-pad / left stick | — | focus ring, ghost disc follows |
| Undo | `undo`: U, or the tray | North | Undo button | `undo` sound, status "Undid n drops." |
| Hint | `hint`: H, or the tray | West | Hint button | `hint` sound, column outlined, status "Hint: column n." |
| Restart | `restart`: R, or the tray | Select | Restart button | board clears; practice re-rolls the seed |
| Pause | `pause`: P, `back`: Esc, the tray; the window hiding (suspend) | Start, East | Pause button | pause sheet; clock stops |
| Resume / back | Esc closes the pause sheet; on a menu screen Esc goes back (Settings opened from Pause returns to it) | East | Resume / Back | — |
| Any menu, header or sheet button | Tab / arrows + Enter | D-pad + South | click / tap | `menu-tap` sound |

F1 always opens the runtime's own Options menu (graphics, audio, language, controls, accessibility, account). The browser build's action names `colLeft`/`colRight` were not lower-case, so key choices saved by the old build for those two start from the defaults.

**Locking rules** (`humanDrop`): input is ignored while paused, with a sheet open or after the terminal state; while the AI is thinking a drop plays `out-of-turn` and the column targets are disabled. Lessons with `onlyCols` reject other columns with `bad-column` and a status line explaining which column is wanted. Full, sealed, not-your-turn and decided columns are disabled widgets, so neither pointer, keyboard nor pad can fire them; a number key on a full column still reaches the engine and returns `column-full`.

## 7. Screens and UI flow (`native/screens.ts`, `native/app.ts`)

```
title ─┬─ practice ─┐
       ├─ journey ──┤
       ├─ challenges┼─→ play ⇄ pause sheet ─→ (resign) ─┐
       ├─ learn ────┤        └────────── terminal ──────┴→ results sheet ─→ title | play (retry/next)
       ├─ daily ────┘
       ├─ settings (also from pause, returning to it)
       └─ help
```
One screen shows at a time under the header bar (`▮ FOURFOLD` wordmark, the signed-in player's name, `?` Help and `⚙` Settings). The pause and results sheets are modal dialogs over the board (460 logical px wide at most); a sheet focuses its first button. Leaving the board (Leave to menu, results → menu, the window closing or hiding) keeps the unfinished game's save.

**Layout.** Screens centre a column of at most 840 logical px (the board's 720) with 16 px padding (12 under 560 px wide); menu screens scroll. The title shows the key art (hidden under 560 px tall), the heading, the one-line rule, the stats line, Resume (when a game is saved), Play, the four mode cards in a grid (one column on phones), and Sign in with StarHermit (a guest) or Invite a friend (signed in). The play screen is HUD (turn chip and label, time, drops, par; the objective line under them; the meta wraps under the turn on phones) → board region (grows to the room left) → status line → tray (Undo, Hint, Restart, Pause; two rows of two on phones). On short landscape windows (≤ 500 px tall) the board region takes the start and the HUD, status line and a 2×2 tray of tighter buttons sit in a column beside it, so nothing scrolls. The results sheet scrolls inside 88 % of a window under 560 px tall. The runtime's interface size and text size scale everything; widths are measured with `ui.measureText`.

**Never cut off:** the turn label, the column targets (one cell wide and the rows' height), the four tray buttons, the results headline and its buttons (checked in browser screenshots at 1366×768, 390×844 @3× and 844×390 @3×).

## 8. Art direction

**Palette** (`tools/ui-style.css` tokens): background `#0e1424`, panel `#161e33`, raised panel `#1e2842`, line `#2c3a5e`, ink `#e8ecf5`, dim ink `#a4b0c8`, accent `#7fb0ff` on `#06101f`, good `#7fe08a`, bad `#ff8a8a`, well `#0a0f1e`. Players (`content.js` `PLAYERS`): You amber `#ffb54d` ●, Rival cyan `#4dc9ff` ◆, Third green `#7fe08a` ▲, Fourth violet `#d98cff` ■. With the runtime's high contrast the discs, chips and ghost take `#ffd60a`, `#2e6fe4`, `#17a398`, `#8e24aa` and the UI takes the runtime's forced colours. Theme palettes (bg / frame / light / accent): Glacier `#0e1424 / #5f7fc9 / #bfd8ff / #7fb0ff`; Ember `#1d1310 / #c97a4a / #ffd9a8 / #ffb066`; Verdant `#101a14 / #5aa86e / #d8ffb0 / #9fe080`; Violet `#171226 / #8a6fd0 / #d8c8ff / #b48cff`; Ivory `#3a3630 / #b09a78 / #fff2dd / #ffd9a0`.

**Hero.** The slab: a translucent frame (standard material, opacity 0.55, roughness 0.25) with instanced socket rings and dark recesses, seen straight on by an orthographic camera framed so the board fits the board region (the region shows the theme's background, the page around it the page colour), lit by one directional key from upper-left tinted by the theme's `light` colour plus a hemisphere fill (three.js r160 intensities ÷ π), ACES tone mapping at exposure 1.1. Discs are cylinders (r 0.40, h 0.22) with a relief marker matching the player's glyph (ring, octahedron, three-sided cone, box) so ownership survives colour blindness. Sealed columns are plugged in frame glass. That is the **Plain** board (Low); the **Detailed** board (Balanced and up) adds a perforated, bevelled front plate of frosted glass (`ExtrudeGeometry` with a hole per cell, clear-coated physical material with a value-noise bump on High/Ultra) in front of the discs, chip-profiled discs (lathe: raised rim, recessed face, rounded edge), shadow catchers for the plate rims in each recess and the board's drop shadow on the wall behind, and a faint pool of the theme's light behind the board fading to nothing at the region's edge.

**Graphics.** The runtime's graphics level (Options › Graphics: Auto or one of ten levels) gives the tier (`frame().quality`), and each tier is one of the browser build's presets (`native/quality.ts`). The backdrop is cleared with the linear colour that the tone mapping and the grade map back onto the theme's background, so the board region reads as the page colour does (the runtime tone-maps the background with the scene, as the old post chain did).

| Tier | Shadows | AO | Bloom | Grade | AA | Reflections | Detail | Particles |
|---|---|---|---|---|---|---|---|---|
| Low | off | off | off | off | MSAA | off | plain | off |
| Balanced | 512 | off | on | on | FXAA | on | detailed | low (60) |
| High | 1024 | on | on | on | SMAA | on | detailed | high (160) |
| Ultra | 2048 | high | on | on | MSAA | on | detailed | high |

| Tier | Discs, frame, sockets, markers | Detailed chips and plate | Round-geometry LOD | Plate bump texture | Sparks (× puffs and sparkles) | Bloom / GTAO resolution |
|---|---|---|---|---|---|---|
| Low | Lambert | Lambert | ½ | 64 px | 0.5× | ½ / ½ |
| Balanced | Standard | Standard | ¾ | 128 px | 0.75× | ½ / ½ |
| High | Standard | clearcoated Physical | 1 | 128 px | 1× | ½ / ½ |
| Ultra | Standard | clearcoated Physical | 1.5 | 256 px | 1.5× | full / full |

Sparks grow within a tier by the level (≤ 2×). Post effects are the runtime's: GTAO contact darkening, bloom (threshold 2.1 in linear units, so only the emissive winning line, sparkles and glints bloom), the display-space grade (the old S-curve's slope, +10 % saturation, cool shadows / warm highlights), FXAA / SMAA / MSAA. Reflections are a filtered `RoomEnvironment` (`envMapIntensity` 0.3 discs, 0.35 plate, hemisphere fill lowered to compensate). Render scale, pixel-ratio cap, adaptive resolution, the frame-rate limit and readout, and the shadow map ceiling are the runtime's options. Gameplay is identical on every tier.

**Shape language.** Rounded slab, circular sockets, 12 px radii on UI, 16 px on sheets; thin 1 px line borders.

**Typography.** System UI faces; the wordmark uppercase with wide tracking; headings 25 px; the runtime's text size enlarges everything.

**Motion.** Drops fall under a 26 u/s² gravity integrator from one cell above the slab and stop exactly on the rules cell, with a small puff in the disc's colour where it lands; the winning line lifts (z 0.16, 0.3 on the Detailed board) and pulses (scale 1.1 ± 0.05) with sparkles rising from it; the column hover is a 0.18-alpha tint bar with a half-transparent preview disc at the landing row, and the hovered column target gets a 2 px accent border. On the Detailed board the key light drifts slowly and the winning discs' glow pulses. With reduced motion (the runtime's option): no fall, no pulse, no drift, no particles, AI pause 120 ms.

## 9. Audio direction (`native/audio.ts`)

There is no music and no ambience by design: the game is a quiet table. Every cue plays a 48 kHz mono Opus clip, loudness-normalised to −20 LUFS, on the runtime's mixer — effects on the "effects" bus, the menu tap on "interface" (volumes and mute are Options › Audio). Clips load one at a time once the mixer runs (natively at once, in a browser after the first press); until a clip has loaded its cue is silent. `drop` picks one of three variants (unseeded; cosmetic).

| Event id | File | Sound | Used when |
|---|---|---|---|
| drop | disc-drop-a/b/c.opus | wooden/resin disc down a slot, one clack | every landed disc |
| win | line-win.opus | four ascending metal bars | any player completes a line |
| draw | board-draw.opus | two wooden knocks | board full |
| move-limit | move-limit-bell.opus | desk bell then wooden tok | drop budget spent |
| resigned | resign-fold.opus | mat folding, descending piano note | Pause → Resign |
| time-up | time-up-tick.opus | timer ticks then spring buzz | clock hits zero |
| column-full | column-full-thud.opus | rubbery thud | a number key on a full column |
| bad-column | bad-column-knock.opus | hollow knock | off-board column; lesson rejects a column |
| banned-column | banned-column-rattle.opus | gate rattle | sealed column (Off-Center), by number key |
| out-of-turn | out-of-turn-tap.opus | two fingertip taps | input while the AI thinks |
| game-ended | game-ended-dull.opus | muted drum | command after the end |
| unknown-command | unknown-command-buzz.opus | low buzzer | engine-only (not reachable from UI) |
| malformed-command | malformed-command-click.opus | switch click + snap | engine-only |
| hint | hint-chime.opus | glass bell with shimmer | hint shown |
| undo | undo-rewind.opus | disc sliding back up, click | undo applied |
| lesson-complete | lesson-complete.opus | two marimba notes, tap | drop-any / stack lesson goal met |
| clock-warning | clock-warning.opus | metronome tick | once at 10 s left on a timed board |
| menu-tap | menu-tap.opus | fingertip on frosted glass | any menu, header or sheet button |

Every cue has a visible counterpart (status line, HUD, results headline); nothing is audio-only.

## 10. Localization

Every player-facing string ships in nine locales: **en-US, en-GB, es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR, it-IT**.

- **Tables.** English source strings are the keys. `js/i18n/strings.js` (UI) and `js/i18n/strings-content.js` (player names, lessons, the 42 journey stage names and intros, practice opponents, challenges) hold rows of [English, es-419, de-DE, fr-FR, pt-BR, it-IT]; en-GB, es-ES and fr-CA list only their differences and otherwise fall back to en-US, es-419 and fr-FR. The account strings (sign-in, invite, confirmations, sign-out notice, leaderboard line) are `js/platform-i18n.js`'s. "Fourfold", "StarHermit" and key names stay as they are.
- **Language.** The runtime's interface language (`preferences().language`: the player's choice in Options › Language, else the device's) picks the nearest shipped locale (`es-MX → es-419`, `en-AU → en-GB`, `fr → fr-FR`, `pt-PT → pt-BR`, others → en-US) through `js/i18n/core.js`; a change shows on the next frame (the UI is immediate mode) and a game in progress keeps its drops. The browser build's own Language selector, its `?lang=` override and the account's preferred-language lookup are the runtime's now.

## 11. Accessibility

- **Keyboard and gamepad:** every screen is reachable with Tab / arrows / D-pad and Enter / South; the board's columns are UI widgets in order, ← → (or the D-pad) move among them, 1–9, U, H, R, P, Esc work on the board.
- **Focus:** a 3 px accent ring (inset on column targets).
- **Screen readers:** the runtime's accessibility tree: each column is a button named "Column n, h of rows filled, drops into row r" (or "full"/"sealed", plus "(hint)"); the board region carries the whole board as text ("Row 6: empty, You, Rival…"); turn changes, rejections, undo counts, hints and the result headline with score are announced (`ui.announce`).
- **Colour independence:** each player has a glyph in the HUD chip and a relief marker on the 3D disc; the winning line also lifts.
- **High contrast, reduced motion, interface and text size:** the runtime's options (F1 › Accessibility); the game follows them (forced UI colours and the high-contrast disc palette; no falling, pulse, drift or particles; everything scales).
- **Targets:** buttons are ≥ 44 logical px tall; column targets are one cell wide and the rows' height.

## 12. StarHermit integration

| Platform feature | Used? | Notes |
|---|---|---|
| Launch manifest / cover | Yes | `starhermit.txt` as in section 1 |
| Identity | Yes | `player()`: the header shows the signed-in player's `displayName`; guests play the same game. Sign-in and sign-out are the runtime's (Account in Options); a guest's **Sign in with StarHermit** on the title calls `requestSignIn()`; a session the platform ended shows a notice on the title |
| Invite link | Yes (signed in) | **Invite a friend** on the title copies `inviteLink()` to the clipboard, confirmed under the menu |
| Cloud save | Yes | The progress document is the game's save (`saves`, schema 1) on the device and in the cloud slot; another device's copy is merged in (`onConflict`, `onStatus`: `mergeStores` — the higher stars per stage and best per challenge, the union of lessons, achievements and dailies with the higher score per date, the larger play/win/best-streak counts, this device's settings, current streak and game in progress). The browser build's slot (the JS SDK's `saveJSON` of the same document under `game:<slug>`) shows as foreign, is merged in and replaced once (`replaceForeign`); Settings › Data shows the sync state |
| Settings | Migrated | The browser build's account settings (`volume`, `muted`, `reducedMotion`, `highContrast`, `largeText`, `ui.language`, `audio.options`) are the runtime's Options now and are removed from the account once read; the game keeps no settings of its own |
| Controls | Yes | `control.*` / `engine.gamepad.*` actions, rebound in the runtime's Options |
| Leaderboards | Yes (signed in) | every finished game against the AI (practice, journey, daily, challenge; not pass-and-play or lessons) opens a practice session whose socket carries `{type: 'result', scores: {'high-score': n}}`; `score-script.js` range-checks it (integer, 0–10,000) and posts it, and the results sheet shows "Leaderboard rank: #N" (or "Score posted…" / "Score not posted…"). Results come only from the server script (user decision 2026-10-27); local bests stay in the save |
| Achievements | Local | five flags in the save; no platform unlock path |
| Platform time | Yes | the Daily board's UTC date (`serverNow()`, the device clock as fallback) |
| Sessions, invitations, matchmaking, chat, rooms | No | Two-player mode is pass-and-play on one device (not recorded); `score-script.js` only accepts leaderboard results |

## 13. Technical architecture

- **Boundaries.** `js/rules.js`, `js/content.js`, `js/ai.js`, `js/rng.js` and `js/store.js` are UMD classic scripts with no host access, loaded with `loadClassic` (and by node tests unchanged); `native/app.ts` is the only caller of `applyCommand` and the only writer of the save; `native/render.ts` only receives snapshots (`sync(state)`) and drop events (`dropAnim(col, row)`); the screens read the app's state each frame.
- **Determinism.** A finished game is fully described by `(cfg, drops)`; `replay` reproduces `hashState`. AI moves are a pure function of `(state, level, rng stream)`: the worker gets the stream's state with the position and returns the stream's state after the search, which the session adopts only when it plays the answer (`tests/store.test.mjs` checks the worker against the main-thread search).
- **Clock.** The game clock advances in 60 Hz fixed steps: a board's elapsed time runs while the board shows, unpaused, undecided and with no sheet open, and stops while the window is suspended; the time limit is checked every step. The AI's thinking pause runs on the same clock, so checks are deterministic.
- **Persistence.** The document `{v, settings, journey, challenges, lessons, daily, stats, achievements, save}` is loaded with a forward merge onto defaults (`js/store.js`), so a partial or older document never crashes start-up; another `v` resets it. The resumable game is `{key, seed, drops after preset, elapsedMs}`, rebuilt through `applyCommand`, saved after every drop, on pause, suspend and quit. "Erase progress" (Settings › Data, confirmed inline) resets it on the device and in the cloud.
- **Performance.** One draw per disc plus a few fixed and instanced meshes (under 60 on a full 7×6 board); the deep searches never run on the game's thread (the Master's eight-ply search takes up to a few seconds natively, ~0.2 s in browsers).

## 14. Testing and acceptance criteria

`npm test` runs:
- **Unit** (`node --test`): `tests/rules.test.mjs` (lowest-free-cell placement and turn passing; `legalActions`; every `INVALID` reason; line detection and the 1000-point win; the scoring worked example; a 4×4 draw scoring 300; move-limit terminal; resign/timeout winners incl. three players; preset validation; replay hash equality and serialize round-trip; RNG determinism; AI determinism and forced blocks; content validation), `tests/store.test.mjs` (forward merge, the old cloud text, `mergeStores`, the AI worker's parity), `tests/i18n.test.mjs` (every key used in `native/*.ts` and the content in all nine locales with intact placeholders, no unused rows, the lookup and the account strings).
- **Engine** (`tests/native.mjs`): the web index matches the files (`npm run package` ran after the last change), `tsc` (TypeScript 5.9, the engine's declarations, no `skipLibCheck`), `starhermit check .` with no warnings, and every `tests/native/*.play` as a signed-out render check driving the real UI: `practice.play` (Play → Steady AI, drops by key and click, Hint, Undo, the pause sheet), `journey.play` (generated by `tools/gen-plays.mjs` from the rules: stage 1 won to the results sheet, its stars, score and Next), `menus.play` (Journey's locked stages, Pentafold's nine columns and Resume, the Make four lesson rejecting a column then completing, the Daily board, Settings' erase confirmation, Help), `master.play` (Grandmaster Row's eight-ply answers and Threefold Table's two rivals on the worker).
- **Browser** (`npm run test:browser`, `tools/browser-play.mjs`): the packaged loader in headed Chrome on the AMD GPU (`~/games/tools/gpu-chrome.mjs`) at 1366×768, 390×844 @3× and 844×390 @3×: the title, Play by Tab + Enter, Steady AI, drops by number key, tap and arrows + Enter, a hint, the pause sheet, Resign to the results sheet; any console error or warning or the runtime's error screen fails it. `~/games/tools/engine-web-smoke.mjs` checks the start at desktop and phone.

**QA bar:** a new player sees a one-line rule and a Learn entry on the title, and every lesson states its instruction before the first drop; every mode in section 5 is reachable by visible buttons; screenshots show the title, board and results uncropped on all three browser views.

## 15. Asset inventory

| Path | Purpose | Source |
|---|---|---|
| `assets/key-art.webp` (1280×720) | Title hero image | FLUX.2 klein, seed 7701 |
| `assets/results-win.webp` (1024×576) | Results sheet on a win / lesson complete | FLUX.2 klein, seed 7702 |
| `assets/results-lose.webp` (1024×576) | Results sheet on a loss / resign / time-up / budget | FLUX.2 klein, seed 7703 |
| `cover.jpg`, `coverart.png`, `icon.png` | Store cover, source art, icon | key art + title text; authored |
| `sfx/*.opus` (20 clips), `sfx/manifest.*` | Cues (section 9) | MOSS-SFX v2 |
| `assets/ui-style.json` | UI styles | `starhermit css tools/ui-style.css` |

No 3D model is used: discs and slab are procedural so themes can recolour them.

## 16. Known limitations

- `score-script.js` only range-checks posted scores (the client's total); nothing about a game is authoritative or shared. Two-player play is same-device only and not recorded.
- Achievements are stored but no screen lists them; the only visible progress is the title stats line, journey stars and challenge bests.
- `THEMES[].unlockStars` is never read: themes are assigned by content, not unlocked.
- The Daily overwrites the day's record on replay (no "first attempt counts").
- The `win` cue plays for the rival's line too; only the headline colour distinguishes it.
- `unknown-command` and `malformed-command` are engine-only cues.
- Practice seeds come from `Math.random()`, so a practice game cannot be re-created from its results, only resumed from its save.
- `drop` variant choice is unseeded (cosmetic only).
- A cue whose clip is still loading is silent (the browser build played a synthesized stand-in; a live synthesis graph is not ported to the web runtime).
- Natively the Master's search can take a few seconds per reply (it runs on a worker, so the board keeps drawing).
- Guests' old browser localStorage progress (`fourfold.v1` in the old page's origin) cannot migrate; signed-in players' cloud saves do. The old per-effect graphics overrides and the volume value are not carried over (the runtime's Options own them).
- The board region's corners are square (the old canvas had 12 px rounded corners).
- A pre-existing content bug (the `mate1` flag matched the mastery test via substring) was fixed earlier by whole-word matching; stars already earned are unaffected.

## 17. Design intent not yet implemented

- Surface the five achievements in a screen (they already sync inside the save).
- Keep only the first daily attempt as the record.
- Give the rival's win its own, cooler cue.
- Hosted two-player sessions through room-bound sessions refereed by a server script.
