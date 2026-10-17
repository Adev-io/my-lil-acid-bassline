// tb303/tb303.test.mjs — the acid bass line's pure core (sequencer rules, cleaning, automation, files), run in node:vm like the page runs it.
// Author: Ari Klopfer / A_Development
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { crc32 as nodeCrc32 } from 'node:zlib';

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tb303.js'), 'utf8');
const load = () => { const sandbox = { TextEncoder }; sandbox.window = sandbox; vm.runInContext(SRC, vm.createContext(sandbox)); return sandbox.TB303; };
const T = load();
const plain = (o) => JSON.parse(JSON.stringify(o));   // vm-realm objects are not deepEqual to ours under node
const pat = (len, steps) => {
  const p = T.emptyPattern();
  p.len = len;
  steps.forEach((s, i) => Object.assign(p.steps[i], s));
  return p;
};
const N = (note, extra) => ({ gate: 'note', note, ...extra });

test('a rest is off; a plain note triggers a fresh envelope at its pitch, gate 55% of the step', () => {
  const p = pat(2, [N(0), {}]);
  assert.equal(T.stepEvent(p, 1).off, true);
  const e = T.stepEvent(p, 0);
  assert.deepEqual(plain([e.off, e.trig, e.glide, e.midi, e.hold, e.len]), [false, true, false, 36, false, 0.55]);
});

test('octave Up/Down and the 13th key move the pitch', () => {
  const p = pat(3, [N(12), N(0, { oct: 1 }), N(0, { oct: -1 })]);
  assert.equal(T.stepEvent(p, 0).midi, 48);
  assert.equal(T.stepEvent(p, 1).midi, 48);
  assert.equal(T.stepEvent(p, 2).midi, 24);
});

test('slide holds the gate and the next note glides without a retrigger', () => {
  const p = pat(3, [N(0, { slide: true }), N(7), {}]);
  const a = T.stepEvent(p, 0), b = T.stepEvent(p, 1);
  assert.equal(a.hold, true);
  assert.deepEqual(plain([b.trig, b.glide, b.midi]), [false, true, 43]);
  assert.equal(b.hold, false, 'the glide ends the gate as a normal note');
});

test('slide into a rest does not hold, and slide at the wrap glides into step 0', () => {
  assert.equal(T.stepEvent(pat(2, [N(0, { slide: true }), {}]), 0).hold, false);
  const w = pat(2, [N(5), N(0, { slide: true })]);
  assert.equal(T.stepEvent(w, 1).hold, true);
  assert.equal(T.stepEvent(w, 0).trig, false, 'step 0 is slid into from the last step');
});

test('a tie sustains the previous pitch with no retrigger, and the note before it holds', () => {
  const p = pat(3, [N(4), { gate: 'tie' }, {}]);
  assert.equal(T.stepEvent(p, 0).hold, true);
  const t = T.stepEvent(p, 1);
  assert.deepEqual(plain([t.off, t.trig, t.midi, t.hold, t.len]), [false, false, 40, false, 0.95]);
});

test('a tie with no note behind it (a rest first, or nothing at all) is silent', () => {
  assert.equal(T.stepEvent(pat(2, [{}, { gate: 'tie' }]), 1).off, true);
  assert.equal(T.stepEvent(pat(1, [{ gate: 'tie' }]), 0).off, true);
});

test('accent travels with the step; pattern length wraps next/prev', () => {
  const p = pat(2, [N(0, { accent: true }), N(2)]);
  assert.equal(T.stepEvent(p, 0).accent, true);
  assert.equal(T.stepEvent(p, 1).accent, false);
  assert.equal(T.stepEvent(pat(1, [N(0)]), 0).trig, true, 'a one-step pattern retriggers every pass');
});

test('pitch-mode write puts the key at the cursor, applies modifiers and advances, wrapping at the length', () => {
  const p = pat(2, []);
  assert.equal(T.writeNote(p, 0, 7, { oct: 1, accent: true }), 1);
  assert.deepEqual(plain(p.steps[0]), { gate: 'note', note: 7, oct: 1, accent: true, slide: false });
  assert.equal(T.writeNote(p, 1, 0), 0);
});

