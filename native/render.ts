// The board on starhermit:scene, ported from the browser build's three.js
// view (js/view3d.js before the port): the translucent slab seen straight on
// by an orthographic camera, instanced socket rings and dark recesses, discs
// with a relief marker per player (ring, octahedron, three-sided cone, box)
// so ownership never rests on hue, sealed columns plugged in frame glass, the
// hover tint and ghost disc, the gravity drop, the lifted and pulsing winning
// line, landing puffs and win sparkles. The Detailed board (Balanced and up)
// adds the perforated, bevelled frosted front plate, chip-profiled
// clear-coated discs, the recess and wall shadow catchers, the faint pool of
// the theme's light behind the board and the drifting key light. It renders
// from rules snapshots (`sync`) and drop events (`dropAnim`) and never
// changes rules state.
//
// What changed from three.js, and why:
// - The board sat in a <canvas> between the HUD and the tray; here the scene
//   spans the window and the orthographic camera is framed so the board fits
//   the board region's rectangle (native/screens.ts paints the page around
//   it), as the old canvas's orthographic fit did.
// - The EffectComposer chain (GTAO, UnrealBloom, the grade ShaderPass,
//   SMAA / FXAA / MSAA) is renderer.ao / bloom / grade / antialias; the
//   grade is the runtime's display-space grade with the old S-curve's slope,
//   saturation and split tint. The adaptive resolution, pixel-ratio cap,
//   render scale, frame-rate readout and shadow map size are the runtime's.
// - Light intensities are three.js r160's divided by π (the engine's
//   convention). The frosted plate's bump, the light pool and the particle
//   dot are DataTextures computed once (the old ones were canvas textures).
import {
  ACESFilmicToneMapping, AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry,
  CircleGeometry, DataTexture, DirectionalLight, DynamicDrawUsage, ExtrudeGeometry, Group, HemisphereLight, InstancedMesh,
  LatheGeometry, LinearFilter, LinearMipmapLinearFilter, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshPhysicalMaterial, MeshStandardMaterial,
  OctahedronGeometry, OrthographicCamera, PMREMGenerator, Path, PlaneGeometry, Points, PointsMaterial, RGBAFormat, RepeatWrapping,
  RoomEnvironment, Shape, ShadowMaterial, TorusGeometry, Vector2, Vector3, renderer, scene,
} from "starhermit:scene";
import type { Material, Texture } from "starhermit:scene";
import type { State, Theme } from "./classic.ts";
import { MAX_PARTICLES, PARTICLE_COUNT, SHADOW_MAP, type Look } from "./quality.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const PI = Math.PI;

const CELL = 1;          // world units per cell
const DISC_R = 0.40;
const DISC_H = 0.22;
const FRAME_Z = -0.22;
const MARGIN = 0.55;     // frame border around the grid, in cells
const GRAVITY = 26;      // world units / s^2 for the drop animation
const HC_DISC: Record<number, number> = { 1: 0xffd60a, 2: 0x2e6fe4, 3: 0x17a398, 4: 0x8e24aa };
const COLORS: Record<number, number> = { 1: 0xffb54d, 2: 0x4dc9ff, 3: 0x7fe08a, 4: 0xd98cff };
const KEY_POS = new Vector3(-3, 6, 8);

interface Layout { cols: number; rows: number; w: number; h: number; x(c: number): number; y(r: number): number }
function layout(cols: number, rows: number): Layout {
  return {
    cols, rows, w: cols * CELL + MARGIN * 2, h: rows * CELL + MARGIN * 2,
    x: (c) => (c - (cols - 1) / 2) * CELL,
    y: (r) => (r - (rows - 1) / 2) * CELL,
  };
}

