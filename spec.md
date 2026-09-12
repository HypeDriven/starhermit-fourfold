# Fourfold — Game Design Document (running spec)

**Status:** running specification. Present tense; describes the shipped browser build. Design intent that the code does not yet implement is collected in the final section only.

## 1. Overview

**Pitch.** Drop glossy resin discs into a translucent glass slab and be the first to line up four — across, up, or on a diagonal — against a deterministic rival that ranges from "misses half its wins" to an eight-ply search.

| | |
|---|---|
| Genre | Turn-based alignment / connection game |
| Players | 1 vs AI (four levels), 2 local pass-and-play, one 3-player table vs two AIs |
| Session | 1–4 minutes per board; Journey stages chain with a Next button |
| Platforms | Desktop and mobile browsers, portrait and landscape; no install; a StarHermit account is used only when the game is launched with a platform token |
| Rendering | Three.js orthographic scene on a `<canvas>` with a same-interface 2D-canvas fallback; every control is semantic HTML laid over or beside it |
| Persistence | `localStorage` key `fourfold.v1` (settings, progress, one resumable save); mirrored to the StarHermit cloud save when launched with a token |
| Server | `server.js` static host + `/api/health`; no authoritative play |

File map (everything the browser or tests load):

| Path | Responsibility |
|---|---|
| `index.html` | Single page: header, eight `<section class="screen">`s, pause and results overlays, module boot |
| `css/app.css` | Tokens, layout, buttons, board overlay, sheets, reduced-motion and high-contrast rules |
| `js/rng.js` | mulberry32 PRNG, FNV-1a string hash, four named streams per master seed |
| `js/rules.js` | Pure rules engine: `createGame`, `legalActions`, `applyCommand`, scoring, stars, serialize/replay/hash |
| `js/content.js` | Player identities, 5 themes, 6 lessons, 42 journey stages, 5 practice presets, 7 challenges, daily generator, achievements, offline validator |
| `js/ai.js` | Four AI levels and the hint search; deterministic per (state, level, seed) |
| `js/sfx.js` | WebAudio sample player with per-event synth fallback (`FFSfx`) |
| `js/platform.js` | StarHermit adapter (`FFPlatform`): launch-token read/strip + 45-min refresh, profile nickname, cloud mirror of the progress doc (stored zip), sync status; inert without a token |
| `js/ui.js` | Screens, input, HUD, clock, AI scheduler, persistence, results, a11y mirror (`FFUI`) |
| `js/view3d.js` | Board presentation: Three.js view and 2D fallback behind one interface |
| `vendor/three.module.min.js` | Three.js (ES module), the only third-party runtime code |
| `assets/key-art.webp`, `assets/results-win.webp`, `assets/results-lose.webp` | Title and results illustrations (FLUX.2 klein) |
| `sfx/*.opus`, `sfx/manifest.txt` (canonical), `sfx/manifest.json`, `sfx/manifest.md` | 20 authored clips and their event bindings |
| `coverart.png`, `icon.png`, `favicon.svg` | Store cover (1200x675), 256 px icon, tab icon |
| `starhermit.txt`, `server.js`, `LICENSE.md` | Platform manifest, local host, PolyForm Noncommercial 1.0.0 |
| `tests/rules.test.mjs`, `tests/e2e.mjs` | `npm test` (node --test) and the Playwright UI playthrough |

## 2. Vision and design pillars

