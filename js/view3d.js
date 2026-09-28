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
 *
 * Graphics quality (js/gfx.js) is applied live through `setGraphics(saved)`;
 * `graphicsInfo()` reports the GPU, resolved tiers and cost for the panel.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { detectPreset, resolve, describe, SHADOW_MAP, PARTICLE_COUNT } from './gfx.js';

export const GFX_KEY = 'fourfold.gfx';

/** Saved graphics settings ({} = Auto). Never throws. */
export function loadGraphics() {
  try {
    const raw = window.localStorage && window.localStorage.getItem(GFX_KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? v : {};
  } catch (e) { return {}; }
}

export function saveGraphics(saved) {
  try { window.localStorage.setItem(GFX_KEY, JSON.stringify(saved || {})); } catch (e) { /* private mode */ }
}

function isMobile() {
  try {
    return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
      /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  } catch (e) { return false; }
}

/* GPU name from a throwaway context, so the canvas's own context can be
 * created with the right antialias flag. Firefox reports the real name in
 * RENDERER (and warns on the debug extension), Chrome masks it there. */
let gpuCache = null;
export function detectGpu() {
  if (gpuCache) return gpuCache;
  let name = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      name = String(gl.getParameter(gl.RENDERER) || '');
      if (!name || /^(webkit|mozilla)/i.test(name)) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) name = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || name);
      }
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
  } catch (e) { name = ''; }
  gpuCache = { gpu: name || 'unknown GPU', preset: detectPreset(name, { mobile: isMobile() }) };
  return gpuCache;
}


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
    // The 2D board has no quality tiers; it only records the choice so the
    // panel stays consistent and can say the 3D board is unavailable.
    setGraphics(next) {
      gfxSaved = next && typeof next === 'object' ? next : {};
      canvas.dataset.gfxPreset = resolve(gfxSaved, detectGpu().preset).preset;
      document.body.dataset.gfxPreset = canvas.dataset.gfxPreset;
    },
    graphicsInfo() {
      const r = resolve(gfxSaved, detectGpu().preset);
      return { kind: '2d', gpu: detectGpu().gpu, detected: detectGpu().preset, resolved: r,
        summary: '2D board', pixels: [canvas.width, canvas.height], fps: 0, adaptiveScale: 1, postFailed: true };
    },
    dispose() { api.setRunning(false); },
  };
  let gfxSaved = loadGraphics();
  api.setGraphics(gfxSaved);
  raf = requestAnimationFrame(draw);
  return api;
}

/* ------------------------------------------------------------------ *
 * Three.js view
 * ------------------------------------------------------------------ */