// ------------------------------------------------------------------ textures
function dataTexture(n: number, paint: (x: number, y: number) => [number, number, number, number]): DataTexture {
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const [r, g, b, a] = paint(x, y);
    const o = (y * n + x) * 4;
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a;
  }
  const t = new DataTexture(data, n, n, RGBAFormat);
  // Smooth like the old canvas textures (a DataTexture samples nearest by default).
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
/** Soft value noise for the frosted plate (bump), tileable by wrapping (the old noiseTexture). */
function noiseTexture(n: number): DataTexture {
  const cell = 8, gn = n / cell, grid: number[] = [];
  let seed = 1234567;
  const rnd = (): number => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < gn * gn; i++) grid.push(rnd());
  const at = (x: number, y: number): number => grid[(((y % gn) + gn) % gn) * gn + (((x % gn) + gn) % gn)]!;
  const t = dataTexture(n, (x, y) => {
    const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const v = (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
    const k = Math.max(0, Math.min(255, Math.round((0.35 + v * 0.3 + rnd() * 0.08) * 255)));
    return [k, k, k, 255];
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}
/** A white radial falloff (alpha only): stops at 0 → 1, mid → midA, 1 → 0. */
function radialTexture(n: number, mid: number, midA: number): DataTexture {
  return dataTexture(n, (x, y) => {
    const d = Math.min(1, Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2));
    const a = d < mid ? 1 + (midA - 1) * (d / mid) : midA * (1 - (d - mid) / (1 - mid));
    return [255, 255, 255, Math.round(Math.max(0, a) * 255)];
  });
}

// Chip profile for the detailed disc: raised rim, recessed face, rounded edge.
function discProfile(): Vector2[] {
  const h = DISC_H / 2, r = DISC_R;
  const pts: [number, number][] = [
    [0, h - 0.025], [r * 0.62, h - 0.025], [r * 0.7, h - 0.004], [r * 0.8, h],
    [r * 0.93, h - 0.006], [r - 0.012, h - 0.03], [r, h - 0.06], [r, -h + 0.06],
    [r - 0.012, -h + 0.03], [r * 0.93, -h + 0.006], [r * 0.8, -h], [0, -h],
  ];
  return pts.reverse().map(([x, y]) => new Vector2(x, y));
}

// ------------------------------------------------------------------ the backdrop
// The runtime tone-maps (and grades) the background colour with the scene
// whenever its post path runs (every tier here: Low's MSAA too), as the old
// EffectComposer chain did. As the old view, the backdrop is cleared with the
// linear colour that ACES (three's fit, at this exposure) and the grade map
// back onto the theme's background, so the region reads as the page did.
const ACES_IN = [[0.59719, 0.35458, 0.04823], [0.07600, 0.90834, 0.01566], [0.02840, 0.13383, 0.83777]];
const ACES_OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]];
const EXPOSURE = 1.1;
function acesFit(v: number): number { return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081); }
function srgbEncode(c: number): number { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
function smooth(a: number, b: number, x: number): number { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
/** Linear scene light → the displayed sRGB value (tone mapping, then the display grade when on). */
function display(rgb: number[], grade: boolean): number[] {
  const c = rgb.map((x) => x * EXPOSURE / 0.6);
  const a = ACES_IN.map((r) => acesFit(r[0]! * c[0]! + r[1]! * c[1]! + r[2]! * c[2]!));
  let o = ACES_OUT.map((r) => srgbEncode(Math.min(1, Math.max(0, r[0]! * a[0]! + r[1]! * a[1]! + r[2]! * a[2]!))));
  if (grade) {
    const l = 0.2126 * o[0]! + 0.7152 * o[1]! + 0.0722 * o[2]!;
    const k = smooth(0.2, 0.8, l);
    const sh = [0.97, 0.99, 1.04], hi = [1.03, 1.0, 0.97];
    o = o.map((v, i) => Math.min(1, Math.max(0, ((l + (v - l) * 1.1) - 0.5) * 1.09 + 0.5) * (sh[i]! + (hi[i]! - sh[i]!) * k)));
  }
  return o;
}
function srgbDecode(c: number): number { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
/** The linear colour that shows as the sRGB `hexColor` (the old invertToneMap, with the grade when on). */
function backdrop(hexColor: number, grade: boolean, out: Color): void {
  const t = [(hexColor >> 16) & 255, (hexColor >> 8) & 255, hexColor & 255].map((v) => srgbDecode(v / 255));
  const f = (x: number[]): number[] => display(x, grade).map(srgbDecode);
  const x = t.slice();
  for (let it = 0; it < 80; it++) {
    const y = f(x);
    for (let i = 0; i < 3; i++) {
      const probe = x.slice(); probe[i] = probe[i]! + 1e-4;
      const d = (f(probe)[i]! - y[i]!) / 1e-4 || 1;
      x[i] = Math.max(0, x[i]! + (t[i]! - y[i]!) / d * 0.8);
    }
  }
  out.setRGB(x[0]!, x[1]!, x[2]!);
}

// ------------------------------------------------------------------ state
let look: Look | null = null;
let reduced = false;
let hc = false;
let visible = false;
let L = layout(7, 6);
let snap: State | null = null;
let theme: Theme | null = null;
let hover = -1;
let time = 0;

const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.set(0, 0, 20);
camera.lookAt(0, 0, 0);
const key = new DirectionalLight(0xffffff, 2.4 / PI);
key.position.copy(KEY_POS);
key.shadow.bias = -0.0006;
key.shadow.normalBias = 0.015;
key.shadow.distance = 30;
const fill = new HemisphereLight(0xffffff, 0x202840, 1.1 / PI);
const boardGroup = new Group();
const bg = new Color(0x0e1424);
let envTex: Texture | null = null;

// Round geometry follows the preset budget's LOD (segments ×, at least 8); rebuilt on change.
let geoSegments = 0;
let discGeo: BufferGeometry, discGeoD: BufferGeometry, socketGeo: BufferGeometry, holeGeo: BufferGeometry;
const seg = (n: number): number => Math.max(8, Math.round(n * geoSegments));
function buildRoundGeos(k: number): void {
  for (const g of [discGeo, discGeoD, socketGeo, holeGeo]) if (g) g.dispose();
  geoSegments = k;
  discGeo = new CylinderGeometry(DISC_R, DISC_R, DISC_H, seg(40));
  discGeo.rotateX(PI / 2);
  discGeoD = new LatheGeometry(discProfile(), seg(56));
  discGeoD.rotateX(PI / 2);
  socketGeo = new TorusGeometry(DISC_R + 0.045, 0.05, 8, seg(36));
  holeGeo = new CircleGeometry(DISC_R + 0.045, seg(36));
}
const frameGeo = new BoxGeometry(1, 1, 0.3);
const planeGeo = new PlaneGeometry(1, 1);

// Per-player relief marker on the disc face, matching the ● ◆ ▲ ■ icons.
const markGeo: Record<number, BufferGeometry> = {
  1: new TorusGeometry(0.13, 0.05, 8, 24),
  2: new OctahedronGeometry(0.18),
  3: new ConeGeometry(0.19, 0.1, 3),
  4: new BoxGeometry(0.25, 0.25, 0.1),
};
markGeo[3]!.rotateX(PI / 2);
const markMat = new MeshStandardMaterial({ color: 0x101828, roughness: 0.5 });
const frameMat = new MeshStandardMaterial({ color: 0x5f7fc9, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.55 });
const socketMat = new MeshStandardMaterial({ color: 0x2a3a5f, roughness: 0.6 });
// Flat disc behind each socket ring so an empty cell reads as a hole (tinted per instance).
const holeMat = new MeshBasicMaterial({ color: 0xffffff });
const hoverMat = new MeshBasicMaterial({ color: 0x7fb0ff, transparent: true, opacity: 0.18, depthWrite: false });
const ghostMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
const lambertTwins = new Map<Material, MeshLambertMaterial>();
function twin(m: MeshStandardMaterial): MeshLambertMaterial {
  let t = lambertTwins.get(m);
  if (!t) { t = new MeshLambertMaterial({ color: m.color.getHex(), transparent: m.transparent, opacity: m.opacity }); lambertTwins.set(m, t); }
  t.color.copy(m.color); t.opacity = m.opacity;
  return t;
}
let litMark: Material = markMat;

// Detailed board: the frosted front plate, per budget class.
let noiseTex: Texture | null = null;
let builtNoise = 0;
const plateMats: Record<string, MeshStandardMaterial | MeshLambertMaterial> = {
  physical: new MeshPhysicalMaterial({ color: 0x5f7fc9, roughness: 0.4, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true, opacity: 0.8, bumpScale: 0.35, envMapIntensity: 0.35 }),
  standard: new MeshStandardMaterial({ color: 0x5f7fc9, roughness: 0.4, metalness: 0, transparent: true, opacity: 0.8, bumpScale: 0.35, envMapIntensity: 0.35 }),
  lambert: new MeshLambertMaterial({ color: 0x5f7fc9, transparent: true, opacity: 0.8, bumpScale: 0.35 }),
};
let plateMat: MeshStandardMaterial | MeshLambertMaterial = plateMats.standard!;
const recessShadowMat = new ShadowMaterial({ opacity: 0.5, depthWrite: false });
const wallShadowMat = new ShadowMaterial({ opacity: 0.32, depthWrite: false });
const glowTex = radialTexture(256, 0.55, 0.35);
const glowMat = new MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.1, depthWrite: false });

const frame = new Mesh(frameGeo, frameMat);
frame.position.z = FRAME_Z;
const recessShadow = new Mesh(planeGeo, recessShadowMat);
recessShadow.position.z = -0.088;
recessShadow.receiveShadow = true;
const wallShadow = new Mesh(planeGeo, wallShadowMat);
wallShadow.position.z = -0.5;
wallShadow.receiveShadow = true;
const glow = new Mesh(planeGeo, glowMat);
glow.position.z = -1;
glow.renderOrder = -1;
// Drawn in front of the discs as a translucent column tint.
const hoverBar = new Mesh(frameGeo, hoverMat);
hoverBar.renderOrder = 2;
hoverBar.visible = false;
let ghost: Mesh;

// Particles: landing puffs and win sparkles (additive, bright so they bloom).
const PMAX = MAX_PARTICLES;
const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3);
const pState: { life: number; max: number; vx: number; vy: number; r: number; g: number; b: number }[] = [];
for (let i = 0; i < PMAX; i++) { pState.push({ life: 0, max: 1, vx: 0, vy: 0, r: 0, g: 0, b: 0 }); pPos[i * 3 + 2] = -50; }
const pGeo = new BufferGeometry();
pGeo.setAttribute("position", new BufferAttribute(pPos, 3).setUsage(DynamicDrawUsage));
pGeo.setAttribute("color", new BufferAttribute(pCol, 3).setUsage(DynamicDrawUsage));
const dotTex = radialTexture(64, 0.35, 0.55);
const pMat = new PointsMaterial({ size: 8, sizeAttenuation: false, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending });
const points = new Points(pGeo, pMat);
points.frustumCulled = false;
points.renderOrder = 4;
points.visible = false;
let pNext = 0, sparkleAcc = 0;