test('time-mode toggles cycle note -> rest -> tie; octave cycles 0 -> up -> down', () => {
  const s = T.emptyPattern().steps[0];
  s.gate = 'note';
  T.cycleGate(s); assert.equal(s.gate, 'rest');
  T.cycleGate(s); assert.equal(s.gate, 'tie');
  T.cycleGate(s); assert.equal(s.gate, 'note');
  T.cycleOct(s); assert.equal(s.oct, 1);
  T.cycleOct(s); assert.equal(s.oct, -1);
  T.cycleOct(s); assert.equal(s.oct, 0);
});

test('track mode walks the song and wraps; pattern mode loops the current slot', () => {
  const st = T.newState();
  st.cur = 3; st.song = [5, 9, 2];
  assert.deepEqual(plain(T.nextSlot(st, 'pattern', 0)), { slot: 3, songPos: 0 });
  assert.deepEqual(plain(T.nextSlot(st, 'track', 0)), { slot: 9, songPos: 1 });
  assert.deepEqual(plain(T.nextSlot(st, 'track', 2)), { slot: 5, songPos: 0 });
  st.song = [];
  assert.deepEqual(plain(T.nextSlot(st, 'track', 0)), { slot: 3, songPos: 0 }, 'an empty song falls back to the pattern');
});

test('cleanState turns hostile or stale blobs into a playable machine', () => {
  for (const bad of [null, 'x', 5, [], { patterns: 'no' }, { knobs: { cutoff: NaN, res: 'loud' } }]) {
    const s = T.cleanState(bad);
    assert.equal(s.patterns.length, 32);
    assert.ok(s.patterns.every((p) => p.len >= 1 && p.len <= 32 && p.steps.length === 32));
    assert.ok(Object.values(s.knobs).every((v) => v >= 0 && v <= 1));
  }
  const s = T.cleanState({
    wave: 'evil', cur: 99, song: new Array(500).fill(7).concat([-3]),
    patterns: [{ len: 99, steps: [{ gate: '<img>', note: 400, oct: 9, accent: 'yes', slide: 1 }] }],
    knobs: { cutoff: 7 },
  });
  assert.equal(s.wave, 'saw');
  assert.equal(s.cur, 31);
  assert.equal(s.song.length, 16);
  assert.equal(s.patterns[0].len, 32, 'a length past 32 clamps to 32');
  assert.deepEqual(plain(s.patterns[0].steps[0]), { gate: 'rest', note: 12, oct: 1, accent: false, slide: false });
  assert.equal(s.knobs.cutoff, 1);
});

test('a 32-step pattern keeps its second half, wraps at 32, and a 16-step save loads padded', () => {
  const p = T.parsePattern(Array.from({ length: 32 }, (_, i) => (i === 31 ? 'G~' : i === 16 ? 'E*' : '-')).join(' '));
  assert.equal(p.len, 32);
  assert.equal(T.stepEvent(p, 16).accent, true);
  assert.equal(T.stepEvent(p, 31).hold, false, 'slide at step 32 wraps to a rest, so no hold');
  assert.equal(T.parsePattern(new Array(40).fill('C').join(' ')).len, 32, 'notation caps at 32');
  const old = T.cleanPattern({ len: 16, steps: new Array(16).fill({ gate: 'note', note: 2 }) });
  assert.deepEqual(plain([old.len, old.steps.length, old.steps[20].gate]), [16, 32, 'rest']);
  assert.equal(T.emptyPattern().len, 16, 'new patterns still start at 16');
});

test('automation sweeps min -> max -> min over `rate` beats and cleans hostile input', () => {
  const a = { min: 0.2, max: 0.8, rate: 4 };
  const near = (x, y) => assert.ok(Math.abs(x - y) < 1e-9, x + ' vs ' + y);
  near(T.autoValue(a, 0), 0.2); near(T.autoValue(a, 2), 0.8); near(T.autoValue(a, 4), 0.2); near(T.autoValue(a, 1), 0.5);
  near(T.autoValue({ min: 0.8, max: 0.2, rate: 4 }, 2), 0.2);   // an inverted range sweeps the other way
  const c = T.cleanState({ auto: { cutoff: { on: 'yes', min: -5, max: 9, rate: 0 }, res: 'x' } }).auto;
  assert.deepEqual(plain(c.cutoff), { on: false, min: 0, max: 1, rate: 0.25 });
  assert.deepEqual(plain(c.res), { on: false, min: 0, max: 1, rate: 4 });
  assert.equal(Object.keys(c).length, 8, 'every knob has an automation slot');
});

