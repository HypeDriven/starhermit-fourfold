// Graphics quality model (js/gfx.js): detection, resolution, overrides, clamps.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESETS, CATEGORIES, detectPreset, resolve, presetTier, choosePreset, describe,
  LEVELS, BUDGETS, MAX_PARTICLES, budget, particleCount, detectLevel, presetForLevel,
} from '../js/gfx.js';
import { createRequire } from 'node:module';
// js/gpu-level.js is a classic script in the page; in Node (CommonJS here) it exports the same API.
globalThis.StarHermitGpu = createRequire(import.meta.url)('../js/gpu-level.js');

test('hardware level picks the Auto preset (StarHermit gpu-level.js)', () => {
  assert.equal(detectPreset('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), 'low');
  assert.equal(detectPreset('llvmpipe (LLVM 15.0.7, 256 bits)'), 'low');
  assert.equal(detectPreset('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'low');
  assert.equal(detectPreset('ANGLE (Intel, Intel(R) UHD Graphics 620)'), 'low');
  assert.equal(detectPreset('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)'), 'balanced');
  assert.equal(detectPreset('ANGLE (NVIDIA, NVIDIA GeForce GTX 1070 Direct3D11 vs_5_0 ps_5_0)'), 'high');
  assert.equal(detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0)'), 'ultra');
  assert.equal(detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0)'), 'ultra');
  assert.equal(detectLevel('NVIDIA GeForce RTX 5090'), 20);
  assert.equal(detectLevel('SwiftShader'), 0);
  for (const [p, lv] of Object.entries(LEVELS)) assert.equal(presetForLevel(lv), p);
  assert.equal(presetForLevel(9), 'balanced');
  assert.equal(presetForLevel(16), 'high');
  // Phones and tablets are Balanced at most.
  assert.ok(['low', 'balanced'].includes(detectPreset('Adreno (TM) 740', { mobile: true })));
  assert.equal(detectPreset('NVIDIA GeForce RTX 5090', { mobile: true }), 'balanced');
  assert.equal(detectPreset('SwiftShader', { mobile: true }), 'low');
});

test('per-preset budgets are explicit, grow from Low to Ultra and scale with the level', () => {
  const keys = ['material', 'segments', 'noise', 'sparks', 'bloomRes', 'aoRes'];
  for (const p of PRESETS) for (const k of keys) assert.ok(k in BUDGETS[p], `${p}.${k}`);
  for (let i = 1; i < PRESETS.length; i++) {
    const a = BUDGETS[PRESETS[i - 1]], b = BUDGETS[PRESETS[i]];
    for (const k of keys.slice(1)) assert.ok(b[k] >= a[k], `${PRESETS[i]}.${k}`);
  }
  assert.equal(BUDGETS.low.material, 'lambert');
  assert.equal(BUDGETS.balanced.material, 'standard');
  assert.equal(BUDGETS.high.material, 'physical');
  assert.deepEqual(budget('high', 10), BUDGETS.high);
  assert.ok(budget('high', 14).sparks > BUDGETS.high.sparks);
  assert.ok(budget('ultra', 20).sparks <= BUDGETS.ultra.sparks * 2);
  assert.ok(budget('ultra', 2).sparks < BUDGETS.ultra.sparks);
  assert.ok(particleCount('high', budget('ultra', 20)) <= MAX_PARTICLES);
  assert.equal(particleCount('off', BUDGETS.ultra), 0);
  assert.deepEqual(resolve({ preset: 'low' }, 'low', 0).budget, BUDGETS.low);
  assert.equal(resolve({}, 'ultra', 20).level, 20);
});

test('resolve: Auto follows detection; explicit preset wins', () => {
  const a = resolve({}, 'low');
  assert.equal(a.preset, 'low');
  assert.equal(a.auto, true);
  assert.equal(a.post, false, 'Low needs no post-processing');
  assert.equal(a.detail, 'plain');
  assert.equal(a.dprCap, 1);
  const h = resolve({ preset: 'high' }, 'low');
  assert.equal(h.preset, 'high');
  assert.equal(h.auto, false);
  assert.equal(h.shadows, 'medium');
  assert.equal(h.post, true);
  assert.equal(resolve({ preset: 'bogus' }, undefined).preset, 'balanced');
});

test('resolve: per-category overrides and invalid values', () => {
  const r = resolve({ preset: 'high', shadows: 'off', bloom: 'nope', particles: 'low' }, 'low');
  assert.equal(r.shadows, 'off');
  assert.equal(r.bloom, 'on', 'invalid tier falls back to the preset');
  assert.equal(r.particles, 'low');
  for (const p of PRESETS)
    for (const [cat, tiers] of Object.entries(CATEGORIES))
      assert.ok(tiers.includes(presetTier(p, cat)), `${p}.${cat}`);
});

test('resolve: render scale is clamped to 50–200% and multiplies the preset scale', () => {
  assert.equal(resolve({ preset: 'high', render_scale: 5 }).scale, 2);
  assert.equal(resolve({ preset: 'high', render_scale: 0.1 }).scale, 0.5);
  assert.equal(resolve({ preset: 'ultra', render_scale: 1 }).scale, 1.25);
  assert.equal(resolve({ preset: 'high' }).adaptive, true);
  assert.equal(resolve({ preset: 'high', adaptive: false, show_fps: true }).showFps, true);
});

test('choosing a preset clears overrides but keeps scale and toggles', () => {
  const s = choosePreset({ preset: 'high', shadows: 'off', ao: 'high', render_scale: 1.5, show_fps: true }, 'ultra');
  assert.deepEqual(s, { preset: 'ultra', render_scale: 1.5, show_fps: true });
  assert.equal(resolve(s).shadows, 'high');
  assert.equal(choosePreset({}, 'auto').preset, 'auto');
});

test('describe summarizes cost', () => {
  const d = describe(resolve({ preset: 'low' }), [800, 600]);
  assert.match(d, /no shadows/);
  assert.match(d, /MSAA/);
  assert.match(d, /800×600 px/);
});