1. **The slab is the truth.** Every rule is visible on the board itself: sealed columns are plugged with frame glass, a full column's button is disabled, the winning four lift and pulse, and the ghost disc shows exactly where a drop lands. Rules in: state changes that are readable with all effects off. Rules out: HUD-only information about the board, hidden modifiers, animations that finish in a state different from the rules state.
2. **One column, one gesture.** The only in-game verb is "choose a column". Click, tap, arrow-key, number key and screen reader all target the same seven (or nine) real `<button>`s. Rules in: anything that keeps a drop to one deliberate input. Rules out: drag-to-drop, confirm dialogs, hover-only affordances, multi-touch.
3. **A rival you can read.** The AI never cheats and never rolls dice you cannot see: each level has a stated behaviour ("blocks threats", "searches six moves deep") and a seeded stream, so the same position gives the same reply. Rules in: difficulty from search depth and deliberate blind spots. Rules out: random strength swings, per-turn luck, adaptive rubber-banding.
4. **Puzzles teach, mastery gates.** Journey alternates open boards with "mate in one" puzzle presets that spotlight one line shape (vertical, gap, diagonal) and blocks progress only at eight labelled mastery stages. Rules in: presets validated by the engine, one new pressure (budget, clock, deeper rival) at a time. Rules out: stages that only "add more of the same", unwinnable presets, unlock currencies.
5. **Quiet glass, warm light.** Cool navy glass, amber for you, cyan for the rival, and short physical sounds (resin on plastic, wood on wood). Rules in: material sounds, restrained glow on the winning line, one hero illustration per screen. Rules out: music beds, particle bursts, camera moves, text-heavy chrome.

## 3. Player experience

**Target player.** Anyone who knows the four-in-a-row idea from childhood and wants a two-minute board with a rival that is honest about its strength; also keyboard-only and screen-reader players, who get the full game.

**First 60 seconds.** The title shows the key art, a one-line rule ("Drop a disc into a column; it falls to the lowest free cell…"), a status line reading "New player — start with Learn or Play", and one dominant Play button. Play lists five opponents with a one-line blurb each; Steady AI is the intended first pick. On the board the HUD reads "Your turn" with your amber ● chip, the objective line says "Connect 4 of your discs in a row", and hovering or focusing a column shows a translucent preview disc at the landing row. Learn's six lessons (`js/content.js` `LESSONS`) each state one instruction in the status line, restrict drops to the taught column where relevant, and finish in one to six drops. Journey stage 1 opens with "Drop discs into any column. First line of four wins."

**Session shape.** Title → pick a mode (one or two taps) → 8–20 of your drops → results sheet with headline, score breakdown and stars → Next / Play again / Back to menu. A closed tab mid-game leaves a Resume button on the title. Mastery stages are the natural stopping points in Journey; the Daily is a single board per UTC day.

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

**Tie-breaks.** None exist: there is no ranking or leaderboard; a draw is a draw.

**RNG and seeding** (`js/rng.js`). One 32-bit master seed per game; `streams(seed)` derives `rules`, `decor`, `av`, `ai` streams by XOR with fixed tags. The rules stream is created and stored (`rngState`) but the drop rules use no randomness. The AI stream (`ui.js` `session.rng`) breaks ties among equally scored columns and drives the Casual level's lapses. Seeds: Journey and challenge seeds are authored constants; Daily seed = FNV-1a of `fourfold-daily-YYYY-MM-DD`; practice boards take a fresh `Math.random()` seed per board (Restart re-rolls it).

**Undo and hints** (`js/ui.js`). `undo()` pops serialized snapshots (cap 80) until it reaches a position where player 1 is to move or 4 steps, whichever first; disabled when `mechanics.undo` is false, while the AI is thinking, or with no history. `hint()` runs `FFAI.suggestMove` (six-ply search; win/block heuristic at 3+ players) and outlines the column in your colour and in its `aria-label` until the next drop.

**Serialization and replay.** `serialize`/`deserialize` (re-normalises `cfg`, rejects newer `v`), `hashState` (FNV-1a over a stable-stringified subset), `replay(cfg, log)` (skips duplicate command `id`s, throws on any illegal command). The saved game (`store.save`) is exactly `{key, seed, drops after preset, elapsedMs}` and is rebuilt through `applyCommand`.

## 5. Modes and progression (`js/content.js`, `js/ui.js`)