test('knob maps stay in range and are monotonic; tempo and tuning hit the stated ends', () => {
  assert.equal(T.bpmOf(0), 40);
  assert.equal(T.bpmOf(1), 300);
  assert.equal(T.tuneCents(0.5), 0);
  assert.equal(T.tuneCents(1), 100);
  assert.ok(T.cutoffHz(0) < T.cutoffHz(0.5) && T.cutoffHz(0.5) < T.cutoffHz(1));
  assert.ok(T.cutoffHz(1) < 6000 && T.resQ(1) > T.resQ(0) && T.decaySec(1) <= 2.0001 && T.decaySec(0) >= 0.2);
  assert.ok(Math.abs(T.freqOf(69) - 440) < 1e-9 && Math.abs(T.freqOf(57) - 220) < 1e-9);
  assert.equal(T.slotName(0), 'I-A1');
  assert.equal(T.slotName(31), 'II-B8');
});

test('step notation parses to the same steps the editor makes, and rejects junk', () => {
  const p = T.parsePattern("A* - A^ = C'~ D#_*");
  assert.equal(p.len, 6);
  assert.deepEqual(plain(p.steps[0]), { gate: 'note', note: 9, oct: 0, accent: true, slide: false });
  assert.equal(p.steps[1].gate, 'rest');
  assert.equal(p.steps[2].oct, 1);
  assert.equal(p.steps[3].gate, 'tie');
  assert.deepEqual(plain([p.steps[4].note, p.steps[4].slide]), [12, true]);
  assert.deepEqual(plain([p.steps[5].note, p.steps[5].oct, p.steps[5].accent]), [3, -1, true]);
  for (const bad of ['H', "D'", 'C**x', '']) assert.throws(() => T.parsePattern(bad));
});

test('the demo set loads six playable patterns, a song and a sound, and survives cleanState', () => {
  const s = T.loadDemo(T.newState());
  for (let i = 0; i < 6; i++) {
    const p = s.patterns[i];
    assert.equal(p.len, 16, 'pattern ' + i);
    assert.ok(Array.from({ length: p.len }, (_, j) => T.stepEvent(p, j)).some((e) => e.trig), 'pattern ' + i + ' sounds');
  }
  assert.equal(s.song.length, 10);
  assert.equal(JSON.stringify(T.cleanState(JSON.parse(JSON.stringify(s)))), JSON.stringify(s));
});

// Walks a format-0 file back into [{tick, kind, note, vel}] plus the header facts, so the tests read the bytes a DAW would.
function readMidi(u8) {
  const buf = Buffer.from(u8);
  assert.equal(buf.toString('latin1', 0, 4), 'MThd');
  assert.deepEqual([buf.readUInt16BE(8), buf.readUInt16BE(10), buf.readUInt16BE(12)], [0, 1, 480]);
  assert.equal(buf.toString('latin1', 14, 18), 'MTrk');
  const end = 22 + buf.readUInt32BE(18);
  assert.equal(end, buf.length, 'track length matches the file');
  let i = 22, tick = 0, bpm = null; const notes = [];
  while (i < end) {
    let d = 0, b; do { b = buf[i++]; d = (d << 7) | (b & 127); } while (b & 128);
    tick += d;
    const st = buf[i++];
    if (st === 0xff) {
      const type = buf[i++], len = buf[i++];
      if (type === 0x51) bpm = Math.round(60_000_000 / ((buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2]));
      i += len;
    } else { notes.push({ tick, kind: st === 0x90 ? 'on' : 'off', note: buf[i], vel: buf[i + 1] }); i += 2; }
  }
  return { bpm, notes };
}

test('formatPattern is the inverse of the step notation', () => {
  for (const s of ["A* - A^ = C'~ D#_*", 'C C# D D# E F F# G G# A A# B', 'E~ E*~ -']) assert.equal(T.formatPattern(T.parsePattern(s)), s);
});

