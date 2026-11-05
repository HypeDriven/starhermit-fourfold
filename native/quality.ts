// The look per graphics level. The engine-owned effects (shadows and their
// map size, ambient occlusion, bloom, the grade, anti-aliasing) are the
// level's own (levelSettings(): the same table every StarHermit game reads).
// The game's art (materials, round-geometry LOD, the frosted-plate texture,
// reflections, detail, particles) is the browser build's four presets and
// their 60 FPS budgets (js/gfx.js before the port: TABLE, BUDGETS,
// PARTICLE_COUNT) keyed by the level's quality tier, with the spark budget
// scaled within the tier by the level's particle budget against the tier's
// anchor level (quantum, molecular, terrestrial, galactic), at most 2×. The
// runtime owns what the old Settings › Graphics panel did besides: Auto and
// the level choice, render scale and the pixel-ratio cap, adaptive
// resolution and the frame-rate limit and readout. The per-effect overrides
// of the old panel are gone with it.
import { levelSettings, type GraphicsLevel, type LevelSettings, type QualityTier } from "starhermit:engine";
import type { AntialiasMode } from "starhermit:scene";

export interface Budget {
  /** Discs, frame, sockets and markers: Lambert on Low, Standard above; clearcoated Physical chips and plate where "physical". */
  material: "lambert" | "standard" | "physical";
  /** Round-geometry LOD: multiplies the radial segments of discs, sockets, holes and plate holes. */
  segments: number;
  /** Frosted-plate bump texture size (px, within the level's largest texture). */
  noise: number;
  /** Multiplies landing-puff and win-sparkle counts. */
  sparks: number;
}
export interface Look {
  preset: QualityTier;
  /** The level's key-light shadow map size, 0 when the level draws no shadows. */
  shadows: number;
  /** The level's ambient occlusion (null: off). */
  ao: { resolution: number; samples: number; denoiseSamples: number } | null;
  /** The level's bloom resolution (null: off). */
  bloom: number | null;
  grade: boolean;
  antialias: AntialiasMode;
  reflections: boolean;
  detail: "plain" | "detailed";
  particles: "off" | "low" | "high";
  budget: Budget;
}

type Art = Pick<Look, "reflections" | "detail" | "particles">;
const ART: Record<QualityTier, Art> = {
  low: { reflections: false, detail: "plain", particles: "off" },
  balanced: { reflections: true, detail: "detailed", particles: "low" },
  high: { reflections: true, detail: "detailed", particles: "high" },
  ultra: { reflections: true, detail: "detailed", particles: "high" },
};
export const BUDGETS: Record<QualityTier, Budget> = {
  low: { material: "lambert", segments: 0.5, noise: 64, sparks: 0.5 },
  balanced: { material: "standard", segments: 0.75, noise: 128, sparks: 0.75 },
  high: { material: "physical", segments: 1, noise: 128, sparks: 1 },
  ultra: { material: "physical", segments: 1.5, noise: 256, sparks: 1.5 },
};
export const PARTICLE_COUNT: Record<"off" | "low" | "high", number> = { off: 0, low: 60, high: 160 };
export const MAX_PARTICLES = 480;
/** The level whose settings are each tier's preset. */
const ANCHOR: Record<QualityTier, GraphicsLevel> = { low: "quantum", balanced: "molecular", high: "terrestrial", ultra: "galactic" };

/** The look for a graphics level (the frame's by default). */
export function lookFor(s: LevelSettings = levelSettings()): Look {
  const preset = s.quality;
  // Sparks grow with the level's particle budget above the tier's anchor, at most 2×.
  const k = Math.min(2, s.particles / levelSettings(ANCHOR[preset]).particles);
  const b = BUDGETS[preset];
  return {
    preset, ...ART[preset],
    shadows: s.shadows ? s.shadowMapSize : 0,
    ao: s.ao && { resolution: s.ao.resolution, samples: s.ao.samples, denoiseSamples: s.ao.denoiseSamples },
    bloom: s.bloom ? s.bloom.resolution : null,
    grade: s.grade,
    // Engine 1.36.1 bug: antialias "off" recolours fog, haze and translucent overlays; the old Low's MSAA
    // stays until engine 1.36.2 (drop this clamp when pinning 1.36.2+).
    antialias: s.antialias === "off" ? "msaa" : s.antialias,
    budget: { ...b, noise: Math.min(b.noise, s.maxTextureSize), sparks: Math.round(b.sparks * k * 100) / 100 },
  };
}
