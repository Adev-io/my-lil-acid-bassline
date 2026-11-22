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

const cli = join(dirname(fileURLToPath(import.meta.url)), 'stem-test-run.mjs');
const run = (uvr, ...args) => spawnSync(process.execPath, [cli, ...args], { env: { ...process.env, STEM_TEST_UVR: uvr }, encoding: 'utf8' });

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

test('stem-test: an ear verdict that contains a pipe survives a rerun', () => {
  const { uvr, out } = crate();
  run(uvr, 'c', '04_hook');
  const md = join(out, 'results.md');
  writeFileSync(md, readFileSync(md, 'utf8').replace(/\| baseline \|  \|/, '| baseline | keep | close |'));
  const r = run(uvr, 'c', '04_hook');
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(md, 'utf8'), /\| \+0\.00 \| keep \| close \|/);
});

test('stem-test: a part that throws is skipped, the other parts are still written', () => {
  const { uvr, out } = crate();
  writeFileSync(join(uvr, 'crates', 'c', '3-guitar-04_hook-120bpm.wav'), '');
  const stem = '3-guitar-04_hook-120bpm';
  mkdirSync(join(uvr, 'notegrab', stem), { recursive: true });
  writeFileSync(join(uvr, 'notegrab', stem, stem + '.mid'), stemNotes([{ step: 300, note: 60, sec: 0.1 }], 120));   // 37.5 s: past bar 16
  const r = run(uvr, 'c', '04_hook');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /guitar: no notes in the first 16 bars, skipped/);
  const md = readFileSync(join(out, 'results.md'), 'utf8');
  assert.match(md, /\| bass \|/);
  assert.doesNotMatch(md, /\| guitar \|/);
});

test('stem-test: every part throwing stops with exit 2', () => {
  const { uvr } = crate();
  const stem = '2-bass-04_hook-120bpm';
  writeFileSync(join(uvr, 'notegrab', stem, stem + '.mid'), stemNotes([], 120));   // an empty .mid: no window holds a note
  const r = run(uvr, 'c', '04_hook');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /bass: .*, skipped/);
  assert.match(r.stderr, /no bass, guitar or other stem for section 04_hook/);
});

test('stem-test: a part in the baseline but not in this run fails the run', () => {
  const { uvr, out } = crate();
  run(uvr, 'c', '04_hook');
  const base = join(out, 'baseline.json'), b = JSON.parse(readFileSync(base, 'utf8'));
  b.rows.push({ ...b.rows[0], part: 'guitar' });
  writeFileSync(base, JSON.stringify(b));
  const r = run(uvr, 'c', '04_hook');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /guitar: in the baseline but not in this run/);
});

test('stem-test: a drop of exactly 0.05 passes, 0.06 fails', () => {
  const { uvr, out } = crate();
  run(uvr, 'c', '04_hook');
  const base = join(out, 'baseline.json'), b = JSON.parse(readFileSync(base, 'utf8'));
  b.rows[0].f1 = 1.05;
  writeFileSync(base, JSON.stringify(b));
  let r = run(uvr, 'c', '04_hook');
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(out, 'results.md'), 'utf8'), /\| -0\.05 \| /);
  b.rows[0].f1 = 1.06;
  writeFileSync(base, JSON.stringify(b));
  r = run(uvr, 'c', '04_hook');
  assert.equal(r.status, 1);
  assert.match(readFileSync(join(out, 'results.md'), 'utf8'), /-0\.06 FAIL \|/);
});

test('stem-test: two stems for one part stop the run before anything is written', () => {
  const { uvr, out } = crate();
  writeFileSync(join(uvr, 'crates', 'c', '2-bass-04_hook-121bpm.wav'), '');
  const r = run(uvr, 'c', '04_hook');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /more than one bass stem for 04_hook: 2-bass-04_hook-120bpm\.wav, 2-bass-04_hook-121bpm\.wav/);
  assert.ok(!existsSync(out));
});
