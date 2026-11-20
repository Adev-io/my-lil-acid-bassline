// tools/smf.test.mjs — the .mid reader: bytes to notes, notes to a step pattern, and back again.
// Author: Ari Klopfer / A_Development · MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load.mjs';
import { readSmf } from './smf.mjs';
import { smf, stemLike, tempo } from './fixtures.mjs';

const { T } = loadCore();
const plain = (v) => JSON.parse(JSON.stringify(v));

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