| Mode | Entry | Content | Assists | Progress recorded |
|---|---|---|---|---|
| Play (practice) | Title → Play | Casual, Steady, Sharp, Master AI; Two players (local) | Undo + hint | `stats` only; random seed |
| Journey | Title → Journey | 42 authored 7x6 stages | Undo + hint | best stars per stage; mastery gating |
| Daily board | Title → Daily board | one config per UTC date | none | `daily[date] = {score, won}` (overwritten on replay) |
| Challenges | Title → Challenges | 7 authored rule variants | per challenge | best winning score per challenge |
| Learn | Title → Learn | 6 lessons | Undo + hint | `lessons[id] = true` |

**AI levels** (`js/ai.js` `LEVELS`): Casual — takes an immediate win 55 % of the time, blocks 50 %, otherwise random; Steady — always wins/blocks, otherwise avoids columns that hand over an immediate win; Sharp — negamax depth 6 with a window heuristic (centre bias, +80 open three, −90 opponent three); Master — depth 8. At three or four players every AI plays win → block anyone → random. The AI answers after 420 ms (120 ms with reduced motion).

**Journey curve.** Stages 1–5 Casual, 6–15 Steady, 16–32 Sharp, 33–42 Master. Sixteen `mate1` puzzle stages (4, 5, 8, 9, 11, 14, 15, 17, 20, 22, 27, 29, 32, 34, 35, 38) start from a preset where you have a win in one and set par 2–4 drops. Pressure is added one at a time: drop budgets (12: 16 drops; 31 and 37: 12; 30, 40: 14; 42: 12), clocks (24: 120 s; 30: 90 s; 39: 150 s; 40: 120 s; 42: 90 s). The eight mastery stages — 6, 12, 18, 24, 30, 36, 40, 42 — are outlined in amber and lock every later stage until won (`buildJourney`). Theme changes with the stage (`themeIdx`). A win shows "Next: <stage>" on the results sheet.

**Daily.** `dailyConfig(date)`: rival level rotates Casual → Steady → Sharp by day number, an opening of 0–2 legal drop pairs is generated from the seeded stream, par 12 drops, no undo, no hint, theme rotates through all five. The date is the client's UTC date; replaying the same day is allowed and announced ("Replaying for practice").

**Challenges.** Blitz Ninety (90 s clock, Steady, no assists), Twelve Drops (budget 12, no undo), Off-Center (column 4 sealed), High Rise (7x8, Sharp), Pentafold (9x7, connect five, Sharp), Threefold Table (three players, two Steady rivals, no undo), Grandmaster Row (Master, no assists).

**Achievements** (local flags only): first-line, journey-mastery (all mastery stages starred), streak-3, challenge-set (four challenges with a best score), centurion (100 games). Streak resets on any loss to an AI.

**Themes** (cosmetic; picked by stage/challenge/day): Glacier Hall, Ember Vault, Verdant Atrium, Violet Observatory, Ivory Gallery.

## 6. Controls and interaction

| Input | Desktop | Mobile | Feedback |
|---|---|---|---|
| Choose column | click a column overlay button or the canvas | tap | ghost disc + column tint on hover/focus; drop animation; `drop` sound |
| Move focus between columns | ← → (skips disabled columns, wraps) | — | focus ring, ghost disc follows |
| Drop focused column | Enter / Space | — | as above |
| Drop by number | 1–9 | — | as above |
| Undo | U or Undo button | Undo button | `undo` sound, status "Undid n drops." |
| Hint | H or Hint button | Hint button | `hint` sound, column outlined, status "Hint: column n." |
| Restart | R or Restart button | Restart button | board clears; practice re-rolls the seed |
| Pause | P, Esc or Pause button; tab hidden | Pause button; tab hidden | pause sheet; clock stops |
| Resume | Esc / Resume | Resume | clock resumes; AI resumes if it is its turn |
| Back to title from a menu | Esc or Back | Back | — |
| Any menu / sheet button | click | tap | `menu-tap` sound |

