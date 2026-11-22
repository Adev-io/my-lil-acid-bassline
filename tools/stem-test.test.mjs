// tools/stem-test.test.mjs — the stem test CLI on a temp uvr-loops folder: no notegrab (the .mid is already there), no Rack.
// Author: Ari Klopfer / A_Development · MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stemNotes } from './fixtures.mjs';

const cli = join(dirname(fileURLToPath(import.meta.url)), 'stem-test.mjs');
const run = (uvr, ...args) => spawnSync(process.execPath, [cli, ...args], { env: { ...process.env, NODE_TEST_CONTEXT: '', STEM_TEST_UVR: uvr }, encoding: 'utf8' });

function crate() {
  const uvr = mkdtempSync(join(tmpdir(), 'stem-test-'));
  mkdirSync(join(uvr, 'crates', 'c'), { recursive: true });
  writeFileSync(join(uvr, 'crates', 'c', '2-bass-04_hook-120bpm.wav'), '');   // never opened: the .mid below exists
  const stem = '2-bass-04_hook-120bpm';
  mkdirSync(join(uvr, 'notegrab', stem), { recursive: true });
  writeFileSync(join(uvr, 'notegrab', stem, stem + '.mid'),
    stemNotes([{ step: 0, note: 40, sec: 0.1 }, { step: 4, note: 43, sec: 0.1 }, { step: 8, note: 45, sec: 0.1 }], 120));
  return { uvr, out: join(uvr, 'notegrab', 'stem-test', 'c-04_hook') };
}

test('stem-test: scores the bass, skips missing parts, writes results and the first baseline', () => {
  const { uvr, out } = crate();
  const r = run(uvr, 'c', '04_hook');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /no guitar stem for 04_hook: skipped/);
  assert.match(r.stderr, /no other stem for 04_hook: skipped/);
  const res = JSON.parse(readFileSync(join(out, 'results.json'), 'utf8'));
  assert.deepEqual(res.rows.map((x) => [x.part, x.window, x.f1, x.kept]), [['bass', 0, 1, 3]]);
  assert.ok(existsSync(join(out, 'baseline.json')));
  assert.ok(existsSync(join(out, 'bass-acid.json')));
  assert.match(readFileSync(join(out, 'results.md'), 'utf8'), /\| bass \| Acid Bass I-A5 \| 0 \| 1\.00 \| 3 \| 0 \| 0 \| \d+% \| baseline \|  \|/);
});

test('stem-test: a rerun keeps the ear column, compares with the baseline, and fails a drop over 0.05', () => {
  const { uvr, out } = crate();
  run(uvr, 'c', '04_hook');
  const md = join(out, 'results.md');
  writeFileSync(md, readFileSync(md, 'utf8').replace(/\| baseline \|  \|/, '| baseline | keep |'));
  let r = run(uvr, 'c', '04_hook');
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(md, 'utf8'), /\| \+0\.00 \| keep \|/);
  const base = join(out, 'baseline.json'), b = JSON.parse(readFileSync(base, 'utf8'));
  b.rows[0].f1 = 1.1;   // pretend the baseline scored higher: this run is 0.1 below it
  writeFileSync(base, JSON.stringify(b));
  r = run(uvr, 'c', '04_hook');
  assert.equal(r.status, 1);
  assert.match(readFileSync(md, 'utf8'), /-0\.10 FAIL \| keep \|/);
});

test('stem-test: bad arguments and a section with no stems stop with exit 2 and write nothing', () => {
  const { uvr, out } = crate();
  assert.equal(run(uvr, 'c').status, 2);
  assert.equal(run(uvr, 'c', '04_hook', '--loud').status, 2);
  const r = run(uvr, 'c', '09_verse');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no bass, guitar or other stem for section 09_verse/);
  assert.ok(!existsSync(out));
});