let sockets: InstancedMesh | null = null;
let holes: InstancedMesh | null = null;
let plate: Mesh | null = null;
let discs: (Mesh | null)[] = [];
const anims = new Map<number, { y: number; v: number; target: number }>();
const dummy = new Matrix4();
const tmpColor = new Color();
const discMatCache = new Map<string, Material>();
let built = false;

function build(): void {
  built = true;
  renderer.camera = camera;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  scene.background = bg;
  scene.add(key, key.target, fill, boardGroup, glow, wallShadow, points);
  buildRoundGeos(look ? look.budget.segments : 1);
  ghost = new Mesh(discGeo, ghostMat);
  ghost.renderOrder = 3;
  ghost.visible = false;
  boardGroup.add(frame, recessShadow, hoverBar, ghost);
  rebuild(7, 6);
}

// ------------------------------------------------------------------ materials
function detailed(): boolean { return look?.detail === "detailed"; }
function discMat(p: number, win: boolean): Material {
  const d = detailed();
  const cls = look?.budget.material ?? "standard";
  const k = [d ? "d" : "p", cls, hc ? "h" : "n", win ? "w" : "-", p].join("|");
  let m = discMatCache.get(k);
  if (m) return m;
  const color = hc ? HC_DISC[p]! : COLORS[p]!;
  if (cls === "lambert") {
    const lm = new MeshLambertMaterial({ color });
    if (win && d) { lm.emissive = new Color(color); lm.emissiveIntensity = 0.55; }
    m = lm;
  } else if (!d) {
    m = new MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 });
  } else if (cls !== "physical") {
    const sm = new MeshStandardMaterial({ color, roughness: 0.36, metalness: 0, envMapIntensity: 0.3 });
    if (win) { sm.emissive = new Color(color); sm.emissiveIntensity = 0.55; }
    m = sm;
  } else {
    const pm = new MeshPhysicalMaterial({ color, roughness: 0.36, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.18, envMapIntensity: 0.3 });
    if (win) { pm.emissive = new Color(color); pm.emissiveIntensity = 0.55; }
    m = pm;
  }
  discMatCache.set(k, m);
  return m;
}

