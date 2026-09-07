/* Fourfold — board presentation.
 *
 * Three.js-first: a sculptural translucent vertical grid rendered with an
 * orthographic camera, plus a 2D-canvas fallback that draws the same board
 * when WebGL is unavailable or the context is lost. Both back-ends expose
 * the identical interface so js/ui.js never branches on which is active.
 *
 * The view is presentation only. It never mutates rules state; it renders
 * the snapshot handed to it by `sync(state, opts)` and animates drops from
 * events handed to it by `dropAnim(col, row, player)`.
 */
import * as THREE from '../vendor/three.module.min.js';

const CELL = 1;          // world units per cell
const DISC_R = 0.40;
const DISC_H = 0.22;
const FRAME_Z = -0.22;
const MARGIN = 0.55;     // frame border around the grid, in cells
const GRAVITY = 26;      // world units / s^2 for the drop animation
const HC_DISC = { 1: 0xffd60a, 2: 0x2e6fe4, 3: 0x17a398, 4: 0x8e24aa };

function hexOf(n) { return '#' + (n >>> 0).toString(16).padStart(6, '0'); }

/* Board geometry shared by both back-ends: cell (col,row) -> world/px center.
 * Row 0 is the bottom row, matching the rules engine's grid layout. */
function layout(cols, rows) {
  const w = cols * CELL + MARGIN * 2;
  const h = rows * CELL + MARGIN * 2;
  return {
    cols, rows, w, h,
    x: (c) => (c - (cols - 1) / 2) * CELL,
    y: (r) => (r - (rows - 1) / 2) * CELL,
  };
}

/* ------------------------------------------------------------------ *
 * 2D canvas fallback
 * ------------------------------------------------------------------ */
