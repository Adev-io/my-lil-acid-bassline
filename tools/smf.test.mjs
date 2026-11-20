// tools/smf.test.mjs — the .mid reader: bytes to notes, notes to a step pattern, and back again.
// Author: Ari Klopfer / A_Development · MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load.mjs';
import { describe, notesToPattern, readSmf } from './smf.mjs';
import { smf, stemLike, stemNotes, tempo } from './fixtures.mjs';

const { T } = loadCore();
const plain = (v) => JSON.parse(JSON.stringify(v));
const demo = T.loadDemo(T.newState());
const note = (start, end, n, vel = 90) => ({ start, end, note: n, vel, channel: 0 });
// patternsToMidi -> readSmf -> notesToPattern -> patternsToMidi, at one gate: the bytes that came back
const again = (p, gate = 0.55) => {
  const bytes = T.patternsToMidi([p], 120, 'x', gate), m = readSmf(bytes);
  const r = notesToPattern(m.notes, m.ppq, T, { steps: p.len });
  return { bytes: plain([...bytes]), back: plain([...T.patternsToMidi([r.pattern], 120, 'x', gate)]), r };
};

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
  assert.deepEqual(plain(m.notes), [{ start: 0, end: 480, note: 60, vel: 100, channel: 0, track: 1, startSec: 0, endSec: 0.5 }]);
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
test('round trip: a slide into the same pitch comes back as a slide, and as the same bytes', () => {
  // (a plain note somewhere gives the gate a slide's overhang is measured against: alone, `C~ C - -` reads `C = - -`)
  for (const s of ['C~ C - G', 'C~ C~ C G', 'A* A~ A - G~ G -']) {
    const p = T.parsePattern(s), bytes = T.patternsToMidi([p], 120, 'x'), m = readSmf(bytes);
    const back = notesToPattern(m.notes, m.ppq, T, { steps: p.len }).pattern;
    assert.equal(T.formatPattern(back), s, s);
    assert.deepEqual(plain([...T.patternsToMidi([back], 120, 'x')]), plain([...bytes]), s + ': the same bytes');
  }
  assert.equal(T.formatPattern(again(T.parsePattern('C~ C - -')).r.pattern), 'C = - -', 'no gate to measure: read as held');
});

test('notesToPattern: full-length notes are not a slide off the last step; a gated file\'s held last note is, and says so', () => {
  const full = [note(0, 120, 36), note(120, 240, 40), note(240, 360, 43), note(360, 480, 45)];
  assert.equal(T.formatPattern(notesToPattern(full, 480, T, { steps: 4 }).pattern), 'C E G A');
  const m = readSmf(T.patternsToMidi([T.parsePattern('C E G A')], 120, 'x', 1.0));
  const r = notesToPattern(m.notes, m.ppq, T, { steps: 4 });
  assert.equal(T.formatPattern(r.pattern), 'C E G A');
  assert.equal(r.report.wrapSlide, false);
  assert.doesNotMatch(describe(r.report), /slide into step 1/);
  const p = demo.patterns[0], bytes = T.patternsToMidi([p], 120, 'x'), d = readSmf(bytes);
  const w = notesToPattern(d.notes, d.ppq, T, { steps: p.len });
  assert.deepEqual(plain([...T.patternsToMidi([w.pattern], 120, 'x')]), plain([...bytes]), 'demo 1 still ends in E~ into A*');
  assert.equal(w.report.wrapSlide, true);
  assert.match(describe(w.report), /; read the last note as a slide into step 1 \(it is held to the end of the pattern\)$/);
});

test('notesToPattern: offset is a whole number from 0 up', () => {
  for (const offset of [0.5, -1]) assert.throws(() => notesToPattern([note(0, 60, 36), note(120, 180, 40)], 480, T, { offset, steps: 4 }), /--offset must be a whole number from 0 up/, String(offset));
});

test('readSmf: running status carries across a meta event (but not across sysex)', () => {
  const m = readSmf(smf(480, [[0, 0x90, 0x24, 0x64], [0, 0xff, 0x01, 0x00], [480, 0x24, 0x00]]));
  assert.deepEqual(plain(m.notes.map(({ start, end, note }) => [start, end, note])), [[0, 480, 36]]);
  assert.throws(() => readSmf(smf(480, [[0, 0x90, 0x24, 0x64], [0, 0xf0, 0x01, 0xf7], [480, 0x24, 0x00]])), /bad running status/);
});