function buildPlate(): void {
  if (plate) { boardGroup.remove(plate); plate.geometry.dispose(); plate = null; }
  if (!detailed()) return;
  const w = L.w, h = L.h, rr = 0.32;
  const shape = new Shape();
  shape.moveTo(-w / 2 + rr, -h / 2);
  shape.lineTo(w / 2 - rr, -h / 2); shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + rr);
  shape.lineTo(w / 2, h / 2 - rr); shape.quadraticCurveTo(w / 2, h / 2, w / 2 - rr, h / 2);
  shape.lineTo(-w / 2 + rr, h / 2); shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - rr);
  shape.lineTo(-w / 2, -h / 2 + rr); shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + rr, -h / 2);
  for (let c = 0; c < L.cols; c++) for (let r = 0; r < L.rows; r++) {
    const hole = new Path();
    hole.absarc(L.x(c), L.y(r), 0.47, 0, PI * 2, true);
    shape.holes.push(hole);
  }
  const geo = new ExtrudeGeometry(shape, {
    depth: 0.08, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03,
    bevelSegments: geoSegments < 1 ? 2 : 3, curveSegments: seg(22),
  });
  plate = new Mesh(geo, plateMat);
  plate.position.z = 0.15;
  plate.castShadow = true;
  plate.receiveShadow = true;
  boardGroup.add(plate);
}

