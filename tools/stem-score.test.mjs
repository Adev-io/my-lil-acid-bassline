// tools/stem-score.test.mjs — the stem test's score and conversions.
// Author: Ari Klopfer / A_Development · MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load.mjs';
import { readSmf } from './smf.mjs';
import { stemNotes } from './fixtures.mjs';
import { bestBassWindow, f1Score, patternOnsets, rollPart, stemOnsets } from './stem-score.mjs';

const { T } = loadCore();

test('f1Score: a part scored against itself is 1, a semitone off is 0, an octave off still hits', () => {
  const stem = [{ pos: 0, note: 36 }, { pos: 2, note: 40 }, { pos: 4, note: 43 }];
  assert.equal(f1Score(stem, stem).f1, 1);
  assert.deepEqual(f1Score(stem, stem.map((o) => ({ ...o, note: o.note + 1 }))), { f1: 0, kept: 0, dropped: 3, extra: 3 });
  assert.equal(f1Score(stem, stem.map((o) => ({ ...o, note: o.note + 12 }))).f1, 1);
});

test('f1Score: half a step is the tolerance, each part note hits once, empty sides score 0', () => {
  assert.equal(f1Score([{ pos: 0.5, note: 36 }], [{ pos: 0, note: 36 }]).f1, 1);
  assert.equal(f1Score([{ pos: 0.51, note: 36 }], [{ pos: 0, note: 36 }]).f1, 0);
  assert.deepEqual(f1Score([{ pos: 0, note: 36 }, { pos: 0.2, note: 36 }], [{ pos: 0, note: 36 }]), { f1: 2 / 3, kept: 1, dropped: 1, extra: 0 });
  assert.equal(f1Score([], [{ pos: 0, note: 36 }]).f1, 0);
  assert.equal(f1Score([{ pos: 0, note: 36 }], []).f1, 0);
});

test('stemOnsets: seconds to 16th steps at the bpm, from startSec', () => {
  assert.deepEqual(stemOnsets([{ startSec: 0.25, note: 40 }, { startSec: 1.5, note: 43 }], 120, 0.5), [{ pos: -2, note: 40 }, { pos: 8, note: 43 }]);
});

test('patternOnsets: note steps at offset + step; ties and same-pitch slides write no new onset', () => {
  const p = T.emptyPattern();
  p.len = 8;
  p.steps[0] = { gate: 'note', note: 0, oct: 0, accent: false, slide: true };
  p.steps[1] = { gate: 'note', note: 0, oct: 0, accent: false, slide: false };   // slid into from step 0, same pitch
  p.steps[2] = { gate: 'note', note: 4, oct: -1, accent: false, slide: false };
  p.steps[3] = { gate: 'tie', note: 0, oct: 0, accent: false, slide: false };
  p.steps[5] = { gate: 'note', note: 12, oct: 1, accent: true, slide: false };
  assert.deepEqual(patternOnsets(p, 32), [{ pos: 32, note: 36 }, { pos: 34, note: 28 }, { pos: 37, note: 60 }]);
});

test('bestBassWindow: a pattern the app wrote, read back at its own tempo, scores 1 (spec check 1)', () => {
  const m = readSmf(T.patternsToMidi([T.parsePattern('C - E - G - A - C - E - G - A -')], 120, 'x'));
  const w = bestBassWindow(m.notes, T, 120);
  assert.equal(w.offset, 0);
  assert.equal(w.score.f1, 1);
  assert.equal(w.score.kept, 8);
});

test('bestBassWindow: a phrase at step 32 of an otherwise empty stem is found at offset 32 (spec check 3)', () => {
  const m = readSmf(stemNotes([{ step: 32, note: 40, sec: 0.1 }, { step: 36, note: 43, sec: 0.1 }, { step: 40, note: 45, sec: 0.1 }], 89));
  const w = bestBassWindow(m.notes, T, 89);
  assert.equal(w.offset, 32);
  assert.equal(w.score.f1, 1);
  assert.equal(w.pattern.steps[0].gate, 'note');
});

test('bestBassWindow: the window with the better score wins, a tie goes to the earlier window', () => {
  // window 0: two notes on one step (the reader keeps the lowest, F1 2/3); window 32: two clean notes (F1 1)
  const m = readSmf(stemNotes([
    { step: 0, note: 40, sec: 0.1 }, { step: 0, note: 47, sec: 0.1 },
    { step: 32, note: 40, sec: 0.1 }, { step: 34, note: 43, sec: 0.1 },
  ], 100));
  assert.equal(bestBassWindow(m.notes, T, 100).offset, 32);
  const same = readSmf(stemNotes([{ step: 0, note: 40, sec: 0.1 }, { step: 32, note: 40, sec: 0.1 }], 100));
  assert.equal(bestBassWindow(same.notes, T, 100).offset, 0);
});

test('rollPart: notes snapped to 16ths at 96 PPQ, one per start + pitch, velocity 0-1, scored against the stem', () => {
  const n = (startSec, endSec, note, vel) => ({ startSec, endSec, note, vel });
  // 120 bpm: a 16th is 0.125 s and 24 ticks. 0.01 s -> tick 0; 0.2 s -> tick 48; the third note is a duplicate of the first
  const r = rollPart([n(0.01, 0.2, 60, 127), n(0.02, 0.2, 64, 64), n(0, 0.1, 60, 90)], 120);
  assert.equal(r.text, 'bars=1\n0 48 60 1\n0 48 64 0.5\n');
  assert.equal(r.bars, 1);
  assert.deepEqual({ kept: r.score.kept, dropped: r.score.dropped, extra: r.score.extra }, { kept: 2, dropped: 1, extra: 0 });
  assert.ok(Math.abs(r.meanSnap - 0.08) < 1e-9, 'meanSnap ' + r.meanSnap);   // (0.08 + 0.16 + 0) / 3 steps
});

test('rollPart: bars cover the last note start, at least one 16th long, max 16 bars', () => {
  const n = (startSec, endSec, note) => ({ startSec, endSec, note, vel: 127 });
  const r = rollPart([n(0, 0.01, 60), n(2.0, 2.01, 62)], 120);   // 2.0 s at 120 bpm = bar 2, tick 384
  assert.equal(r.text, 'bars=2\n0 24 60 1\n384 24 62 1\n');
  assert.equal(rollPart([n(0, 0.1, 60), n(40, 40.1, 62)], 120).bars, 1);   // 40 s is bar 21: past 16 bars, left out
  assert.throws(() => rollPart([n(40, 40.1, 62)], 120), /no notes in the first 16 bars/);
});