test('readSmf: a note-off on the tick its note opened does not close it', () => {
  // as a note-on with velocity 0 (the fixture keeps same-tick order), and as a note-off (by hand: the fixture sorts offs first)
  const vel0 = smf(480, [[0, 0x90, 36, 90], [240, 0x90, 36, 90], [240, 0x90, 36, 0], [480, 0x80, 36, 0]]);
  const body = [0, 0x90, 36, 90, 0x81, 0x70, 0x90, 36, 90, 0, 0x80, 36, 0, 0x81, 0x70, 0x80, 36, 0, 0, 0xff, 0x2f, 0];
  const off = Uint8Array.from([...vel0.slice(0, 18), 0, 0, 0, body.length, ...body]);
  for (const bytes of [vel0, off]) {
    const m = readSmf(bytes);
    assert.deepEqual(plain(m.notes.map(({ start, end }) => [start, end])), [[0, 240], [240, 480]]);
    assert.equal(T.formatPattern(notesToPattern(m.notes, m.ppq, T, { steps: 4 }).pattern), 'C = C =');
  }
});

test('readSmf: skips a chunk that is not a track, and refuses a time division of 0', () => {
  const ok = smf(480, [[0, 0x90, 36, 90], [120, 0x80, 36, 0]]);
  const withXfih = Uint8Array.from([...ok.slice(0, 14), 0x58, 0x46, 0x49, 0x48, 0, 0, 0, 4, 1, 2, 3, 4, ...ok.slice(14)]);
  assert.deepEqual(plain(readSmf(withXfih).notes.map(({ start, end, note, track }) => [start, end, note, track])), [[0, 120, 36, 0]]);
  const zero = Uint8Array.from(ok); zero[12] = 0; zero[13] = 0;
  assert.throws(() => readSmf(zero), /bad time division 0/);
});

test('round trip: slides out of a held note, round the loop, and chains of slides come back as the same bytes', () => {
  for (const s of ['G A*~ A*~ C', 'D E C~ C~', 'C~ D~ E~ F~', 'C = = F~', 'C~ D* = G*~', 'A_~ E~', 'A~ A~ C - - -']) {
    const { bytes, back } = again(T.parsePattern(s));
    assert.deepEqual(back, bytes, s);
  }
  const text = (s) => T.formatPattern(again(T.parsePattern(s)).r.pattern);
  assert.equal(text('G A*~ A*~ C'), 'G A*~ A~ C');   // the accent on a step slid into at the same pitch writes nothing
  assert.equal(text('D E C~ C~'), 'D E C~ C~');
  assert.equal(text('C = = F~'), 'C = = F~');
  assert.equal(again(T.parsePattern('C~ D~ E~ F~')).r.report.wrapSlide, true);
});

// a random line: rests, ties and notes from a small palette (so same-pitch neighbours are common), random accent and slide
const mulberry32 = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const PALETTE = [[0, 0], [3, 0], [7, 0], [9, -1], [0, 1]];
function randomPattern(rnd) {
  const p = T.emptyPattern();
  p.len = 4 + Math.floor(rnd() * 13);
  for (let i = 0; i < p.len; i++) {
    const r = rnd();
    if (r < 0.25) continue;
    if (r < 0.4) { p.steps[i].gate = 'tie'; continue; }
    const [n, oct] = PALETTE[Math.floor(rnd() * PALETTE.length)];
    p.steps[i] = { gate: 'note', note: n, oct, accent: rnd() < 0.3, slide: rnd() < 0.4 };
  }
  return p;
}

// Known lossy, excluded by name: a slide into the same pitch (no new note-on: the note just lasts its gate longer) in a file
// with no plain note to measure the gate from (every note is held by a tie, a slide or the loop). `C~ C - -` writes one C of
// 1.55 steps, and a 1.55-step note with nothing to compare it to reads as `C = - -`. Give it any plain note and it reads back.
const sameSlideNoGate = (p, notes) =>
  p.steps.slice(0, p.len - 1).some((s, i) => s.gate === 'note' && s.slide && p.steps[i + 1].gate === 'note' && T.midiOf(p.steps[i + 1]) === T.midiOf(s)) &&
  !notes.some((x) => (x.end - x.start) / 120 < 0.98);