function rebuild(cols: number, rows: number): void {
  L = layout(cols, rows);
  if (sockets) boardGroup.remove(sockets);
  if (holes) boardGroup.remove(holes);
  sockets = new InstancedMesh(socketGeo, socketMat, cols * rows);
  holes = new InstancedMesh(holeGeo, holeMat, cols * rows);
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const i = c * rows + r;
    sockets.setMatrixAt(i, dummy.makeTranslation(L.x(c), L.y(r), 0));
    holes.setMatrixAt(i, dummy.makeTranslation(L.x(c), L.y(r), -0.09));
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
  applyBudgetMaterials();
}

// A sealed column is plugged with frame-coloured cells.
function applyBanned(): void {
  if (!holes || !theme) return;
  const banned = snap?.cfg?.bannedCols ?? [];
  const p = theme.palette;
  for (let c = 0; c < L.cols; c++) {
    tmpColor.setHex(banned.indexOf(c) !== -1 ? p.frame : p.cell);
    for (let r = 0; r < L.rows; r++) holes.setColorAt(c * L.rows + r, tmpColor);
  }
  if (holes.instanceColor) holes.instanceColor.needsUpdate = true;
}

function applyTheme(): void {
  if (!theme) return;
  const p = theme.palette;
  frameMat.color.setHex(p.frame);
  for (const m of Object.values(plateMats)) m.color.setHex(p.frame).multiplyScalar(0.42);
  applyBackdrop();
  socketMat.color.setHex(p.frameGhost);
  hoverMat.color.setHex(p.accent);
  glowMat.color.setHex(p.light);
  key.color.setHex(p.light);
  applyBanned();
  applyBudgetMaterials();
}

// Preset asset variants: the material class of the frame, sockets and markers (Lambert twins on Low).
function applyBudgetMaterials(): void {
  if (!look || !sockets) return;
  const lambert = look.budget.material === "lambert";
  (frame as Any).material = lambert ? twin(frameMat) : frameMat;
  sockets.material = lambert ? twin(socketMat) : socketMat;
  litMark = lambert ? twin(markMat) : markMat;
  for (const d of discs) if (d) (d.children[0] as Mesh).material = litMark;
}

// Plain = the original slab with socket rings; detailed = bevelled plate,
// clear-coated chip discs, recess shadows and a lit wall behind the board.
function applyDetail(): void {
  const d = detailed();
  if (d !== !!plate) buildPlate();
  if (sockets) sockets.visible = !d;
  frameMat.opacity = d ? 0.35 : 0.55;
  const shadows = !!look && SHADOW_MAP[look.shadows] > 0;
  recessShadow.visible = d && shadows;
  wallShadow.visible = shadows;
  glow.visible = d;
  for (const m of discs) if (m) m.geometry = d ? discGeoD : discGeo;
  if (ghost) ghost.geometry = d ? discGeoD : discGeo;
  applyBudgetMaterials();
}

function syncDiscs(): void {
  if (!snap) return;
  const winSet = new Set<number>();
  if (snap.terminal?.line) for (const [c, r] of snap.terminal.line) winSet.add(c * L.rows + r);
  const d = detailed();
  for (let i = 0; i < L.cols * L.rows; i++) {
    const v = snap.grid[i]!;
    let m = discs[i] ?? null;
    if (v && !m) {
      m = new Mesh(d ? discGeoD : discGeo, discMat(v, false));
      m.userData.player = v;
      m.castShadow = true;
      m.receiveShadow = true;
      m.position.set(L.x(Math.floor(i / L.rows)), L.y(i % L.rows), 0);
      const mark = new Mesh(markGeo[v] ?? markGeo[1]!, litMark);
      mark.position.z = DISC_H / 2 + 0.03;
      mark.castShadow = true;
      m.add(mark);
      boardGroup.add(m);
      discs[i] = m;
    } else if (!v && m) {
      boardGroup.remove(m); discs[i] = null; anims.delete(i); m = null;
    } else if (v && m && m.userData.player !== v) {
      m.userData.player = v;
      (m.children[0] as Mesh).geometry = markGeo[v] ?? markGeo[1]!;
    }
    if (m) {
      const w = winSet.has(i);
      m.material = discMat(v, w);
      if (!anims.has(i)) m.position.y = L.y(i % L.rows);
      // Lifted clear of the front plate when detailed.
      m.position.z = w ? (d ? 0.3 : 0.16) : 0;
      m.scale.setScalar(w ? 1.1 : 1);
    }
  }
}

