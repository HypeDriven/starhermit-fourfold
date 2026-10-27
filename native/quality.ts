// The look per graphics level: the browser build's four presets and their
// 60 FPS budgets (js/gfx.js before the port: TABLE, BUDGETS, SHADOW_MAP,
// PARTICLE_COUNT) keyed by the runtime's quality tier (frame().quality),
// with the spark budget scaled within the tier by the level
// (frame().levelIndex) as the browser build scaled it by its hardware level
// (≤ 2×). The runtime owns what the old Settings › Graphics panel did
// besides: Auto and the level choice, render scale and the pixel-ratio cap,
// adaptive resolution, the frame-rate limit and readout, and the shadow map
// size it holds to the level. The per-effect overrides of the old panel are
// gone with it.
import type { QualityTier } from "starhermit:engine";
import type { AntialiasMode } from "starhermit:scene";

export interface Budget {
  /** Discs, frame, sockets and markers: Lambert on Low, Standard above; clearcoated Physical chips and plate where "physical". */
  material: "lambert" | "standard" | "physical";
  /** Round-geometry LOD: multiplies the radial segments of discs, sockets, holes and plate holes. */
  segments: number;
  /** Frosted-plate bump texture size (px). */
  noise: number;
  /** Multiplies landing-puff and win-sparkle counts. */
  sparks: number;
  bloomRes: number;
  aoRes: number;
}
export type Shadows = "off" | "low" | "medium" | "high";
export interface Look {
  preset: QualityTier;
  shadows: Shadows;
  ao: "off" | "on" | "high";
  bloom: boolean;
  grade: boolean;
  antialias: AntialiasMode;
  reflections: boolean;
  detail: "plain" | "detailed";
  particles: "off" | "low" | "high";
  budget: Budget;
}

const TABLE: Record<QualityTier, Omit<Look, "preset" | "budget">> = {
  low: { shadows: "off", ao: "off", bloom: false, grade: false, antialias: "msaa", reflections: false, detail: "plain", particles: "off" },
  balanced: { shadows: "low", ao: "off", bloom: true, grade: true, antialias: "fxaa", reflections: true, detail: "detailed", particles: "low" },
  high: { shadows: "medium", ao: "on", bloom: true, grade: true, antialias: "smaa", reflections: true, detail: "detailed", particles: "high" },
  ultra: { shadows: "high", ao: "high", bloom: true, grade: true, antialias: "msaa", reflections: true, detail: "detailed", particles: "high" },
};
export const BUDGETS: Record<QualityTier, Budget> = {
  low: { material: "lambert", segments: 0.5, noise: 64, sparks: 0.5, bloomRes: 0.5, aoRes: 0.5 },
  balanced: { material: "standard", segments: 0.75, noise: 128, sparks: 0.75, bloomRes: 0.5, aoRes: 0.5 },
  high: { material: "physical", segments: 1, noise: 128, sparks: 1, bloomRes: 0.5, aoRes: 0.5 },
  ultra: { material: "physical", segments: 1.5, noise: 256, sparks: 1.5, bloomRes: 1, aoRes: 1 },
};
export const SHADOW_MAP: Record<Shadows, number> = { off: 0, low: 512, medium: 1024, high: 2048 };
export const PARTICLE_COUNT: Record<"off" | "low" | "high", number> = { off: 0, low: 60, high: 160 };
export const MAX_PARTICLES = 480;
/** The first level index of each tier (quantum, molecular, terrestrial, galactic). */
const TIER_FLOOR: Record<QualityTier, number> = { low: 0, balanced: 2, high: 4, ultra: 7 };

/** The look for a quality tier at a level index (0 quantum … 9 infinite). */
export function lookFor(preset: QualityTier, levelIndex: number): Look {
  // Levels are about 1.64× apart in GPU throughput; sparks grow at most 2× within a tier.
  const k = Math.min(2, Math.pow(1.64, Math.max(0, levelIndex - TIER_FLOOR[preset])));
  const b = BUDGETS[preset];
  return { preset, ...TABLE[preset], budget: { ...b, sparks: Math.round(b.sparks * k * 100) / 100 } };
}
