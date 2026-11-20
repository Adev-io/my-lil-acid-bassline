// tools/smf.test.mjs — the .mid reader: bytes to notes, notes to a step pattern, and back again.
// Author: Ari Klopfer / A_Development · MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load.mjs';
import { describe, notesToPattern, readSmf } from './smf.mjs';
import { smf, stemLike, tempo } from './fixtures.mjs';

const { T } = loadCore();
const plain = (v) => JSON.parse(JSON.stringify(v));
const demo = T.loadDemo(T.newState());
const note = (start, end, n, vel = 90) => ({ start, end, note: n, vel, channel: 0 });

test('readSmf: reads what patternsToMidi writes, in ticks and in seconds', () => {
  const m = readSmf(T.patternsToMidi([T.parsePattern('C* - E')], 120, 'x'));
  assert.deepEqual([m.ppq, m.bpm], [480, 120]);
  assert.deepEqual(plain(m.notes.map(({ start, end, note, vel, channel }) => ({ start, end, note, vel, channel }))), [
    { start: 0, end: 66, note: 36, vel: 127, channel: 0 },
    { start: 240, end: 306, note: 40, vel: 90, channel: 0 },
  ]);
  const secs = m.notes.flatMap((n) => [n.startSec, n.endSec]), want = [0, 0.06875, 0.25, 0.31875];
  secs.forEach((s, i) => assert.ok(Math.abs(s - want[i]) < 1e-9, 'second ' + i + ': ' + s));
});

test('readSmf: seconds follow the whole tempo map, not just the first tempo', () => {
  const m = readSmf(smf(480, [tempo(0, 120), tempo(480, 60), [960, 0x90, 36, 90], [1200, 0x80, 36, 0]]));
  assert.equal(m.bpm, 120);
  assert.ok(Math.abs(m.notes[0].startSec - 1.5) < 1e-9, 'one beat at 120 (0.5 s) then one at 60 (1 s)');
  assert.ok(Math.abs(m.notes[0].endSec - 2) < 1e-9);
  assert.ok(Math.abs(readSmf(smf(480, [[480, 0x90, 36, 90], [960, 0x80, 36, 0]])).notes[0].startSec - 0.5) < 1e-9, 'no tempo event is 120 bpm');
});

test('readSmf: format 1, a tempo track, running status and a note-on with velocity 0 as the note-off', () => {
  const bytes = Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, 0x01, 0xe0,
    0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 11, 0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20, 0, 0xff, 0x2f, 0,
    0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 12, 0, 0x90, 0x3c, 0x64, 0x83, 0x60, 0x3c, 0x00, 0, 0xff, 0x2f, 0,
  ]);
  const m = readSmf(bytes);
  assert.deepEqual([m.ppq, m.bpm], [480, 120]);
  assert.deepEqual(plain(m.notes), [{ start: 0, end: 480, note: 60, vel: 100, channel: 0, startSec: 0, endSec: 0.5 }]);
  assert.equal(readSmf(bytes, { track: 0 }).notes.length, 0, 'the tempo track has no notes');
});

test('readSmf: refuses what is not a usable MIDI file', () => {
  assert.throws(() => readSmf(Uint8Array.from([1, 2, 3])), /not a MIDI file/);
  const smpte = Uint8Array.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0xe7, 0x28]);
  assert.throws(() => readSmf(smpte), /SMPTE/);
});

test('round trip: every demo pattern goes to a .mid and back to the same .mid', () => {
  demo.patterns.slice(0, 6).forEach((p, i) => {
    const bytes = T.patternsToMidi([p], 120, 'x');
    const m = readSmf(bytes);
    const r = notesToPattern(m.notes, m.ppq, T, { steps: p.len });
    assert.deepEqual(plain([...T.patternsToMidi([r.pattern], 120, 'x')]), plain([...bytes]), 'pattern ' + i);
    assert.equal(r.report.dropped + r.report.folded + r.report.outside, 0, 'pattern ' + i + ' reads cleanly');
  });
});

test('round trip: the notation comes back as written when its spelling has one meaning', () => {
  for (const s of ['C* - E', 'C~ G -', 'C = -', 'A* - A A^ - A_* A - G~ A', "G# - C' -"]) {
    const p = T.parsePattern(s), m = readSmf(T.patternsToMidi([p], 120, 'x'));
    const text = T.formatPattern(notesToPattern(m.notes, m.ppq, T, { steps: p.len }).pattern);
    assert.equal(text, s === "G# - C' -" ? 'G# - C^ -' : s, s);   // C' and C^ are one pitch; the reader writes C^
  }
});