// ------------------------------------------------------------------ particles
function spawn(x: number, y: number, vx: number, vy: number, life: number, color: number, gain: number): void {
  const i = pNext; pNext = (pNext + 1) % PMAX;
  const s = pState[i]!;
  s.life = life; s.max = life; s.vx = vx; s.vy = vy;
  tmpColor.setHex(color);
  s.r = tmpColor.r * gain; s.g = tmpColor.g * gain; s.b = tmpColor.b * gain;
  pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = 0.6;
}
function particleBudget(): number { return reduced || !look ? 0 : PARTICLE_COUNT[look.particles] || 0; }
function discColor(p: number): number { return hc ? HC_DISC[p] ?? 0xffffff : COLORS[p] ?? 0xffffff; }
function landingPuff(k: number): void {
  const budget = particleBudget();
  const n = Math.round((budget >= PARTICLE_COUNT.high ? 12 : budget ? 6 : 0) * (look?.budget.sparks ?? 1));
  const m = discs[k];
  if (!n || !m) return;
  const x = m.position.x, y = m.position.y - DISC_R * 0.8;
  const col = discColor(m.userData.player as number);
  for (let j = 0; j < n; j++) {
    const a = PI * (0.1 + 0.8 * Math.random());
    const sp = 0.6 + Math.random() * 0.9;
    spawn(x + (Math.random() - 0.5) * 0.5, y, Math.cos(a) * sp, Math.sin(a) * sp * 0.5, 0.3 + Math.random() * 0.2, col, 0.9);
  }
}
function stepParticles(dt: number): void {
  const budget = particleBudget();
  points.visible = budget > 0 && visible;
  if (!budget) return;
  // Win sparkles rise from the winning line while the board is decided.
  const line = snap?.terminal?.line;
  if (line) {
    sparkleAcc += dt * (budget >= PARTICLE_COUNT.high ? 36 : 14) * (look?.budget.sparks ?? 1);
    while (sparkleAcc >= 1) {
      sparkleAcc -= 1;
      const [c, r] = line[Math.floor(Math.random() * line.length)]!;
      const a = Math.random() * PI * 2, rad = DISC_R * (0.4 + Math.random() * 0.7);
      const pl = snap!.grid[c * L.rows + r] || 1;
      spawn(L.x(c) + Math.cos(a) * rad, L.y(r) + Math.sin(a) * rad, (Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.7, 0.8 + Math.random() * 0.6, discColor(pl), 2.4);
    }
  } else sparkleAcc = 0;
  for (let i = 0; i < PMAX; i++) {
    const s = pState[i]!;
    if (s.life <= 0) { pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0; continue; }
    s.life -= dt;
    s.vy -= 0.4 * dt;
    pPos[i * 3] = pPos[i * 3]! + s.vx * dt; pPos[i * 3 + 1] = pPos[i * 3 + 1]! + s.vy * dt;
    const f = Math.max(0, s.life / s.max);
    const fade = f * f;
    pCol[i * 3] = s.r * fade; pCol[i * 3 + 1] = s.g * fade; pCol[i * 3 + 2] = s.b * fade;
  }
  (pGeo.attributes.position as BufferAttribute).needsUpdate = true;
  (pGeo.attributes.color as BufferAttribute).needsUpdate = true;
}
function clearParticles(): void {
  for (const s of pState) s.life = 0;
  pCol.fill(0);
  (pGeo.attributes.color as BufferAttribute).needsUpdate = true;
}

// ------------------------------------------------------------------ animation
function step(dt: number, t: number): void {
  for (const [k, a] of anims) {
    if (reduced) { anims.delete(k); if (discs[k]) discs[k]!.position.y = a.target; continue; }
    a.v += GRAVITY * dt;
    a.y -= a.v * dt;
    if (a.y <= a.target) { a.y = a.target; anims.delete(k); if (discs[k]) discs[k]!.position.y = a.y; landingPuff(k); }
    if (discs[k]) discs[k]!.position.y = a.y;
  }
  const winLine = snap?.terminal?.line;
  if (winLine && !reduced) {
    const pulse = 1.1 + Math.sin(t * 4) * 0.05;
    for (const [c, r] of winLine) { const m = discs[c * L.rows + r]; if (m) m.scale.setScalar(pulse); }
    if (detailed()) {
      const glowK = 0.45 + 0.25 * (0.5 + 0.5 * Math.sin(t * 4));
      for (const [c, r] of winLine) {
        const m = discs[c * L.rows + r];
        const mat = m?.material as Any;
        if (mat && mat.emissiveIntensity != null) mat.emissiveIntensity = glowK;
      }
    }
  }
  // Slow drift of the key light: soft shimmer across the glass.
  if (detailed() && !reduced) key.position.set(KEY_POS.x + Math.sin(t * 0.35) * 0.5, KEY_POS.y + Math.cos(t * 0.27) * 0.3, KEY_POS.z);
  else key.position.copy(KEY_POS);
  stepParticles(dt);
}

// ------------------------------------------------------------------ public
/** The look for the frame's graphics tier; cheap when nothing changed. */
export function applyLook(next: Look): void {
  if (look && JSON.stringify(look) === JSON.stringify(next)) return;
  const prev = look;
  look = next;
  if (!built) build();
  const size = SHADOW_MAP[next.shadows];
  renderer.shadowMap.enabled = size > 0;
  key.castShadow = size > 0;
  if (size > 0) key.shadow.mapSize = size;
  if (next.reflections && !envTex) {
    try { envTex = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture; }
    catch (e) { console.warn(`environment: ${String(e)}`); }
  }
  scene.environment = next.reflections ? envTex : null;
  fill.intensity = (next.reflections ? 0.75 : 1.1) / PI;
  const b = next.budget;
  const nextPlate = plateMats[b.material] ?? plateMats.standard!;
  if (nextPlate !== plateMat) { plateMat = nextPlate; if (plate) plate.material = plateMat; }
  if (geoSegments !== b.segments) {
    buildRoundGeos(b.segments);
    if (sockets) sockets.geometry = socketGeo;
    if (holes) holes.geometry = holeGeo;
    if (plate) buildPlate();
  }
  if (builtNoise !== b.noise && next.detail === "detailed") {
    builtNoise = b.noise;
    const old = noiseTex;
    noiseTex = noiseTexture(b.noise);
    noiseTex.repeat.set(0.35, 0.35);
    for (const m of Object.values(plateMats)) m.bumpMap = noiseTex;
    old?.dispose();
  }
  if (!prev || prev.detail !== next.detail) applyDetail();
  applyBudgetMaterials();
  syncDiscs();
  // Post: GTAO contact darkening, bloom on the emissive winning line, sparkles and glints only
  // (threshold 2.1 in linear scene units, where lit disc faces peak near 2), the colour grade
  // (the old S-curve's slope, +10 % saturation, cool shadows / warm highlights) and FXAA / SMAA / MSAA.
  const hi = next.ao === "high";
  renderer.ao = next.ao === "off" ? null : {
    blendIntensity: 0.7, radius: 0.3, distanceExponent: 1.2, thickness: 0.5, scale: 1.0, samples: hi ? 16 : 8, resolution: b.aoRes,
    denoise: { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: hi ? 6 : 4, rings: 2, samples: hi ? 16 : 8, radiusExponent: 2 },
  };
  renderer.bloom = next.bloom ? { strength: 0.45, radius: 0.35, threshold: 2.1, resolution: b.bloomRes } : null;
  renderer.grade = next.grade ? {
    space: "display", contrast: 0.09, saturation: 1.1,
    shadows: [0.97, 0.99, 1.04], highlights: [1.03, 1.0, 0.97], split: [0.2, 0.8],
  } : null;
  renderer.antialias = next.antialias;
  applyBackdrop();
}

export function setTheme(t: Theme): void { theme = t; applyTheme(); }
export function setReducedMotion(v: boolean): void {
  if (reduced === v) return;
  reduced = v;
  if (v) { for (const [k, a] of anims) if (discs[k]) discs[k]!.position.y = a.target; anims.clear(); clearParticles(); syncDiscs(); }
}
export function setHighContrast(v: boolean): void { if (hc === v) return; hc = v; syncDiscs(); }
/** The board shows only on the play screen; elsewhere the scene is the page colour. */
export function setVisible(v: boolean): void {
  visible = v;
  boardGroup.visible = v;
  glow.visible = v && detailed();
  wallShadow.visible = v && !!look && SHADOW_MAP[look.shadows] > 0;
  applyBackdrop();
}
function applyBackdrop(): void { backdrop(visible && theme ? theme.palette.bg : 0x0e1424, !!look?.grade, bg); }
export function sync(state: State): void {
  if (!built) return;
  if (L.cols !== state.cols || L.rows !== state.rows) { snap = state; rebuild(state.cols, state.rows); }
  snap = state;
  applyBanned();
  syncDiscs();
}
export function setHover(c: number): void { hover = c; }
export function dropAnim(col: number, row: number): void {
  if (reduced) return;
  const k = col * L.rows + row;
  anims.set(k, { y: L.y(L.rows) + 1, v: 0, target: L.y(row) });
  if (discs[k]) discs[k]!.position.y = L.y(L.rows) + 1;
}
export function clearAnims(): void { anims.clear(); clearParticles(); syncDiscs(); }
/** A drop is still falling (play scripts and the HUD wait on settled boards). */
export function animating(): boolean { return anims.size > 0; }

export interface Rect { x: number; y: number; width: number; height: number }
let region: Rect = { x: 0, y: 0, width: 1, height: 1 };
let pxPerUnit = 1;
/** The board's columns in window pixels (the column widgets): `top`/`height` span the rows. */
export function columnRect(col: number): Rect {
  const cx = region.x + region.width / 2, cy = region.y + region.height / 2;
  return { x: cx + (L.x(col) - 0.5) * pxPerUnit, y: cy - (L.rows / 2) * CELL * pxPerUnit, width: CELL * pxPerUnit, height: L.rows * CELL * pxPerUnit };
}
/** The slab's rectangle in window pixels. */
export function slabRect(): Rect {
  const cx = region.x + region.width / 2, cy = region.y + region.height / 2;
  return { x: cx - (L.w / 2) * pxPerUnit, y: cy - (L.h / 2) * pxPerUnit, width: L.w * pxPerUnit, height: L.h * pxPerUnit };
}

/** Per frame: frame the board into `rect` (window pixels) of the W × H window, then animate. */
export function update(dtRaw: number, rect: Rect, W: number, H: number, paused: boolean): void {
  if (!built || !look) return;
  const dt = Math.min(0.05, Math.max(0, dtRaw || 0));
  if (W > 0 && H > 0 && rect.width > 0 && rect.height > 0) {
    region = rect;
    // Fit the whole board, preserving aspect (the old canvas's orthographic fit).
    const s = Math.min(rect.width / L.w, rect.height / L.h);
    pxPerUnit = s;
    const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
    // A symmetric frustum moved by the camera's position: the engine centres an orthographic
    // frustum on the camera (an asymmetric left/right/top/bottom shows as if symmetric;
    // reported), so the board's offset in the window is the camera's offset in the world.
    camera.left = -W / 2 / s; camera.right = W / 2 / s;
    camera.top = H / 2 / s; camera.bottom = -H / 2 / s;
    camera.position.set((W / 2 - cx) / s, (cy - H / 2) / s, 20);
    camera.updateProjectionMatrix();
    const vw = rect.width / s, vh = rect.height / s;
    wallShadow.scale.set(vw + 2, vh + 2, 1);
    glow.scale.set(vw, vh, 1);   // fades to nothing at the region's edges
    pMat.size = Math.max(4, 0.2 * s / Math.max(1, frameScale));
    // The shadow box fitted to the board and its drop shadow.
    key.shadow.distance = 30;
  }
  if (!paused && !reduced) time += dt;
  if (!paused || anims.size) step(paused ? dt : dt, time);
  hoverBar.visible = visible && hover >= 0 && hover < L.cols && !!snap && !snap.terminal;
  if (hoverBar.visible) hoverBar.position.set(L.x(hover), 0, 0.45);
  const landing = hoverBar.visible ? previewRow(hover) : -1;
  ghost.visible = landing >= 0;
  if (ghost.visible) {
    ghost.position.set(L.x(hover), L.y(landing), 0);
    ghostMat.color.setHex(discColor(snap!.current));
  }
}
let frameScale = 1;
/** The window's pixels per logical pixel (points size in logical pixels, as the old CSS ones). */
export function setFrameScale(s: number): void { frameScale = s || 1; }

// Landing row for the hover preview, or -1 for a full or sealed column.
function previewRow(c: number): number {
  if (!snap) return -1;
  const banned = snap.cfg?.bannedCols ?? [];
  const h = snap.heights[c]!;
  return banned.indexOf(c) === -1 && h >= 0 && h < L.rows ? h : -1;
}
