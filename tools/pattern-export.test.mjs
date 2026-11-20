// tools/pattern-export.test.mjs — the command line: inputs, targets, and the ways it refuses.
// Author: Ari Klopfer / A_Development · MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCore } from './load.mjs';
import { stemLike } from './fixtures.mjs';

const { T } = loadCore();
const CLI = join(dirname(fileURLToPath(import.meta.url)), 'pattern-export.mjs');
const dir = mkdtempSync(join(tmpdir(), 'pattern-export-'));
const run = (...args) => { const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const put = (name, data) => { const f = join(dir, name); writeFileSync(f, data); return f; };

test('an exported .txt goes to Strudel with its own tempo', () => {
  const f = put('I-A1.txt', '# I-A1  3 steps  140 bpm\n# sound: cutoff 45%\n# notation: C..B note\nA* - A\n');
  const r = run(f, '--to', 'strudel');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^\/\/ I-A1 · 3 steps · 140 bpm\nsetcps\(140\/60\/0\.75\)\nnote\("a2 ~ a2"\)\n/);
});

test('--bpm beats the file, and pattern JSON works as input', () => {
  const f = put('p.json', JSON.stringify(T.parsePattern('C - E')));
  const r = run(f, '--to', 'strudel', '--bpm', '100', '--name', 'mine');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^\/\/ mine · 3 steps · 100 bpm\n/);
});

test('a .mid goes to notation, with the read report on stderr', () => {
  const f = put('x.mid', T.patternsToMidi([T.parsePattern('C* - E')], 120, 'x'));
  const r = run(f, '--to', 'notation', '--steps', '3');
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, 'C* - E\n');
  assert.match(r.err, /read 2 notes: 2 kept, 0 dropped/);
});

test('a basic-pitch stem: flagged without --grid-bpm, exact with it, and the output tempo follows it', () => {
  const line = 'A* - A A^ - A_* A - G A - A* - C^ - E';
  const f = put('stem.mid', stemLike(T, line, 128, 0.5));
  const blind = run(f, '--to', 'notation', '--steps', '16');
  assert.equal(blind.code, 0, blind.err);
  assert.notEqual(blind.out, line + '\n');
  assert.match(blind.err, /placeholder tempo \(120 bpm at 220 PPQ\)/);
  assert.match(blind.err, /warning: the notes sit \d+% of a step off this grid/);
  const told = run(f, '--to', 'notation', '--steps', '16', '--grid-bpm', '128', '--start', '0.5');
  assert.equal(told.out, line + '\n');
  assert.doesNotMatch(told.err, /placeholder|warning/);
  assert.match(run(f, '--to', 'strudel', '--steps', '16', '--grid-bpm', '128', '--start', '0.5').out, /^\/\/ stem · 16 steps · 128 bpm\n/);
});

test('nubass writes a .mid, wants --out, and will not overwrite without --force', () => {
  const f = put('I-A2.txt', 'C* - E\n'), out = join(dir, 'nubass.mid');
  assert.match(run(f, '--to', 'nubass').err, /give --out/);
  assert.equal(run(f, '--to', 'nubass', '--out', out).code, 0);
  assert.ok(existsSync(out));
  const again = run(f, '--to', 'nubass', '--out', out);
  assert.equal(again.code, 1);
  assert.match(again.err, /exists: pass --force/);
  assert.equal(run(f, '--to', 'nubass', '--out', out, '--force').code, 0);
  assert.equal(Buffer.from(readFileSync(out)).toString('latin1', 0, 4), 'MThd');
});

test('bad input exits 1 with the reason', () => {
  assert.match(run(put('bad.txt', 'C H E\n'), '--to', 'strudel').err, /bad step "H"/);
  assert.match(run(put('ok.txt', 'C\n'), '--to', 'wav').err, /unknown target "wav": use strudel, nubass, notation/);
  assert.match(run('--to', 'strudel').err, /usage:/);
  assert.match(run(join(dir, 'missing.txt'), '--to', 'strudel').err, /ENOENT/);
  for (const r of [run(put('ok2.txt', 'C\n'), '--to', 'wav'), run(put('bad2.txt', 'Z\n'), '--to', 'strudel')]) assert.equal(r.code, 1);
});