**Locking rules** (`humanDrop`): input is ignored while paused or after the terminal state; while the AI is thinking a drop plays `out-of-turn` and column buttons are disabled. Lessons with `onlyCols` reject other columns with `bad-column` and a status line explaining which column is wanted. Disabled columns (full, sealed, not your turn, game over) are `disabled` buttons, so neither pointer nor keyboard can fire them; a canvas click on a full column still reaches the engine and returns `column-full`.

## 7. Screens and UI flow (`js/ui.js` `showScreen`, overlays)

```
title ─┬─ practice ─┐
       ├─ journey ──┤
       ├─ challenges┼─→ play ⇄ pause-overlay ─→ (resign) ─┐
       ├─ learn ────┤        └──────────── terminal ──────┴→ results-overlay ─→ title | play (retry/next)
       ├─ daily ────┘
       ├─ settings (also from pause)
       └─ help
```
Exactly one `.screen` is active; overlays are `position: fixed` sheets over the play screen. Leaving the play screen (`pause-leave`, results → menu) persists the save if the game is unfinished. Moving to any screen focuses its `<h2>`; opening an overlay focuses its first button.

**Layout.** The header (title, `?`, `⚙`) is a flex bar; `main` fills the rest. Screens centre a column of max-width 840 px (play: 720 px) with 16 px padding (12 px under 560 px wide). The play screen is HUD (turn chip + label, time, drops, par, objective line) → board region (flex-grow, min 220 px; canvas fills it, orthographic fit preserves the board's aspect) → status line → tray (Undo, Hint, Restart, Pause; each button grows to 40 % width on phones so the tray wraps to two rows). `body` padding uses all four `env(safe-area-inset-*)` values, so nothing sits under a notch or the home indicator. Sheets are max 460 px wide, max 88svh tall and scroll internally. Illustrations hide below 560 px viewport height so the menu and results buttons always fit. Landscape phones therefore get: header, HUD, a wide short board, tray — all visible without scrolling.

**Never cut off:** the turn label, at least the top row of column targets (each ≥ 44 px tall in the e2e check), the four tray buttons, the results headline and its three buttons.

## 8. Art direction

**Palette** (`css/app.css` `:root`): background `#0e1424`, panel `#161e33`, raised panel `#1e2842`, line `#2c3a5e`, ink `#e8ecf5`, dim ink `#a4b0c8`, accent `#7fb0ff` on `#06101f`, good `#7fe08a`, bad `#ff8a8a`, canvas well `#0a0f1e`. Players (`content.js` `PLAYERS`): You amber `#ffb54d` ●, Rival cyan `#4dc9ff` ◆, Third green `#7fe08a` ▲, Fourth violet `#d98cff` ■. High-contrast swaps to `#000`/`#ffffff` lines, accent and P1 `#ffd60a`, P2 `#2e6fe4`, P3 `#17a398`, P4 `#8e24aa`. Theme palettes (bg / frame / light / accent): Glacier `#0e1424 / #5f7fc9 / #bfd8ff / #7fb0ff`; Ember `#1d1310 / #c97a4a / #ffd9a8 / #ffb066`; Verdant `#101a14 / #5aa86e / #d8ffb0 / #9fe080`; Violet `#171226 / #8a6fd0 / #d8c8ff / #b48cff`; Ivory `#3a3630 / #b09a78 / #fff2dd / #ffd9a0`.

**Hero.** The slab: a translucent frame (`MeshStandardMaterial`, opacity 0.55, roughness 0.25) with instanced socket rings and dark recesses, seen straight-on by an orthographic camera, lit by one directional key from upper-left tinted by the theme's `light` colour plus a hemisphere fill, ACES tone mapping at exposure 1.1. Discs are cylinders (r 0.40, h 0.22) with a relief marker matching the player's DOM glyph (ring, octahedron, three-sided cone, box) so ownership survives colour blindness. Sealed columns are plugged in frame glass. The 2D fallback draws the identical geometry with the glyphs as text.

**Shape language.** Rounded slab, circular sockets, 12 px radii on UI, 16 px on sheets; thin 1 px `--line` borders; no drop shadows in the DOM.

**Typography.** System UI stack; header wordmark uppercase with 0.14 em tracking; headings `clamp(19px, 3.6vw, 25px)`; "Larger text" sets the body to 19 px.

**Motion.** Drops fall under a 26 u/s² gravity integrator from one cell above the slab and stop exactly on the rules cell; the winning line lifts (z 0.16, scale 1.1) and pulses ±0.05; column hover is a 0.18-alpha tint bar. With reduced motion (setting or `prefers-reduced-motion`): no fall (discs appear in place), no pulse, AI delay 120 ms, CSS transitions ~0. The renderer stops its `requestAnimationFrame` loop whenever the play screen is not active or the game is paused.

**Visual assets the design calls for:** title key art (slab with a glowing amber diagonal), a warm "line completed" results illustration, a cool "rival's line" results illustration, a matching store cover. All four ship (section 15). No 3D model is generated: discs and slab are deliberately procedural so themes can recolour them.

## 9. Audio direction (`js/sfx.js`)

**Mix.** One `AudioContext` created on the first pointer/key gesture; `master` gain carries volume (0–1, default 0.8) and mute; every clip and every synthesized fallback routes through `fxBus → master`. There is no music and no ambience by design: the game is a quiet table. Clips are 48 kHz mono Opus, loudness-normalised to −20 LUFS, lazily fetched and decoded on first use; until a clip is ready (or if it 404s) the event's synthesized fallback plays instead, so a cue is never silent and never double-played. `drop` picks one of three variants at random (unseeded; cosmetic).

**SFX event table** (source of `sfx/manifest.txt`):

| Event id | File | Sound | Used when |
|---|---|---|---|
| drop | disc-drop-a/b/c.opus | wooden/resin disc down a slot, one clack | every landed disc |
| win | line-win.opus | four ascending metal bars | any player completes a line |
| draw | board-draw.opus | two wooden knocks | board full |
| move-limit | move-limit-bell.opus | desk bell then wooden tok | drop budget spent |
| resigned | resign-fold.opus | mat folding, descending piano note | Pause → Resign |
| time-up | time-up-tick.opus | timer ticks then spring buzz | clock hits zero |
| column-full | column-full-thud.opus | rubbery thud | canvas click on a full column |
| bad-column | bad-column-knock.opus | hollow knock | off-board column; lesson rejects a column |
| banned-column | banned-column-rattle.opus | gate rattle | sealed column (Off-Center) |
| out-of-turn | out-of-turn-tap.opus | two fingertip taps | input while the AI thinks |
| game-ended | game-ended-dull.opus | muted drum | command after the end |
| unknown-command | unknown-command-buzz.opus | low buzzer | engine-only (not reachable from UI) |
| malformed-command | malformed-command-click.opus | switch click + snap | engine-only |
| hint | hint-chime.opus | glass bell with shimmer | hint shown |
| undo | undo-rewind.opus | disc sliding back up, click | undo applied |
| lesson-complete | lesson-complete.opus | two marimba notes, tap | drop-any / stack lesson goal met |
| clock-warning | clock-warning.opus | metronome tick | once at 10 s left on a timed board |
| menu-tap | menu-tap.opus | fingertip on frosted glass | any menu, header or sheet button |

## 10. Localization

The build ships **English only**; every string is an inline literal in `index.html` and `js/ui.js`/`js/content.js`, and the page declares `lang="en"`. There is no locale table, no language selector and no `navigator.language` branch. The required locale set (en-US, en-GB, es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR, it-IT) is design intent (section 17). Layout already tolerates expansion: menu cards and tray buttons wrap, the lede is capped at 66 ch, and the results grid is two-column with right-aligned numbers, so a 30 % longer German or French string does not clip.

## 11. Accessibility

- **Keyboard-only path:** every screen is reachable with Tab/Enter; the board's columns are real buttons in DOM order; ← → move among enabled columns; 1–9, U, H, R, P, Esc work anywhere on the play screen except inside form fields. Overlays move focus to their first button; screens move focus to their heading.
- **Focus:** 3 px accent outline with 2 px offset (`:focus-visible`), inset on column targets so it is visible over the canvas.
- **Screen readers:** the canvas is `role="img"`; `#col-layer` is a labelled group; each column's `aria-label` reads "Column n, h of rows filled, drops into row r" (or "full"/"sealed", plus "(hint)"); `#grid-mirror` holds the whole board as text ("Row 6: empty, You, Rival…"); `#turn-label` and `#play-status` are `aria-live="polite"` and announce turn changes, rejections, undo counts, hints and the result headline with score.
- **Colour independence:** each player has a glyph in the DOM chip, in the 2D board, and as a relief marker on the 3D disc; the winning line is also lifted and outlined white in 2D.
- **Contrast:** dim ink `#a4b0c8` on `#0e1424` ≈ 8.4:1; high-contrast mode uses pure black/white/yellow.
- **Reduced motion:** honoured from the OS on first boot and toggleable in Settings.
- **Targets:** buttons are ≥ 44 px tall (`--tap`); column targets span the slab height and one cell width (checked ≥ 44 px in e2e).
- **Larger text:** Settings toggle to a 19 px base.
- **Captions:** every audio cue has a visible counterpart (status line, HUD, results headline); nothing is audio-only.

## 12. StarHermit integration

`starhermit.txt` declares `name=Fourfold`, `launch=index.html`, `owner`, `server=server.js`, `version=1.0.0`, `rulesVersion=1`, `contentVersion=1`, `cover=coverart.png`. Per https://wiki.starhermit.com/ conventions the game is a self-contained static distribution.

| Platform feature | Used? | Notes |
|---|---|---|
| Launch manifest / cover | Yes | as above |
| Launch-token auth | Yes (hosted) | `#game_token=` fragment read once and stripped; `sub`/`game_scope` decoded; Bearer on every call; re-mint via `POST /api/v1/games/{slug}/launch-token` every 45 min (`js/platform.js`) |
| Identity, profile, presence | Partial | nickname from `GET /api/v1/users/{sub}/profile` shown in the header ("Player "+id8 fallback); presence not used |
| Per-game settings / cloud save | Yes (hosted) | the whole `fourfold.v1` doc mirrors to `GET/PUT /api/v1/me/cloud-saves/{slug}` as a stored zip (remote wins on load, 2 s debounce + pagehide flush); `localStorage` stays the offline cache; sync status in Settings |
| Leaderboards | No | no submissions (clients cannot submit); scores are local bests, carried inside the cloud-saved doc |
| Achievements | Local | five flags in `store.achievements`, synced inside the cloud-saved doc; never submitted to the platform (no client claim path) |
| Sessions, invitations, matchmaking | No | Two-player mode is pass-and-play on one device |
| Server script | Declared, inert | `server.js` serves files and `/api/health`; it holds no rules and no session |
| Platform time | No | Daily uses the client's UTC date |

## 13. Technical architecture

- **Boundaries.** `rules.js` and `content.js` are UMD modules with no DOM or clock; `ui.js` is the only writer of `localStorage` and the only caller of `applyCommand`; `platform.js` owns token auth, the nickname, and the cloud mirror but never touches game state — with no launch token it makes no network calls; `view3d.js` only ever receives a snapshot via `sync(state, {theme, hover})` and drop events via `dropAnim(col,row)`; `sfx.js` receives the `applyCommand` result (`playResult`) or an event id.
- **Determinism.** A finished game is fully described by `(cfg, drops)`; `replay` reproduces `hashState`. AI moves are a pure function of `(state, level, rng stream)`; the same seed replays the same rival. The e2e test asserts the replay hash and a serialize/deserialize round-trip in the live page.
- **Persistence.** `fourfold.v1` document: `settings`, `journey`, `challenges`, `lessons`, `daily`, `stats`, `achievements`, `save`. Loaded with a forward-merge onto defaults so a partial or older document never crashes boot; a different `v` resets the document. "Erase progress on this device" resets it after a `confirm()`.
- **Clock.** `session.elapsedMs` accumulates only while the play screen is active and unpaused (`resumeClock`/`pauseClock`); the tick runs every 250 ms and fires `timeout` through the engine when a limit is reached. Tab hide pauses.
- **Rendering.** WebGL is attempted first; any throw falls back to the 2D canvas on a cloned element, and `console.warn`s once. Pixel ratio is capped at 2. Sockets and recesses are `InstancedMesh`; all geometries/materials are tracked and disposed by `dispose()`. Budget: one draw call per disc plus four fixed meshes — under 60 draw calls on a full 7x6 board, well below mobile limits.
- **Performance targets.** 60 fps on desktop, 30+ on phones; the loop is stopped while not playing, so idle screens cost zero GPU time. Page weight: Three.js ~655 KB (vendor), all 20 clips ~350 KB (lazy), images 51 KB total.
- **Server.** `server.js` refuses paths outside its root, serves the MIME set (html, js, css, json, svg, png, webp, opus) and `/api/health`; `PORT` env selects the port (default 8080).
- **E2E driving.** `tests/e2e.mjs` starts its own static server (on `PORT` if set, else ephemeral), launches Chrome via `playwright-core` and only uses what a player sees — role-based button clicks, column buttons, key presses — reading state back through `window.FFUI.getSession()` purely to assert.

## 14. Testing and acceptance criteria

**`npm test`** (`tests/rules.test.mjs`, node --test, 14 tests): lowest-free-cell placement and turn passing; `legalActions` excluding full and sealed columns; every `INVALID` reason; line detection with the reported line and the 1000-point win; the scoring worked example (par bonuses, speed bonus, three-star threshold); a 4x4 draw scoring 300; move-limit terminal; resign/timeout winners incl. the three-player case; turn rotation at three players; preset validation and overflow errors; replay hash equality with duplicate-id skipping and serialize round-trip; RNG determinism; AI determinism plus forced blocks at levels 2–4 and a hint that completes a four; content validation (42 stages, 8 mastery, 7 challenges, 6 lessons, 5 themes, deterministic daily with no assists).

**`npm run test:e2e`** (desktop 1280x800, mobile 390x844 with touch, plus a no-WebGL pass): title loads with the heading visible; all five modules exposed and `FFContent.validate()` clean; Play → Steady AI shows 7 column buttons ≥ 44 px tall over a ≥ 200x150 canvas; pointer drop, number-key drop and arrow+Enter drop each land and the AI replies; undo returns to the local player's turn and refunds the drop; the grid mirror and column `aria-label`s reflect the board; P pauses and Resume unpauses; Restart clears board and history; a full game through UI clicks reaches a terminal state and a results sheet with a headline and breakdown; Resign ends the game; a game left mid-way survives a reload via Resume with identical drops; high-contrast, reduced-motion and mute persist across a reload; Pentafold shows 9 columns and accepts a drop; the "Make four" lesson rejects the wrong column, does not complete on resign, and completes on the taught column; replay hash and serialization round-trip; `sfx/manifest.json` lists ≥ 10 clips and a clip is served as `audio/ogg`; the 2D fallback board accepts three drops. Any console error, page error, failed request or HTTP ≥ 400 fails the pass (a known Three.js context error is allowed only in the no-WebGL pass).

**QA bar as checkable statements:** a new player sees a one-line rule and a Learn entry on the title, and every lesson states its instruction before the first drop; every feature listed in section 5 is reachable by clicking visible buttons; both e2e viewports report zero console errors or warnings; screenshots from the e2e run show the title, board and results sheet uncropped on both viewports.

**Static checks:** `node --check` on every `.js`/`.mjs`; the repository asset audit passes (favicon links resolve, every clip is Opus 48 kHz mono, every clip appears in source, `manifest.json` matches disk).

## 15. Asset inventory

| Path | Purpose | Source | Status |
|---|---|---|---|
| `assets/key-art.webp` (1280x720, 18 KB) | Title screen hero image | FLUX.2 klein, seed 7701, 1536x864, 28 steps | generated in this pass, wired (`.title-art`) |
| `assets/results-win.webp` (1024x576, 20 KB) | Results sheet on a win / lesson complete | FLUX.2 klein, seed 7702 | generated in this pass, wired (`setResultsArt`) |
| `assets/results-lose.webp` (1024x576, 13 KB) | Results sheet on a loss / resign / time-up / budget | FLUX.2 klein, seed 7703 | generated in this pass, wired |
| `coverart.png` (1200x675, 180 KB) | Store cover | key art + title text (ffmpeg drawtext), 256-colour PNG | replaced in this pass (previous file was the generic template) |
| `icon.png`, `favicon.svg` | Icons | authored SVG/PNG | shipped |
| `sfx/disc-drop-a/b/c.opus` | drop variants | MOSS-SFX v2 | shipped |
| `sfx/line-win, board-draw, move-limit-bell, resign-fold, time-up-tick.opus` | terminal cues | MOSS-SFX v2 | shipped |
| `sfx/column-full-thud, bad-column-knock, banned-column-rattle, out-of-turn-tap, game-ended-dull, unknown-command-buzz, malformed-command-click.opus` | rejection cues | MOSS-SFX v2 | shipped |
| `sfx/hint-chime, undo-rewind, lesson-complete, clock-warning, menu-tap.opus` | UI cues | MOSS-SFX v2, 100 steps | generated in this pass, wired |
| `sfx/manifest.txt` | canonical clip table | authored | this pass |
| `vendor/three.module.min.js` | renderer | Three.js (MIT) | shipped |
| 3D hero model | — | not called for (procedural slab and discs) | none |
| Character animation | — | no humanoid | none |

## 16. Known limitations

- English only (section 10).
- `server=server.js` is declared but the script is a static host; nothing about a game is authoritative or shared. Two-player play is same-device only.
- Achievements are stored but no screen lists them; the only visible progress is the title stats line, journey stars and challenge bests.
- Cloud sync and the account name only appear when the game is launched with a StarHermit token; plain local play stays local-only.
- `THEMES[].unlockStars` is never read: themes are assigned by content, not unlocked.
- The Daily uses the client clock for its date and overwrites the day's record on replay (no "first attempt counts").
- The `win` cue plays for the rival's line too; only the headline colour distinguishes it.
- `column-full` can only be triggered by clicking the canvas over a full column; `unknown-command` and `malformed-command` are engine-only.
- The timed-board timeout is polled every 250 ms, so the clock can overrun by up to a quarter second.
- Practice seeds come from `Math.random()`, so a practice game cannot be re-created from its results, only resumed from its save.
- `drop` variant choice is unseeded (cosmetic only).
- A pre-existing content bug (the `mate1` flag matched the mastery test via substring, marking 24 stages as mastery) was fixed in this pass by whole-word matching; stars already earned are unaffected.

## 17. Design intent not yet implemented

- Ship the nine required locales with a string table and `navigator.language` selection.
- Surface the five achievements in a screen (they already sync inside the cloud-saved doc; the platform offers no client achievement-submit path).
- Use platform time for the Daily boundary and keep only the first daily attempt as the record.
- Give the rival's win its own, cooler cue.
- Hosted two-player sessions through the StarHermit Games API, with `server.js` as the authoritative script.
