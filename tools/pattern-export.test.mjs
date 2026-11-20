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
import { smf, stemLike } from './fixtures.mjs';

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

test('numbers: --bpm and --grid-bpm from 20 to 999, --steps, --offset and --track whole', () => {
  const f = put('nums.txt', 'C - E\n'), mid = put('nums.mid', T.patternsToMidi([T.parsePattern('C - E')], 120, 'x'));
  for (const v of ['-120', '0.5', '1e9']) {
    const r = run(f, '--to', 'strudel', '--bpm', v);
    assert.equal(r.code, 1, v);
    assert.match(r.err, /^--bpm must be a number from 20 to 999\n$/, v);
  }
  assert.match(run(mid, '--to', 'notation', '--grid-bpm', '5').err, /^--grid-bpm must be a number from 20 to 999\n$/);
  for (const flag of ['--steps', '--offset', '--track']) {
    const r = run(mid, '--to', 'notation', flag, '3.5');
    assert.equal(r.code, 1, flag);
    assert.match(r.err, new RegExp('^' + flag + ' must be a whole number\n$'), flag);
  }
});

test('a .txt takes its tempo from the exported header form only', () => {
  const r = run(put('acid.txt', '# Acid 128 bpm - I-A1  4 steps  140 bpm\nA* - A C^\n'), '--to', 'strudel');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^\/\/ acid · 4 steps · 140 bpm\n/);
});

// bass A A C^ A on channel 1 (index 0), kick and hat on channel 10 (index 9)
const BASS = [[0, 0x90, 45, 90], [66, 0x80, 45, 0], [120, 0x90, 45, 90], [186, 0x80, 45, 0], [240, 0x90, 48, 90], [306, 0x80, 48, 0], [360, 0x90, 45, 90], [426, 0x80, 45, 0]];
const DRUMS = [[0, 0x99, 36, 100], [60, 0x89, 36, 0], [120, 0x99, 42, 100], [180, 0x89, 42, 0], [240, 0x99, 36, 100], [300, 0x89, 36, 0], [360, 0x99, 42, 100], [420, 0x89, 42, 0]];

test('a .mid: notes on channel 10 are drums, skipped and counted', () => {
  const r = run(put('drums.mid', smf(480, [...BASS, ...DRUMS])), '--to', 'notation', '--steps', '4');
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, 'A A C^ A\n');
  assert.match(r.err, /skipped 4 notes on channel 10 \(drums\)/);
});

test('a .mid whose notes come from two tracks says to pick one; --track picks it', () => {
  const a = smf(480, BASS), b = smf(480, [[0, 0x90, 40, 90], [66, 0x80, 40, 0]]);
  const two = Uint8Array.from([...a.slice(0, 8), 0, 1, 0, 2, ...a.slice(12, 14), ...a.slice(14), ...b.slice(14)]);
  const f = put('two.mid', two);
  assert.match(run(f, '--to', 'notation', '--steps', '4').err, /notes come from 2 tracks; pick one with --track \(0-based\)/);
  const r = run(f, '--to', 'notation', '--steps', '4', '--track', '0');
  assert.equal(r.out, 'A A C^ A\n');
  assert.doesNotMatch(r.err, /tracks/);
});

test('flags: an unknown one, a flag where a value goes, and --start without --grid-bpm exit 1', () => {
  const f = put('flags.txt', 'C - E\n'), mid = put('flags.mid', T.patternsToMidi([T.parsePattern('C - E')], 120, 'x'));
  const cases = [
    [[f, '--to', 'notation', '--stpes', '4'], /^unknown option --stpes\n$/],
    [[f, '--to', 'nubass', '--out', '--force'], /^--out needs a value\n$/],
    [[mid, '--to', 'notation', '--start', '0.25'], /^--start needs --grid-bpm\n$/],
  ];
  for (const [args, want] of cases) {
    const r = run(...args);
    assert.equal(r.code, 1, args.join(' '));
    assert.match(r.err, want, args.join(' '));
  }
  assert.equal(existsSync('--force'), false, 'no file named --force');
});

test('a .txt with no steps in it exits 1 and says so', () => {
  for (const text of ['', '# I-A1  4 steps  140 bpm\n# sound: cutoff 45%\n']) {
    const r = run(put('empty.txt', text), '--to', 'strudel');
    assert.equal(r.code, 1, JSON.stringify(text));
    assert.match(r.err, /^no steps in the file\n$/, JSON.stringify(text));
  }
});