test('round trip sweep: 2000 random patterns at six gates come back as the same bytes', () => {
  const rnd = mulberry32(303), GATES = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85], bad = [];
  let n = 0, runs = 0, lossy = 0;
  while (n < 2000) {
    const p = randomPattern(rnd);
    if (p.steps[0].gate === 'tie') continue;   // known lossy: a tie on step 1 holds a note from the end of the loop
    if (!p.steps.slice(0, p.len).some((s) => s.gate === 'note')) continue;   // silent: nothing to read
    n++;
    for (const g of GATES) {
      const { bytes, back, r } = again(p, g);
      if (sameSlideNoGate(p, readSmf(Uint8Array.from(bytes)).notes)) { lossy++; continue; }
      runs++;
      if (JSON.stringify(back) !== JSON.stringify(bytes)) bad.push(g + ': ' + T.formatPattern(p) + ' -> ' + T.formatPattern(r.pattern));
    }
  }
  assert.deepEqual(bad.slice(0, 12), [], bad.length + ' of ' + runs + ' round trips differ');
  assert.ok(runs > 11000 && lossy < 1000, runs + ' round trips, ' + lossy + ' skipped as sameSlideNoGate');
});

const STEM_LINE = 'A - A - A^ - A - A - G - A - A -';
const stemOf = (text, bpm, secOf) => stemNotes(T.parsePattern(text).steps.slice(0, 16).flatMap((s, i) =>
  s.gate === 'note' ? [{ step: i, note: T.midiOf(s), sec: secOf(i) }] : []), bpm);

test('a stem whose notes run a little long (127.7 ms, past a 16th) still reads its rests', () => {
  for (const bpm of [125, 130, 140]) {
    const m = readSmf(stemOf(STEM_LINE, bpm, () => 0.1277));
    const r = notesToPattern(m.notes, m.ppq, T, { steps: 16, gridBpm: bpm });
    assert.equal(T.formatPattern(r.pattern), STEM_LINE, bpm + ' bpm');
  }
});

test('a stem\'s held notes (1.85 and 2.8 steps) read as ties, never as same-pitch slides', () => {
  const bpm = 130, step = 15 / bpm;
  const m = readSmf(stemOf('A - - - C^ - - -', bpm, (i) => (i === 0 ? 1.85 : 2.8) * step));
  assert.equal(T.formatPattern(notesToPattern(m.notes, m.ppq, T, { steps: 8, gridBpm: bpm }).pattern), 'A = - - C^ = = -');
});

test('DAW notes a hair over a 16th read as plain notes; full-length 16ths are still no slide off the last step', () => {
  const r = notesToPattern([note(0, 124, 36), note(240, 364, 40), note(480, 604, 43)], 480, T, { steps: 6 });
  assert.equal(T.formatPattern(r.pattern), 'C - E - G -');
  const full = notesToPattern([note(0, 120, 36), note(120, 240, 40), note(240, 360, 43), note(360, 480, 45)], 480, T, { steps: 4 });
  assert.equal(T.formatPattern(full.pattern), 'C E G A');
  assert.equal(full.report.wrapSlide, false);
});

test('readSmf: a lone note-off on the tick its note opened gives a zero-length note', () => {
  // on C, off C, both at tick 0, then E for half a step at 480 (by hand: the fixture sorts offs first)
  const body = [0, 0x90, 36, 90, 0, 0x80, 36, 0, 0x83, 0x60, 0x90, 40, 90, 0x3c, 0x80, 40, 0, 0, 0xff, 0x2f, 0];
  const head = smf(480, []).slice(0, 18);
  const m = readSmf(Uint8Array.from([...head, 0, 0, 0, body.length, ...body]));
  assert.deepEqual(plain(m.notes.map(({ start, end, note }) => [start, end, note])), [[0, 0, 36], [480, 540, 40]]);
  assert.equal(T.formatPattern(notesToPattern(m.notes, m.ppq, T, { steps: 8 }).pattern), 'C - - - E - - -');
});
