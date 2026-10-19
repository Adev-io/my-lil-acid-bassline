// ui-bridge.test.mjs — the id mapping between the web knobs and the plugin's parameters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const sb = { TextEncoder }; sb.window = sb;
const ctx = vm.createContext(sb);
vm.runInContext(read('./acidbass.js'), ctx);
vm.runInContext(read('./ui-bridge.js'), ctx);   // no window.__JUCE__, so only the mapping is set up
const M = sb.PluginMap;

test('mapping is exported without a plugin around', () => {
  assert.ok(M && typeof M.idOf === 'function' && Array.isArray(M.NONE));
});

test('three knobs use the plugin real units and round-trip', () => {
  for (const k of ['tuning', 'cutoff', 'fdec'])
    for (const v of [0, 0.25, 0.5, 0.9, 1]) assert.ok(Math.abs(M.fromPlugin(k, M.toPlugin(k, v)) - v) < 1e-9, `${k} ${v}`);
  assert.equal(M.idOf('fdec'), 'decay');
  assert.equal(M.idOf('hp'), 'hp');
});

test('the real-unit ends sit inside the plugin ranges (cutoff 60..8000, tuning -100..100, decay 0.03..2.5)', () => {
  assert.ok(M.toPlugin('cutoff', 0) >= 60 && M.toPlugin('cutoff', 1) <= 8000);
  assert.ok(Math.abs(M.toPlugin('tuning', 0) + 100) < 1e-9 && Math.abs(M.toPlugin('tuning', 1) - 100) < 1e-9);
  assert.ok(M.toPlugin('fdec', 0) >= 0.03 - 1e-9 && M.toPlugin('fdec', 1) <= 2.5);
});

test('a host value past the web knob range clamps instead of leaving 0..1', () => {
  assert.equal(M.fromPlugin('cutoff', 8000), 1);
  assert.equal(M.fromPlugin('cutoff', 10), 0);
});

test('0..1 knobs pass through untouched', () => {
  assert.equal(M.toPlugin('res', 0.3), 0.3);
  assert.equal(M.fromPlugin('drmix', 0.7), 0.7);
});

test('every web knob either has a real plugin parameter or is listed as NONE, and NONE names real knobs', () => {
  const html = read('./index.html'), cpp = read('./plugin/Source/PluginProcessor.cpp');
  const body = html.slice(html.indexOf('const KNOBDEF = ['), html.indexOf('const knobUI'));
  const keys = [...body.matchAll(/^\s*\['(\w+)', '/gm)].map((m) => m[1]);
  assert.ok(keys.length > 30, 'found the knob table');
  for (const k of keys) {
    if (M.NONE.includes(k)) continue;
    assert.ok(new RegExp(`["']${M.idOf(k)}["']`).test(cpp), `no plugin parameter "${M.idOf(k)}" for the web knob "${k}"`);
  }
  for (const k of M.NONE) assert.ok(keys.includes(k), `NONE lists "${k}" but the page has no such knob`);
});

test('the switches the bridge carries exist in the plugin', () => {
  const cpp = read('./plugin/Source/PluginProcessor.cpp');
  for (const id of ['wave', 'dron', 'drtype', 'rvon', 'dpp', 'swing', 'seqon']) assert.ok(new RegExp(`["']${id}["']`).test(cpp), id);
});

test('fitZoom scales the page down to the window and never up', () => {
  assert.equal(M.fitZoom(1000, 1000), 1);
  assert.equal(M.fitZoom(402.5, 900), 0.5);
  assert.equal(M.fitZoom(1000, 495), 0.5);
  assert.equal(M.fitZoom(10, 10), 0.3);
});

test('only tempo is left without a plugin parameter (swing and seqon are switches, gate is real)', () => {
  assert.equal(JSON.stringify(M.NONE), '["tempo"]');
});

test('slot labels are 1-based; factory slots carry the name, the rest are User', () => {
  const list = [{ name: 'Funk 01' }, { name: 'Funk 02' }];
  assert.equal(M.slotLabel(0, list), '01 Funk 01');
  assert.equal(M.slotLabel(1, list), '02 Funk 02');
  assert.equal(M.slotLabel(69, list), '70 User');
  assert.equal(M.slotLabel(127, list), '128 User');
  assert.equal(M.BANK, 128); assert.equal(M.FACTORY, 64);
});

test('isBase compares pattern content, not identity', () => {
  const a = sb.TB303.emptyPattern(), b = sb.TB303.emptyPattern();
  assert.ok(M.isBase(a, b));
  b.steps[0].gate = 1;
  assert.ok(!M.isBase(a, b));
});