// Colour grade + vignette, run after OutputPass (display-space in and out):
// a gentle S-curve, a touch more saturation, cool shadows / warm highlights.
// Pixels matching the backdrop (uKeep) are left alone so the canvas edge
// stays seamless with the page colour.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 1.0 }, uVignette: { value: 0.16 }, uKeep: { value: new THREE.Color() } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uAmount; uniform float uVignette; uniform vec3 uKeep;
    varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = clamp(src.rgb, 0.0, 1.0);
      vec3 orig = c;
      vec3 s = mix(c, c * c * (3.0 - 2.0 * c), 0.18);
      float l = dot(s, vec3(0.299, 0.587, 0.114));
      s = mix(vec3(l), s, 1.1);
      s *= mix(vec3(0.97, 0.99, 1.04), vec3(1.03, 1.0, 0.97), smoothstep(0.2, 0.8, l));
      c = mix(c, s, uAmount);
      float d = length(vUv - 0.5);
      c *= 1.0 - uVignette * smoothstep(0.4, 0.9, d);
      float keep = 1.0 - smoothstep(0.012, 0.05, distance(orig, uKeep));
      gl_FragColor = vec4(mix(c, orig, keep), src.a);
    }`,
};

// Chip profile for the detailed disc: raised rim, recessed face, rounded edge.
function discProfile() {
  const h = DISC_H / 2, r = DISC_R;
  const pts = [
    [0, h - 0.025], [r * 0.62, h - 0.025], [r * 0.7, h - 0.004], [r * 0.8, h],
    [r * 0.93, h - 0.006], [r - 0.012, h - 0.03], [r, h - 0.06], [r, -h + 0.06],
    [r - 0.012, -h + 0.03], [r * 0.93, -h + 0.006], [r * 0.8, -h], [0, -h],
  ];
  return pts.reverse().map(([x, y]) => new THREE.Vector2(x, y));
}

function canvasTexture(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  return t;
}

// Soft value noise for the frosted plate (bump), tileable by wrapping.
function noiseTexture() {
  const t = canvasTexture(128, (g, n) => {
    const img = g.createImageData(n, n);
    const cell = 8, grid = [];
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const gn = n / cell;
    for (let i = 0; i < gn * gn; i++) grid.push(rnd());
    const at = (x, y) => grid[((y + gn) % gn) * gn + ((x + gn) % gn)];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const v = (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) +
        (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
      const k = Math.round((0.35 + v * 0.3 + rnd() * 0.08) * 255);
      const o = (y * n + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = k; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function dotTexture() {
  const t = canvasTexture(64, (g, n) => {
    const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, n, n);
  });
  return t;
}

// Soft pool of light behind the board; alpha only, tinted by the theme.
function glowTexture() {
  return canvasTexture(256, (g, n) => {
    const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.55, 'rgba(255,255,255,.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, n, n);
  });
}

/* The post chain tone-maps everything, including the clear colour. To keep
 * the backdrop equal to the page colour, clear with the linear colour that
 * ACES (three's fit, at this exposure) maps back onto the theme background. */
const ACES_IN = [[0.59719, 0.35458, 0.04823], [0.07600, 0.90834, 0.01566], [0.02840, 0.13383, 0.83777]];
const ACES_OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]];
function acesFit(v) { return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081); }
function aces(rgb, exposure) {
  const c = rgb.map((x) => x * exposure / 0.6);
  const a = ACES_IN.map((r) => acesFit(r[0] * c[0] + r[1] * c[1] + r[2] * c[2]));
  return ACES_OUT.map((r) => Math.min(1, Math.max(0, r[0] * a[0] + r[1] * a[1] + r[2] * a[2])));
}
function invertToneMap(color, exposure) {
  const t = [color.r, color.g, color.b];
  const x = t.slice();
  for (let it = 0; it < 60; it++) {
    const f = aces(x, exposure);
    for (let i = 0; i < 3; i++) {
      const probe = x.slice(); probe[i] += 1e-4;
      const d = (aces(probe, exposure)[i] - f[i]) / 1e-4 || 1;
      x[i] = Math.max(0, x[i] + (t[i] - f[i]) / d * 0.8);
    }
  }
  return new THREE.Color(x[0], x[1], x[2]);
}

function createThreeView(canvas, opts) {
  const gpuInfo = detectGpu();
  let saved = loadGraphics();
  let q = resolve(saved, gpuInfo.preset);
  // Canvas MSAA is fixed when the context is created; later changes to
  // "msaa" are served by a multisampled post target instead.
  const nativeAA = q.antialias === 'msaa';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: nativeAA, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const webgl2 = renderer.capabilities.isWebGL2;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(0, 0, 20);
  camera.lookAt(0, 0, 0);

  const KEY_POS = new THREE.Vector3(-3, 6, 8);
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.copy(KEY_POS);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.015;
  const fill = new THREE.HemisphereLight(0xffffff, 0x202840, 1.1);
  scene.add(key, key.target, fill);

  const boardGroup = new THREE.Group();
  scene.add(boardGroup);

  // Reused geometry/material (disposed explicitly on dispose()).
  const discGeo = new THREE.CylinderGeometry(DISC_R, DISC_R, DISC_H, 40);
  discGeo.rotateX(Math.PI / 2);
  const discGeoD = new THREE.LatheGeometry(discProfile(), 56);
  discGeoD.rotateX(Math.PI / 2);
  const socketGeo = new THREE.TorusGeometry(DISC_R + 0.045, 0.05, 8, 36);
  const holeGeo = new THREE.CircleGeometry(DISC_R + 0.045, 36);
  const frameGeo = new THREE.BoxGeometry(1, 1, 0.3);
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const owned = [discGeo, discGeoD, socketGeo, holeGeo, frameGeo, planeGeo];

  // Disc materials, created on demand per (detail, contrast, win, player).
  const discMatCache = new Map();
  function discMat(p, win) {
    const detailed = q.detail === 'detailed';
    const k = [detailed ? 'd' : 'p', hc ? 'h' : 'n', win ? 'w' : '-', p].join('|');
    let m = discMatCache.get(k);
    if (m) return m;
    const color = hc ? HC_DISC[p] : opts.colors[p];
    if (!detailed) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 });
    } else {
      m = new THREE.MeshPhysicalMaterial({
        color, roughness: 0.36, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.18,
        envMapIntensity: 0.3,
      });
      if (win) { m.emissive = new THREE.Color(color); m.emissiveIntensity = 0.55; }
    }
    discMatCache.set(k, m);
    owned.push(m);
    return m;
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
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
  owned.push(frameMat, socketMat, holeMat, hoverMat, ghostMat);

  // Detailed board: a perforated, bevelled front plate of frosted glass.
  const noiseTex = noiseTexture();
  const plateMat = new THREE.MeshPhysicalMaterial({
    color: 0x5f7fc9, roughness: 0.4, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.1,
    transparent: true, opacity: 0.8, bumpMap: noiseTex, bumpScale: 0.35, envMapIntensity: 0.35,
  });
  noiseTex.repeat.set(0.35, 0.35);
  // Shadow catchers: plate rims into the recesses, and the board onto the wall.
  const recessShadowMat = new THREE.ShadowMaterial({ opacity: 0.5, depthWrite: false });
  const wallShadowMat = new THREE.ShadowMaterial({ opacity: 0.32, depthWrite: false });
  const glowTex = glowTexture();
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.1, depthWrite: false });
  owned.push(noiseTex, plateMat, recessShadowMat, wallShadowMat, glowTex, glowMat);

  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.position.z = FRAME_Z;
  boardGroup.add(frame);

  const recessShadow = new THREE.Mesh(planeGeo, recessShadowMat);
  recessShadow.position.z = -0.088;
  recessShadow.receiveShadow = true;
  const wallShadow = new THREE.Mesh(planeGeo, wallShadowMat);
  wallShadow.position.z = -0.5;
  wallShadow.receiveShadow = true;
  const glow = new THREE.Mesh(planeGeo, glowMat);
  glow.position.z = -1;
  glow.renderOrder = -1;
  scene.add(glow, wallShadow);
  boardGroup.add(recessShadow);

  // Drawn in front of the discs as a translucent column tint, so it never
  // z-fights with the frame slab it would otherwise sit inside.
  hoverMat.depthWrite = false;
  const hoverBar = new THREE.Mesh(frameGeo, hoverMat);
  hoverBar.renderOrder = 2;
  hoverBar.visible = false;
  boardGroup.add(hoverBar);
  // Translucent preview disc at the landing row of the hovered column.
  const ghost = new THREE.Mesh(discGeo, ghostMat);
  ghost.renderOrder = 3;
  ghost.visible = false;
  boardGroup.add(ghost);

  // Particles: landing puffs and win sparkles (additive, HDR so they bloom).
  const PMAX = PARTICLE_COUNT.high;
  const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3);
  const pState = [];
  for (let i = 0; i < PMAX; i++) { pState.push({ life: 0, max: 1, vx: 0, vy: 0, r: 0, g: 0, b: 0 }); pPos[i * 3 + 2] = -50; }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
  const dotTex = dotTexture();
  const pMat = new THREE.PointsMaterial({
    size: 8, map: dotTex, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  points.renderOrder = 4;
  points.visible = false;
  scene.add(points);
  owned.push(pGeo, dotTex, pMat);
  let pNext = 0, sparkleAcc = 0;

  let sockets = null;          // InstancedMesh over every cell (ring)
  let holes = null;            // InstancedMesh over every cell (recess)
  let plate = null;            // detailed front plate for the current size
  let discs = [];              // Mesh per occupied cell, keyed by col*rows+row
  let L = layout(7, 6);
  let snap = null, theme = opts.theme, hover = -1, reduced = false, hc = false;
  let anims = new Map();       // key -> {y, v, target}
  let raf = 0, last = 0, running = true, clock = 0, lingerUntil = 0;
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();
  const bgRaw = new THREE.Color(), bgPost = new THREE.Color();
  scene.background = bgRaw;

  // Graphics state.
  let envTex = null, composer = null, gradePass = null, postKey = null, postFailed = false;
  let pixelRatio = 0, adaptiveScale = 1, frames = [], fps = 0;

  function buildPlate() {
    if (plate) { boardGroup.remove(plate); plate.geometry.dispose(); plate = null; }
    if (q.detail !== 'detailed') return;
    const w = L.w, h = L.h, rr = 0.32;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + rr, -h / 2);
    shape.lineTo(w / 2 - rr, -h / 2); shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + rr);
    shape.lineTo(w / 2, h / 2 - rr); shape.quadraticCurveTo(w / 2, h / 2, w / 2 - rr, h / 2);
    shape.lineTo(-w / 2 + rr, h / 2); shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - rr);
    shape.lineTo(-w / 2, -h / 2 + rr); shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + rr, -h / 2);
    for (let c = 0; c < L.cols; c++)
      for (let r = 0; r < L.rows; r++) {
        const hole = new THREE.Path();
        hole.absarc(L.x(c), L.y(r), 0.47, 0, Math.PI * 2, true);
        shape.holes.push(hole);
      }
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.08, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03,
      bevelSegments: 3, curveSegments: 22,
    });
    plate = new THREE.Mesh(geo, plateMat);
    plate.position.z = 0.15;
    plate.castShadow = true;
    plate.receiveShadow = true;
    boardGroup.add(plate);
  }

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
    recessShadow.scale.set(L.w, L.h, 1);
    hoverBar.scale.set(CELL, rows * CELL, 0.05);
    for (const m of discs) if (m) boardGroup.remove(m);
    discs = new Array(cols * rows).fill(null);
    anims.clear();
    buildPlate();
    applyDetail();
    fitShadow();
  }

  // Shadow frustum fitted tightly around the board and its drop shadow.
  function fitShadow() {
    const ext = Math.max(L.w, L.h) / 2 + 1.2;
    const cam = key.shadow.camera;
    cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext;
    cam.near = 2; cam.far = 22;
    cam.updateProjectionMatrix();
  }

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
    frameMat.color.setHex(p.frame);
    plateMat.color.setHex(p.frame).multiplyScalar(0.42);
    bgRaw.setHex(p.bg);
    bgPost.copy(invertToneMap(bgRaw, renderer.toneMappingExposure));
    if (gradePass) gradePass.uniforms.uKeep.value.copy(bgRaw).convertLinearToSRGB();
    socketMat.color.setHex(p.frameGhost);
    holeMat.color.setHex(0xffffff);   // tinted per instance by applyBanned()
    hoverMat.color.setHex(p.accent);
    glowMat.color.setHex(p.light);
    key.color.setHex(p.light);
    applyBanned();
  }
  applyTheme();

  // Plain = the original slab with socket rings; detailed = bevelled plate,
  // clear-coated chip discs, recess shadows and a lit wall behind the board.
  function applyDetail() {
    const d = q.detail === 'detailed';
    if (d && !plate) buildPlate();
    if (!d && plate) buildPlate();
    sockets.visible = !d;
    frameMat.opacity = d ? 0.35 : 0.55;
    const shadows = SHADOW_MAP[q.shadows] > 0;
    recessShadow.visible = d && shadows;
    wallShadow.visible = shadows;
    glow.visible = d;
    for (let i = 0; i < discs.length; i++) if (discs[i]) discs[i].geometry = d ? discGeoD : discGeo;
    ghost.geometry = d ? discGeoD : discGeo;
  }

  let lastW = 0, lastH = 0;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const cw = Math.max(1, Math.round(rect.width)), ch = Math.max(1, Math.round(rect.height));
    const ratio = Math.min(4, Math.min(window.devicePixelRatio || 1, q.dprCap) * q.scale * adaptiveScale);
    if (cw !== lastW || ch !== lastH || ratio !== pixelRatio) {
      lastW = cw; lastH = ch; pixelRatio = ratio;
      renderer.setPixelRatio(ratio);
      renderer.setSize(cw, ch, false);
    }
    // Fit the whole board with a small breathing margin, preserving aspect.
    const scale = Math.max(L.w / cw, L.h / ch);
    camera.left = -cw * scale / 2; camera.right = cw * scale / 2;
    camera.top = ch * scale / 2; camera.bottom = -ch * scale / 2;
    camera.updateProjectionMatrix();
    const vw = camera.right - camera.left, vh = camera.top - camera.bottom;
    wallShadow.scale.set(vw + 2, vh + 2, 1);
    glow.scale.set(vw, vh, 1);   // fades to nothing at the canvas edges
    pMat.size = Math.max(4, 0.2 / scale);
    return { cw, ch };
  }

  function syncDiscs() {
    if (!snap) return;
    const winSet = new Set();
    if (snap.terminal && snap.terminal.line)
      for (const [c, r] of snap.terminal.line) winSet.add(c * L.rows + r);
    const d = q.detail === 'detailed';
    for (let i = 0; i < L.cols * L.rows; i++) {
      const v = snap.grid[i];
      if (v && !discs[i]) {
        const m = new THREE.Mesh(d ? discGeoD : discGeo, discMat(v, false));
        m.userData.player = v;
        m.castShadow = true;
        m.receiveShadow = true;
        m.position.set(L.x(Math.floor(i / L.rows)), L.y(i % L.rows), 0);
        const mark = new THREE.Mesh(markGeo[v] || markGeo[1], markMat);
        mark.position.z = DISC_H / 2 + 0.03;
        mark.castShadow = true;
        m.add(mark);
        boardGroup.add(m);
        discs[i] = m;
      } else if (!v && discs[i]) {
        boardGroup.remove(discs[i]); discs[i] = null; anims.delete(i);
      } else if (v && discs[i] && discs[i].userData.player !== v) {
        // Reused cell with a different owner: swap the relief marker too.
        discs[i].userData.player = v;
        discs[i].children[0].geometry = markGeo[v] || markGeo[1];
      }
      if (discs[i]) {
        const w = winSet.has(i);
        discs[i].material = discMat(v, w);
        // Lifted clear of the front plate when detailed.
        discs[i].position.z = w ? (d ? 0.3 : 0.16) : 0;
        discs[i].scale.setScalar(w ? 1.1 : 1);
      }
    }
  }

  // ---------------------------------------------------------------- particles

  function spawn(x, y, vx, vy, life, color, gain) {
    const i = pNext; pNext = (pNext + 1) % PMAX;
    const s = pState[i];
    s.life = life; s.max = life; s.vx = vx; s.vy = vy;
    tmpColor.setHex(color);
    s.r = tmpColor.r * gain; s.g = tmpColor.g * gain; s.b = tmpColor.b * gain;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = 0.6;
  }

  function particleBudget() { return reduced ? 0 : PARTICLE_COUNT[q.particles] || 0; }

  function landingPuff(k) {
    const n = particleBudget() >= PARTICLE_COUNT.high ? 12 : particleBudget() ? 6 : 0;
    if (!n || !discs[k]) return;
    const x = discs[k].position.x, y = discs[k].position.y - DISC_R * 0.8;
    const col = hc ? HC_DISC[discs[k].userData.player] : opts.colors[discs[k].userData.player];
    for (let j = 0; j < n; j++) {
      const a = Math.PI * (0.1 + 0.8 * Math.random());
      const sp = 0.6 + Math.random() * 0.9;
      spawn(x + (Math.random() - 0.5) * 0.5, y, Math.cos(a) * sp, Math.sin(a) * sp * 0.5, 0.3 + Math.random() * 0.2, col, 0.9);
    }
  }

  function stepParticles(dt) {
    const budget = particleBudget();
    points.visible = budget > 0;
    if (!budget) return;
    // Win sparkles rise from the winning line while the board is decided.
    if (snap && snap.terminal && snap.terminal.line) {
      sparkleAcc += dt * (budget >= PARTICLE_COUNT.high ? 36 : 14);
      const line = snap.terminal.line;
      while (sparkleAcc >= 1) {
        sparkleAcc -= 1;
        const [c, r] = line[Math.floor(Math.random() * line.length)];
        const a = Math.random() * Math.PI * 2, rad = DISC_R * (0.4 + Math.random() * 0.7);
        const pl = snap.grid[c * L.rows + r] || 1;
        spawn(L.x(c) + Math.cos(a) * rad, L.y(r) + Math.sin(a) * rad,
          (Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.7, 0.8 + Math.random() * 0.6,
          hc ? HC_DISC[pl] : opts.colors[pl], 2.4);
      }
    } else sparkleAcc = 0;
    for (let i = 0; i < PMAX; i++) {
      const s = pState[i];
      if (s.life <= 0) { pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0; continue; }
      s.life -= dt;
      s.vy -= 0.4 * dt;
      pPos[i * 3] += s.vx * dt; pPos[i * 3 + 1] += s.vy * dt;
      const f = Math.max(0, s.life / s.max);
      const fade = f * f;
      pCol[i * 3] = s.r * fade; pCol[i * 3 + 1] = s.g * fade; pCol[i * 3 + 2] = s.b * fade;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  function clearParticles() {
    for (const s of pState) s.life = 0;
    pCol.fill(0);
    pGeo.attributes.color.needsUpdate = true;
  }

  // ---------------------------------------------------------------- animation

  function step(dt, t) {
    for (const [k, a] of anims) {
      if (reduced) { anims.delete(k); continue; }
      a.v += GRAVITY * dt;
      a.y -= a.v * dt;
      if (a.y <= a.target) { a.y = a.target; anims.delete(k); if (discs[k]) discs[k].position.y = a.y; landingPuff(k); }
      if (discs[k]) discs[k].position.y = a.y;
    }
    const winLine = snap && snap.terminal && snap.terminal.line;
    if (winLine && !reduced) {
      const pulse = 1.1 + Math.sin(t * 4) * 0.05;
      for (const [c, r] of winLine) {
        const m = discs[c * L.rows + r];
        if (m) m.scale.setScalar(pulse);
      }
      if (q.detail === 'detailed') {
        const glowK = 0.45 + 0.25 * (0.5 + 0.5 * Math.sin(t * 4));
        for (const [c, r] of winLine) {
          const m = discs[c * L.rows + r];
          if (m && m.material.emissiveIntensity != null) m.material.emissiveIntensity = glowK;
        }
      }
    }
    // Slow drift of the key light: soft shimmer across the glass.
    if (q.detail === 'detailed' && !reduced) {
      key.position.set(KEY_POS.x + Math.sin(t * 0.35) * 0.5, KEY_POS.y + Math.cos(t * 0.27) * 0.3, KEY_POS.z);
    } else key.position.copy(KEY_POS);
    stepParticles(dt);
  }

  // ---------------------------------------------------------------- graphics

  function applyGraphics() {
    q = resolve(saved, gpuInfo.preset);
    const size = SHADOW_MAP[q.shadows];
    const shadowsWere = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = size > 0;
    key.castShadow = size > 0;
    if (size > 0 && key.shadow.mapSize.x !== size) {
      key.shadow.mapSize.set(size, size);
      if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    }
    if (q.reflections === 'on' && !envTex) {
      const pm = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment(renderer);
      envTex = pm.fromScene(room, 0.04).texture;
      room.dispose();
      pm.dispose();
    }
    scene.environment = q.reflections === 'on' ? envTex : null;
    fill.intensity = q.reflections === 'on' ? 0.75 : 1.1;
    applyDetail();
    if (snap) syncDiscs();
    if (shadowsWere !== renderer.shadowMap.enabled) {
      // Lit materials recompile to add/remove shadow sampling.
      for (const m of [frameMat, socketMat, markMat, plateMat, ...discMatCache.values()]) m.needsUpdate = true;
    }
    adaptiveScale = 1;
    frames = [];
    postKey = null;
    postFailed = false;
    canvas.dataset.gfxPreset = q.preset;
    canvas.dataset.gfxDetail = q.detail;
    document.body.dataset.gfxPreset = q.preset;
    fpsVisible();
  }

  function needsPost() { return q.post || (q.antialias === 'msaa' && !nativeAA && webgl2); }

  function postKeyFor(w, h) {
    return needsPost() ? [q.ao, q.bloom, q.grade, q.antialias, w, h, pixelRatio].join('|') : 'none';
  }

  function disposePost() {
    if (composer) {
      for (const p of composer.passes) if (p.dispose) p.dispose();
      composer.dispose();
    }
    composer = null; gradePass = null;
  }

  function buildPost(w, h) {
    disposePost();
    if (!needsPost() || postFailed) return;
    try {
      const pw = Math.max(1, Math.round(w * pixelRatio)), ph = Math.max(1, Math.round(h * pixelRatio));
      const target = new THREE.WebGLRenderTarget(pw, ph, {
        type: THREE.HalfFloatType, samples: q.antialias === 'msaa' && webgl2 ? 4 : 0,
      });
      const c = new EffectComposer(renderer, target);
      c.setPixelRatio(pixelRatio);
      c.setSize(w, h);
      c.addPass(new RenderPass(scene, camera));
      if (q.ao !== 'off') {
        const ao = new GTAOPass(scene, camera, pw, ph);
        ao.output = GTAOPass.OUTPUT.Default;
        ao.blendIntensity = 0.7;
        const hi = q.ao === 'high';
        ao.updateGtaoMaterial({ radius: 0.3, distanceExponent: 1.2, thickness: 0.5, scale: 1.0, samples: hi ? 16 : 8 });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: hi ? 6 : 4, rings: 2, samples: hi ? 16 : 8 });
        c.addPass(ao);
      }
      // Threshold is in linear scene units: lit disc faces peak near 2, so only
      // the emissive win line, sparkles and specular glints bloom.
      if (q.bloom === 'on') c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.45, 0.35, 2.1));
      c.addPass(new OutputPass());
      if (q.grade === 'on') {
        gradePass = new ShaderPass(GradeShader);
        gradePass.uniforms.uKeep.value.copy(bgRaw).convertLinearToSRGB();
        c.addPass(gradePass);
      }
      if (q.antialias === 'smaa') c.addPass(new SMAAPass(pw, ph));
      if (q.antialias === 'fxaa') {
        const fxaa = new ShaderPass(FXAAShader);
        fxaa.material.uniforms.resolution.value.set(1 / pw, 1 / ph);
        c.addPass(fxaa);
      }
      composer = c;
    } catch (e) {
      // Post-processing is an enhancement: render directly if it cannot be built.
      postFailed = true;
      disposePost();
    }
  }

  // Adaptive resolution: step the render scale down when frames are slow, back up when fast.
  function adapt(dtMs) {
    frames.push(dtMs);
    if (frames.length < 90) return;
    const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
    frames.length = 0;
    fps = 1000 / avg;
    const el = document.getElementById('gfx-fps-meter');
    if (el && !el.hidden) el.textContent = `${Math.round(fps)} fps · ${Math.round(pixelRatio * 100) / 100}×`;
    if (!q.adaptive) return;
    if (avg > 26) adaptiveScale = Math.max(0.6, adaptiveScale - 0.1);
    else if (avg < 14 && adaptiveScale < 1) adaptiveScale = Math.min(1, adaptiveScale + 0.05);
  }

  function fpsVisible() {
    let el = document.getElementById('gfx-fps-meter');
    const on = q.showFps && running;
    if (on && !el) {
      el = document.createElement('div');
      el.id = 'gfx-fps-meter';
      el.setAttribute('aria-hidden', 'true');
      el.textContent = '… fps';
      document.body.appendChild(el);
    }
    if (el) el.hidden = !on;
  }

  // Landing row for the hover preview, or -1 for a full or sealed column.
  function previewRow(c) {
    if (!snap || !snap.heights) return -1;
    const banned = (snap.cfg && snap.cfg.bannedCols) || [];
    const h = snap.heights[c];
    return banned.indexOf(c) === -1 && h >= 0 && h < L.rows ? h : -1;
  }

  function frameLoop(now) {
    // After a stop, keep drawing briefly so the last drop lands and a win
    // line lifts (and sparkles) behind the results sheet.
    const lingering = !running && now < lingerUntil;
    raf = running || lingering ? requestAnimationFrame(frameLoop) : 0;
    if (!running && !lingering) return;
    if (!canvas.getBoundingClientRect().width) return;   // board screen hidden
    const dtMs = last ? Math.min(250, now - last) : 16;
    const dt = Math.min(0.05, dtMs / 1000);
    last = now;
    if (!reduced) clock += dt;
    if (dtMs > 0) adapt(dtMs);
    step(dt, clock);
    const { cw, ch } = resize();
    hoverBar.visible = hover >= 0 && hover < L.cols && !!snap && !snap.terminal;
    if (hoverBar.visible) hoverBar.position.set(L.x(hover), 0, 0.45);
    const landing = hoverBar.visible ? previewRow(hover) : -1;
    ghost.visible = landing >= 0;
    if (ghost.visible) {
      ghost.position.set(L.x(hover), L.y(landing), 0);
      ghostMat.color.setHex(hc ? HC_DISC[snap.current] || 0xffffff : opts.colors[snap.current] || 0xffffff);
    }
    const k = postKeyFor(cw, ch);
    if (k !== postKey) { postKey = k; buildPost(cw, ch); }
    scene.background = composer ? bgPost : bgRaw;
    if (composer) {
      try { composer.render(dt); } catch (e) { postFailed = true; disposePost(); renderer.render(scene, camera); }
    } else renderer.render(scene, camera);
  }

  rebuild(7, 6);
  applyGraphics();

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
    setReducedMotion(v) {
      reduced = !!v;
      if (v) { anims.clear(); clearParticles(); syncDiscs(); }
    },
    setHighContrast(v) { hc = !!v; syncDiscs(); },
    dropAnim(col, row) {
      if (reduced) return;
      const k = col * L.rows + row;
      anims.set(k, { y: L.y(L.rows) + 1, v: 0, target: L.y(row) });
      if (discs[k]) discs[k].position.y = L.y(L.rows) + 1;
    },
    clearAnims() { anims.clear(); clearParticles(); syncDiscs(); },
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
      const was = running;
      running = !!v;
      if (running && !raf) { last = 0; raf = requestAnimationFrame(frameLoop); }
      if (!running && was) lingerUntil = performance.now() + (snap && snap.terminal && !reduced ? 4000 : 700);
      fpsVisible();
    },
    /** Apply saved graphics settings live ({} = Auto). */
    setGraphics(next) {
      saved = next && typeof next === 'object' ? next : {};
      applyGraphics();
    },
    /** What the Graphics panel shows: GPU, auto choice, resolved tiers and cost. */
    graphicsInfo() {
      const px = [Math.round(lastW * pixelRatio), Math.round(lastH * pixelRatio)];
      return {
        kind: '3d', gpu: gpuInfo.gpu, detected: gpuInfo.preset, resolved: q,
        summary: describe(q, px[0] ? px : null), pixels: px, fps: Math.round(fps),
        adaptiveScale: Math.round(adaptiveScale * 100) / 100, postFailed, nativeAA,
      };
    },
    dispose() {
      api.setRunning(false);
      lingerUntil = 0;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      for (const m of discs) if (m) boardGroup.remove(m);
      if (sockets) sockets.dispose();
      if (holes) holes.dispose();
      if (plate) plate.geometry.dispose();
      disposePost();
      if (envTex) envTex.dispose();
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