test('midi: pitch, accent velocity, rest gap, the tempo, and a valid track', () => {
  const m = readMidi(T.patternsToMidi([T.parsePattern('C* - E')], 120, 'x'));
  assert.equal(m.bpm, 120);
  assert.deepEqual(plain(m.notes), [
    { tick: 0, kind: 'on', note: 36, vel: 127 }, { tick: 66, kind: 'off', note: 36, vel: 0 },
    { tick: 240, kind: 'on', note: 40, vel: 90 }, { tick: 306, kind: 'off', note: 40, vel: 0 },
  ]);
});

test('midi: a slide overlaps the next note and a tie holds one note across steps', () => {
  const s = readMidi(T.patternsToMidi([T.parsePattern('C~ G -')], 120, 'x')).notes;
  assert.deepEqual(plain(s.map((n) => [n.tick, n.kind, n.note])), [[0, 'on', 36], [120, 'on', 43], [122, 'off', 36], [186, 'off', 43]]);
  const t = readMidi(T.patternsToMidi([T.parsePattern('C = -')], 120, 'x')).notes;
  assert.deepEqual(plain(t.map((n) => [n.tick, n.kind, n.note])), [[0, 'on', 36], [234, 'off', 36]], 'one note-on, held through the tie');
});

test('midi: a pattern that holds into the wrap closes its note, and a song joins patterns end to end', () => {
  const held = readMidi(T.patternsToMidi([T.parsePattern('- C~')], 90, 'x')).notes;
  assert.equal(held.filter((n) => n.kind === 'on').length, 1);
  assert.equal(held.at(-1).kind, 'off');
  const two = readMidi(T.patternsToMidi([T.parsePattern('C - - -'), T.parsePattern('G - - -')], 120, 'x')).notes;
  assert.equal(two.find((n) => n.note === 43).tick, 480, 'the second pattern starts one bar of four 16ths later');
});

test('exportFiles writes a txt + mid per non-empty pattern and a song, and nothing for empty slots', () => {
  const dec = (d) => new TextDecoder().decode(d);
  const state = { patterns: [], song: [0, 1, 5], knobs: { tempo: 0.5 } };
  state.patterns[0] = { len: 4, steps: [{ gate: 'note', note: 9, accent: true }, {}, {}, {}] };
  state.patterns[1] = { len: 4, steps: [{ gate: 'note', note: 0 }, {}, {}, {}] };
  const files = T.exportFiles(state);
  assert.deepEqual(plain(files.map((f) => f.name)), ['I-A1.txt', 'I-A1.mid', 'I-A2.txt', 'I-A2.mid', 'song.txt', 'song.mid']);
  const txt = dec(files.find((f) => f.name === 'I-A1.txt').data);
  assert.match(txt, /^# I-A1  4 steps  170 bpm/);
  assert.equal(txt.trim().split('\n').at(-1), 'A* - - -');
  assert.equal(dec(files.find((f) => f.name === 'song.txt').data).trim().split('\n').at(-1), 'I-A1 I-A2', 'an empty slot in the song is left out');
  assert.equal(T.exportFiles(null).length, 0, 'a blank or hostile state exports nothing');
});

test('zip: a valid store-only archive whose entries, names and CRCs read back', () => {
  const files = T.exportFiles(T.loadDemo(T.newState()));
  const z = Buffer.from(T.zip(files, '303-patterns'));
  const eocd = z.length - 22;
  assert.equal(z.readUInt32LE(eocd), 0x06054b50);
  const n = z.readUInt16LE(eocd + 10);
  assert.equal(n, files.length);
  let c = z.readUInt32LE(eocd + 16);
  for (let i = 0; i < n; i++) {
    assert.equal(z.readUInt32LE(c), 0x02014b50);
    const [crc, size, nl, extra, cmt, lh] = [z.readUInt32LE(c + 16), z.readUInt32LE(c + 24), z.readUInt16LE(c + 28), z.readUInt16LE(c + 30), z.readUInt16LE(c + 32), z.readUInt32LE(c + 42)];
    const name = z.toString('utf8', c + 46, c + 46 + nl);
    assert.equal(name, '303-patterns/' + files[i].name);
    assert.equal(z.readUInt32LE(lh), 0x04034b50);
    const data = z.subarray(lh + 30 + nl, lh + 30 + nl + size);
    assert.deepEqual([...data], [...files[i].data], name + ' bytes');
    assert.equal(crc, nodeCrc32(data), name + ' crc');
    c += 46 + nl + extra + cmt;
  }
});
