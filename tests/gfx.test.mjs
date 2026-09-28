// Graphics quality model (js/gfx.js): detection, resolution, overrides, clamps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, CATEGORIES, detectPreset, resolve, presetTier, choosePreset, describe } from '../js/gfx.js';

test('detectPreset maps GPU strings to tiers', () => {
  assert.equal(detectPreset('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), 'low');
  assert.equal(detectPreset('llvmpipe (LLVM 15.0.7, 256 bits)'), 'low');
  assert.equal(detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)'), 'high');
  assert.equal(detectPreset('Apple M2'), 'high');
  assert.equal(detectPreset('ANGLE (AMD, AMD Radeon RX 6700 XT)'), 'high');
  assert.equal(detectPreset('ANGLE (Intel, Intel(R) UHD Graphics 620)'), 'balanced');
  assert.equal(detectPreset('Mali-G78'), 'balanced');
  assert.equal(detectPreset(''), 'balanced');
  // Touch devices never auto-select above Balanced.
  assert.equal(detectPreset('Apple M1', { mobile: true }), 'balanced');
  assert.equal(detectPreset('SwiftShader', { mobile: true }), 'low');
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