test('notesToPattern: without steps the length is the span rounded up to a multiple of 4', () => {
  assert.equal(notesToPattern([note(0, 60, 36), note(480, 540, 40)], 480, T).pattern.len, 8);
  assert.equal(notesToPattern([note(0, 60, 36)], 480, T).pattern.len, 4);
});

test('notesToPattern: a chord keeps its lowest note and counts the rest', () => {
  const r = notesToPattern([note(0, 60, 43), note(0, 60, 36), note(0, 60, 40)], 480, T, { steps: 4 });
  assert.equal(T.formatPattern(r.pattern), 'C - - -');
  assert.deepEqual(plain([r.report.read, r.report.kept, r.report.dropped]), [3, 1, 2]);
});

test('notesToPattern: notes outside MIDI 24-60 fold by octaves and are counted', () => {
  const r = notesToPattern([note(0, 60, 20), note(120, 180, 70)], 480, T, { steps: 4 });
  assert.equal(T.formatPattern(r.pattern), 'G#_ A#^ - -');   // tick 120 is step 2 of 4 at 480 PPQ: index 1
  assert.equal(r.report.folded, 2);
});

test('notesToPattern: the report names the largest snap to the grid, and a little looseness is no warning', () => {
  const r = notesToPattern([note(10, 70, 36), note(130, 190, 38)], 480, T, { steps: 4 });
  assert.ok(Math.abs(r.report.maxSnap - 10 / 120) < 1e-9);
  assert.equal(r.report.offGrid, false);
  assert.match(describe(r.report), /largest snap to the grid 8% of a step$/);
});

const LINE = 'A* - A A^ - A_* A - G A - A* - C^ - E';   // demo 1 without its slides: a transcription cannot show an overlap

test('a stem at its placeholder tempo: snapping on ticks scrambles it, and the report says the grid is wrong', () => {
  const m = readSmf(stemLike(T, LINE, 128));
  assert.deepEqual([m.ppq, m.bpm], [220, 120]);
  const r = notesToPattern(m.notes, m.ppq, T, { steps: 16 });
  assert.notEqual(T.formatPattern(r.pattern), LINE);
  assert.equal(r.report.offGrid, true);
  assert.match(describe(r.report), /warning: the notes sit \d+% of a step off this grid.*--grid-bpm/);
  assert.ok(r.report.dropped > 0, 'scrambling also lands two notes on one step');
});

test('the same stem with gridBpm, the song\'s real tempo, comes back exactly', () => {
  const m = readSmf(stemLike(T, LINE, 128));
  const r = notesToPattern(m.notes, m.ppq, T, { steps: 16, gridBpm: 128 });
  assert.equal(T.formatPattern(r.pattern), LINE);
  assert.equal(r.report.offGrid, false);
});

test('gridBpm with startSec: a stem whose step 1 is half a second in, played 8 ms loose', () => {
  const m = readSmf(stemLike(T, LINE, 128, 0.5, 8));
  assert.notEqual(T.formatPattern(notesToPattern(m.notes, m.ppq, T, { steps: 16, gridBpm: 128 }).pattern), LINE, 'without startSec the grid is shifted');
  const r = notesToPattern(m.notes, m.ppq, T, { steps: 16, gridBpm: 128, startSec: 0.5 });
  assert.equal(T.formatPattern(r.pattern), LINE);
  assert.ok(r.report.maxSnap < 0.1, 'the 8 ms wobble is under a tenth of a step at 128 bpm');
  assert.throws(() => notesToPattern(m.notes, m.ppq, T, { gridBpm: 0 }), /--grid-bpm must be a positive number/);
});

test('notesToPattern: past 32 steps is an error that names the window options; steps and offset pick a window', () => {
  const long = [note(0, 60, 36), note(40 * 120, 40 * 120 + 60, 40)];
  assert.throws(() => notesToPattern(long, 480, T), /more than 32 steps \(41\).*--offset.*--steps/);
  const r = notesToPattern(long, 480, T, { offset: 40, steps: 4 });
  assert.equal(T.formatPattern(r.pattern), 'E - - -');
  assert.equal(r.report.outside, 1);
  assert.throws(() => notesToPattern(long, 480, T, { steps: 33 }), /1 to 32/);
});

test('notesToPattern: nothing to read is an error, not an empty pattern', () => {
  assert.throws(() => notesToPattern([], 480, T), /no notes/);
  assert.throws(() => notesToPattern([note(0, 60, 36)], 480, T, { offset: 8 }), /no notes after/);
  assert.throws(() => notesToPattern([note(2400, 2460, 36)], 480, T, { steps: 4 }), /no notes inside the window/);
});