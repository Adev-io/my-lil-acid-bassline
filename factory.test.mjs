// factory.test.mjs — the 64 factory bass patterns parse, loop, and are all different.
// Author: Ari Klopfer / A_Development
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const dir = dirname(fileURLToPath(import.meta.url));
const sandbox = { TextEncoder }; sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
vm.runInContext(readFileSync(join(dir, 'acidbass.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(dir, 'factory.js'), 'utf8'), ctx);
const T = sandbox.TB303, list = sandbox.TB303Factory.list;

const STYLES = [['Funk', 13], ['Disco', 13], ['House', 13], ['Tech House', 12], ['Melodic', 13]];
const names = STYLES.flatMap(([s, n]) => Array.from({ length: n }, (_, i) => `${s} ${String(i + 1).padStart(2, '0')}`));

test('64 entries named per style in order', () => {
  assert.equal(list.length, 64);
  assert.deepEqual([...list.map((p) => p.name)], names);   // spread: the vm array is from another realm
});

test('every pattern parses, is 8..32 steps with at least 4 notes', () => {
  for (const { name, steps } of list) {
    const p = T.parsePattern(steps);
    assert.ok(p.len >= 8 && p.len <= 32, `${name} length ${p.len}`);
    assert.ok(p.steps.slice(0, p.len).filter((s) => s.gate === 'note').length >= 4, `${name} too few notes`);
  }
});

test('all 64 patterns are distinct', () => {
  assert.equal(new Set(list.map((p) => p.steps)).size, 64);
});

test('format(parse(x)) round-trips', () => {
  for (const { name, steps } of list) {
    const p = T.parsePattern(steps);
    assert.equal(T.formatPattern(p), steps, name);
    assert.deepEqual(T.parsePattern(T.formatPattern(p)), p, name);
  }
});

test('a tie never opens a pattern and a slide is followed by a note or tie (loops cleanly)', () => {
  for (const { name, steps } of list) {
    const t = steps.split(' ');
    assert.notEqual(t[0], '=', `${name} starts on a tie`);
    t.forEach((tok, i) => {
      if (tok === '=') assert.notEqual(t[i - 1], '-', `${name} tie after rest at ${i}`);
    });
  }
});