function createCanvasView(canvas, opts) {
  const ctx = canvas.getContext('2d');
  let L = layout(7, 6);
  let snap = null, theme = opts.theme, anims = [], hover = -1, reduced = false, hc = false;
  let raf = 0, last = 0, running = true;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const cw = Math.max(1, Math.round(rect.width)), ch = Math.max(1, Math.round(rect.height));
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr; canvas.height = ch * dpr;
    }
    return { cw, ch, dpr };
  }

  function draw(now) {
    raf = running ? requestAnimationFrame(draw) : 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    step(dt);
    const { cw, ch, dpr } = resize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const p = theme.palette;
    ctx.fillStyle = hexOf(p.bg); ctx.fillRect(0, 0, cw, ch);
    if (!snap) return;
    const s = Math.min(cw / L.w, ch / L.h);
    const ox = cw / 2, oy = ch / 2;
    const px = (wx) => ox + wx * s, py = (wy) => oy - wy * s;

    // frame slab
    ctx.fillStyle = hexOf(p.frame);
    ctx.globalAlpha = 0.5;
    roundRect(ctx, px(-L.w / 2), py(L.h / 2), L.w * s, L.h * s, 0.35 * s);
    ctx.fill();
    ctx.globalAlpha = 1;

    // sockets — sealed columns are plugged with the frame colour
    const banned = (snap.cfg && snap.cfg.bannedCols) || [];
    for (let c = 0; c < L.cols; c++) {
      const sealed = banned.indexOf(c) !== -1;
      for (let r = 0; r < L.rows; r++) {
        ctx.beginPath();
        ctx.arc(px(L.x(c)), py(L.y(r)), DISC_R * s, 0, Math.PI * 2);
        ctx.fillStyle = hexOf(sealed ? p.frame : p.cell); ctx.fill();
        ctx.lineWidth = Math.max(1, 0.03 * s);
        ctx.strokeStyle = hexOf(p.frameGhost); ctx.stroke();
      }
    }
    // discs
    for (const d of discList()) drawDisc(d);
    // column hover / preview
    if (hover >= 0 && hover < L.cols && snap.preview >= 0 && !snap.terminal) {
      ctx.globalAlpha = 0.35;
      drawDisc({ col: hover, y: L.y(snap.preview), player: snap.current, win: false });
      ctx.globalAlpha = 1;
      ctx.strokeStyle = hexOf(p.accent); ctx.lineWidth = Math.max(2, 0.05 * s);
      ctx.strokeRect(px(L.x(hover)) - 0.5 * CELL * s, py(L.h / 2 - MARGIN), CELL * s, L.rows * CELL * s);
    }

    function drawDisc(d) {
      const cx = px(L.x(d.col)), cy = py(d.y);
      ctx.beginPath(); ctx.arc(cx, cy, DISC_R * s, 0, Math.PI * 2);
      ctx.fillStyle = discColor(d.player); ctx.fill();
      ctx.lineWidth = Math.max(1, 0.05 * s);
      ctx.strokeStyle = d.win ? '#ffffff' : 'rgba(0,0,0,.45)'; ctx.stroke();
      // shape reinforcement: player icon inside the disc
      ctx.fillStyle = 'rgba(0,0,0,.62)';
      ctx.font = `${Math.round(0.5 * s)}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(opts.icons[d.player] || '', cx, cy + 0.02 * s);
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function discColor(p) {
    return hexOf(hc ? HC_DISC[p] : opts.colors[p]);
  }

  function discList() {
    const out = [];
    if (!snap) return out;
    const winSet = winKeys();
    for (let c = 0; c < L.cols; c++) {
      for (let r = 0; r < L.rows; r++) {
        const v = snap.grid[c * L.rows + r];
        if (!v) continue;
        const a = anims.find((x) => x.col === c && x.row === r);
        out.push({ col: c, y: a ? a.y : L.y(r), player: v, win: winSet.has(c + ',' + r) });
      }
    }
    return out;
  }

  function winKeys() {
    const s = new Set();
    if (snap && snap.terminal && snap.terminal.line)
      for (const [c, r] of snap.terminal.line) s.add(c + ',' + r);
    return s;
  }

  function step(dt) {
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      if (reduced) { anims.splice(i, 1); continue; }
      a.v += GRAVITY * dt;
      a.y -= a.v * dt;
      if (a.y <= a.target) { a.y = a.target; anims.splice(i, 1); }
    }
  }

  const api = {
    kind: '2d',
    sync(state, o) {
      if (!state) { snap = null; return; }
      if (L.cols !== state.cols || L.rows !== state.rows) { L = layout(state.cols, state.rows); anims.length = 0; }
      snap = state;
      if (o) { if (o.theme) theme = o.theme; if (o.hover != null) hover = o.hover; }
    },
    setTheme(t) { theme = t; },
    setHover(c) { hover = c; },
    setReducedMotion(v) { reduced = !!v; if (v) anims.length = 0; },
    setHighContrast(v) { hc = !!v; },
    dropAnim(col, row) {
      if (reduced) return;
      anims.push({ col, row, y: L.y(L.rows) + 1, v: 0, target: L.y(row) });
    },
    clearAnims() { anims.length = 0; },
    columnFromPoint(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !snap) return -1;
      const s = Math.min(rect.width / L.w, rect.height / L.h);
      const wx = (clientX - rect.left - rect.width / 2) / s;
      const c = Math.round(wx / CELL + (L.cols - 1) / 2);
      return c >= 0 && c < L.cols ? c : -1;
    },
    columnRect(col) {
      const rect = canvas.getBoundingClientRect();
      const s = Math.min(rect.width / L.w, rect.height / L.h);
      return {
        left: rect.width / 2 + (L.x(col) - 0.5) * s,
        top: rect.height / 2 - (L.h / 2 - MARGIN) * s,
        width: CELL * s,
        height: L.rows * CELL * s,
      };
    },
    setRunning(v) {
      running = !!v;
      if (running && !raf) { last = 0; raf = requestAnimationFrame(draw); }
      if (!running && raf) { cancelAnimationFrame(raf); raf = 0; }
    },
    dispose() { api.setRunning(false); },
  };
  raf = requestAnimationFrame(draw);
  return api;
}

/* ------------------------------------------------------------------ *
 * Three.js view
 * ------------------------------------------------------------------ */
function createThreeView(canvas, opts) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(0, 0, 20);
  camera.lookAt(0, 0, 0);

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-3, 6, 8);
  const fill = new THREE.HemisphereLight(0xffffff, 0x202840, 1.1);
  scene.add(key, fill);

  const boardGroup = new THREE.Group();
  scene.add(boardGroup);

  // Reused geometry/material (disposed explicitly on dispose()).
  const discGeo = new THREE.CylinderGeometry(DISC_R, DISC_R, DISC_H, 40);
  discGeo.rotateX(Math.PI / 2);
  const socketGeo = new THREE.TorusGeometry(DISC_R + 0.045, 0.05, 8, 36);
  const holeGeo = new THREE.CircleGeometry(DISC_R + 0.045, 36);
  const frameGeo = new THREE.BoxGeometry(1, 1, 0.3);
  const owned = [discGeo, socketGeo, holeGeo, frameGeo];

  const discMats = {};
  const discMatsHC = {};
  for (const p of [1, 2, 3, 4]) {
    discMats[p] = new THREE.MeshStandardMaterial({ color: opts.colors[p], roughness: 0.35, metalness: 0.1 });
    discMatsHC[p] = new THREE.MeshStandardMaterial({ color: HC_DISC[p], roughness: 0.35, metalness: 0.1 });
    owned.push(discMats[p], discMatsHC[p]);
  }
  // Per-player relief marker on the disc face: ownership stays readable
  // without relying on hue, matching the ● ◆ ▲ ■ icons used in the DOM.
  const markGeo = {
    1: new THREE.TorusGeometry(0.13, 0.05, 8, 24),
    2: new THREE.OctahedronGeometry(0.18),
    3: new THREE.ConeGeometry(0.19, 0.1, 3),
    4: new THREE.BoxGeometry(0.25, 0.25, 0.1),
  };
  markGeo[3].rotateX(Math.PI / 2);
  const markMat = new THREE.MeshStandardMaterial({ color: 0x101828, roughness: 0.5 });
  for (const p of [1, 2, 3, 4]) owned.push(markGeo[p]);
  owned.push(markMat);

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x5f7fc9, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.55,
  });
  const socketMat = new THREE.MeshStandardMaterial({ color: 0x2a3a5f, roughness: 0.6 });
  // Flat dark disc behind each socket ring so an empty cell reads as a hole
  // through the frame rather than a raised ring sitting on top of it.
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x0a0f1e });
  const hoverMat = new THREE.MeshBasicMaterial({ color: 0x7fb0ff, transparent: true, opacity: 0.18 });
  owned.push(frameMat, socketMat, holeMat, hoverMat);

  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.position.z = FRAME_Z;
  boardGroup.add(frame);

  // Drawn in front of the discs as a translucent column tint, so it never
  // z-fights with the frame slab it would otherwise sit inside.
  hoverMat.depthWrite = false;
  const hoverBar = new THREE.Mesh(frameGeo, hoverMat);
  hoverBar.renderOrder = 2;
  hoverBar.visible = false;
  boardGroup.add(hoverBar);

  let sockets = null;          // InstancedMesh over every cell (ring)
  let holes = null;            // InstancedMesh over every cell (recess)
  let discs = [];              // Mesh per occupied cell, keyed by col*rows+row
  let L = layout(7, 6);
  let snap = null, theme = opts.theme, hover = -1, reduced = false, hc = false;
  let anims = new Map();       // key -> {y, v, target}
  let raf = 0, last = 0, running = true;
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  function rebuild(cols, rows) {
    L = layout(cols, rows);
    if (sockets) { boardGroup.remove(sockets); sockets.dispose(); }
    if (holes) { boardGroup.remove(holes); holes.dispose(); }
    sockets = new THREE.InstancedMesh(socketGeo, socketMat, cols * rows);
    holes = new THREE.InstancedMesh(holeGeo, holeMat, cols * rows);
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++) {
        const i = c * rows + r;
        dummy.position.set(L.x(c), L.y(r), 0);
        dummy.updateMatrix();
        sockets.setMatrixAt(i, dummy.matrix);
        dummy.position.z = -0.09;
        dummy.updateMatrix();
        holes.setMatrixAt(i, dummy.matrix);
      }
    sockets.instanceMatrix.needsUpdate = true;
    holes.instanceMatrix.needsUpdate = true;
    boardGroup.add(holes, sockets);
    applyBanned();
    frame.scale.set(L.w, L.h, 1);
    hoverBar.scale.set(CELL, rows * CELL, 0.05);
    for (const m of discs) if (m) boardGroup.remove(m);
    discs = new Array(cols * rows).fill(null);
    anims.clear();
  }
  rebuild(7, 6);

  // A sealed column is plugged with frame-coloured cells so its illegality is
  // visible without relying on the disabled state of the DOM button alone.
  function applyBanned() {
    if (!holes) return;
    const banned = (snap && snap.cfg && snap.cfg.bannedCols) || [];
    const p = theme.palette;
    for (let c = 0; c < L.cols; c++) {
      const sealed = banned.indexOf(c) !== -1;
      tmpColor.setHex(sealed ? p.frame : p.cell);
      for (let r = 0; r < L.rows; r++) holes.setColorAt(c * L.rows + r, tmpColor);
    }
    if (holes.instanceColor) holes.instanceColor.needsUpdate = true;
  }

  function applyTheme() {
    const p = theme.palette;
    scene.background = new THREE.Color(p.bg);
    frameMat.color.setHex(p.frame);
    socketMat.color.setHex(p.frameGhost);
    holeMat.color.setHex(0xffffff);   // tinted per instance by applyBanned()
    hoverMat.color.setHex(p.accent);
    key.color.setHex(p.light);
    applyBanned();
  }
  applyTheme();

  let lastW = 0, lastH = 0;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const cw = Math.max(1, Math.round(rect.width)), ch = Math.max(1, Math.round(rect.height));
    if (cw !== lastW || ch !== lastH) { lastW = cw; lastH = ch; renderer.setSize(cw, ch, false); }
    // Fit the whole board with a small breathing margin, preserving aspect.
    const scale = Math.max(L.w / cw, L.h / ch);
    camera.left = -cw * scale / 2; camera.right = cw * scale / 2;
    camera.top = ch * scale / 2; camera.bottom = -ch * scale / 2;
    camera.updateProjectionMatrix();
    return { cw, ch };
  }

  function matFor(p) { return (hc ? discMatsHC : discMats)[p] || discMats[1]; }

  function syncDiscs() {
    if (!snap) return;
    const winSet = new Set();
    if (snap.terminal && snap.terminal.line)
      for (const [c, r] of snap.terminal.line) winSet.add(c * L.rows + r);
    for (let i = 0; i < L.cols * L.rows; i++) {
      const v = snap.grid[i];
      if (v && !discs[i]) {
        const m = new THREE.Mesh(discGeo, matFor(v));
        m.userData.player = v;
        m.position.set(L.x(Math.floor(i / L.rows)), L.y(i % L.rows), 0);
        const mark = new THREE.Mesh(markGeo[v] || markGeo[1], markMat);
        mark.position.z = DISC_H / 2 + 0.03;
        m.add(mark);
        boardGroup.add(m);
        discs[i] = m;
      } else if (!v && discs[i]) {
        boardGroup.remove(discs[i]); discs[i] = null; anims.delete(i);
      } else if (v && discs[i] && discs[i].userData.player !== v) {
        discs[i].material = matFor(v); discs[i].userData.player = v;
      }
      if (discs[i]) {
        discs[i].material = matFor(v);
        const w = winSet.has(i);
        discs[i].position.z = w ? 0.16 : 0;
        discs[i].scale.setScalar(w ? 1.1 : 1);
      }
    }
  }

  function step(dt, t) {
    for (const [k, a] of anims) {
      if (reduced) { anims.delete(k); continue; }
      a.v += GRAVITY * dt;
      a.y -= a.v * dt;
      if (a.y <= a.target) { a.y = a.target; anims.delete(k); }
      if (discs[k]) discs[k].position.y = a.y;
    }
    if (snap && snap.terminal && snap.terminal.line && !reduced) {
      const pulse = 1.1 + Math.sin(t * 4) * 0.05;
      for (const [c, r] of snap.terminal.line) {
        const m = discs[c * L.rows + r];
        if (m) m.scale.setScalar(pulse);
      }
    }
  }

  function frameLoop(now) {
    raf = running ? requestAnimationFrame(frameLoop) : 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    step(dt, now / 1000);
    resize();
    hoverBar.visible = hover >= 0 && hover < L.cols && !!snap && !snap.terminal;
    if (hoverBar.visible) hoverBar.position.set(L.x(hover), 0, 0.45);
    renderer.render(scene, camera);
  }

  const api = {
    kind: '3d',
    sync(state, o) {
      if (o) { if (o.theme) { theme = o.theme; applyTheme(); } if (o.hover != null) hover = o.hover; }
      if (!state) { snap = null; return; }
      const grew = L.cols !== state.cols || L.rows !== state.rows;
      snap = state;
      if (grew) rebuild(state.cols, state.rows); else applyBanned();
      syncDiscs();
    },
    setTheme(t) { theme = t; applyTheme(); },
    setHover(c) { hover = c; },
    setReducedMotion(v) { reduced = !!v; if (v) { anims.clear(); syncDiscs(); } },
    setHighContrast(v) { hc = !!v; syncDiscs(); },
    dropAnim(col, row) {
      if (reduced) return;
      const k = col * L.rows + row;
      anims.set(k, { y: L.y(L.rows) + 1, v: 0, target: L.y(row) });
      if (discs[k]) discs[k].position.y = L.y(L.rows) + 1;
    },
    clearAnims() { anims.clear(); syncDiscs(); },
    columnFromPoint(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return -1;
      const scale = Math.max(L.w / rect.width, L.h / rect.height);
      const wx = (clientX - rect.left - rect.width / 2) * scale;
      const c = Math.round(wx / CELL + (L.cols - 1) / 2);
      return c >= 0 && c < L.cols ? c : -1;
    },
    columnRect(col) {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.max(L.w / rect.width, L.h / rect.height);
      const s = 1 / scale;
      return {
        left: rect.width / 2 + (L.x(col) - 0.5) * s,
        top: rect.height / 2 - (L.rows / 2) * CELL * s,
        width: CELL * s,
        height: L.rows * CELL * s,
      };
    },
    setRunning(v) {
      running = !!v;
      if (running && !raf) { last = 0; raf = requestAnimationFrame(frameLoop); }
      if (!running && raf) { cancelAnimationFrame(raf); raf = 0; }
    },
    dispose() {
      api.setRunning(false);
      for (const m of discs) if (m) boardGroup.remove(m);
      if (sockets) sockets.dispose();
      if (holes) holes.dispose();
      for (const o of owned) o.dispose();
      renderer.dispose();
    },
  };
  raf = requestAnimationFrame(frameLoop);
  return api;
}

/* Public factory: try WebGL, fall back to 2D canvas. Never throws.
 *
 * A canvas can only ever hand out one kind of context, so if the WebGL
 * attempt got far enough to claim one, the fallback must run on a fresh
 * element that inherits the original's id, classes and ARIA attributes. */
export function createView(canvas, opts) {
  try {
    return createThreeView(canvas, opts);
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn)
      console.warn('Fourfold: WebGL unavailable, using 2D board.', (e && e.message) || e);
    let target = canvas;
    if (!canvas.getContext('2d')) {
      target = canvas.cloneNode(false);
      canvas.parentNode.replaceChild(target, canvas);
    }
    return createCanvasView(target, opts);
  }
}
