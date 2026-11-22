// tools/stem-score.test.mjs — the stem test's score and conversions.
// Author: Ari Klopfer / A_Development · MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load.mjs';
import { f1Score, patternOnsets, stemOnsets } from './stem-score.mjs';

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
