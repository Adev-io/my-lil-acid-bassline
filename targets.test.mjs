// targets.test.mjs — Strudel text, the Nubass profile, and the profile argument on patternsToMidi.
// Author: Ari Klopfer / A_Development · MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadCore } from './tools/load.mjs';
import { readSmf } from './tools/smf.mjs';

const { T, X } = loadCore();
const plain = (v) => JSON.parse(JSON.stringify(v));   // the page's objects come from another realm: compare them as plain data
const demo = T.loadDemo(T.newState());
const sha = (u8) => createHash('sha1').update(Buffer.from(u8)).digest('hex').slice(0, 16);

test('noteName: scientific pitch, the machine\'s C2 is c2 and its top C is c4', () => {
  assert.deepEqual([36, 45, 57, 37, 24, 60].map(X.noteName), ['c2', 'a2', 'a3', 'cs2', 'c1', 'c4']);
});

test('toStrudel: notes, rests, accent gain and the slide overlap, layer by layer', () => {
  const out = X.toStrudel(T.parsePattern('A* - A A^ - A_* A - G~ A'), { name: 'I-A1', bpm: 120 });
  assert.equal(out, [
    '// I-A1 · 10 steps · 120 bpm',
    'setcps(120/60/2.5)',
    'note("a2 ~ a2 a3 ~ a1 a2 ~ g2 a2")',
    '  .gain("1 .7 .7 .7 .7 1 .7 .7 .7 .7")',
    '  .legato(".55 .55 .55 .55 .55 .55 .55 .55 1.05 .55")',
    '  .s("sawtooth")',
    '',
  ].join('\n'));
});

test('toStrudel: a tie is an underscore and the note before it fills the slots; sharps use s', () => {
  const out = X.toStrudel(T.parsePattern('F* = = F C#'), { name: 't', bpm: 90 });
  assert.match(out, /^note\("f2 _ _ f2 cs2"\)$/m);
  assert.match(out, /^  \.gain\("1 \.7 \.7 \.7 \.7"\)$/m);
  assert.match(out, /^  \.legato\("1 \.55 \.55 \.55 \.55"\)$/m);
  assert.match(out, /^setcps\(90\/60\/1\.25\)$/m);
});

test('toStrudel: a slide into a rest is a plain note, a tie on step 1 is a rest, and gate sets the plain legato', () => {
  assert.match(X.toStrudel(T.parsePattern('E~ -')), /\.legato\("\.55 \.55"\)/);
  assert.match(X.toStrudel(T.parsePattern('= C')), /^note\("~ c2"\)$/m);
  assert.match(X.toStrudel(T.parsePattern('C - - -'), { gate: 0.25 }), /\.legato\("\.25 \.25 \.25 \.25"\)/);
});

test('toStrudel: the six demo patterns keep the layers the same length and every note name is the step\'s MIDI note', () => {
  const pcs = ['c', 'cs', 'd', 'ds', 'e', 'f', 'fs', 'g', 'gs', 'a', 'as', 'b'];
  const midiOfName = (n) => { const m = /^([a-g]s?)(\d)$/.exec(n); return pcs.indexOf(m[1]) + 12 * (Number(m[2]) + 1); };
  for (let i = 0; i < 6; i++) {
    const p = demo.patterns[i], out = X.toStrudel(p);
    const layer = (re) => re.exec(out)[1].split(' ');
    const notes = layer(/^note\("(.*)"\)$/m), gain = layer(/\.gain\("(.*)"\)/), leg = layer(/\.legato\("(.*)"\)/);
    assert.deepEqual([notes.length, gain.length, leg.length], [p.len, p.len, p.len], 'pattern ' + i);
    notes.forEach((n, j) => {
      const e = T.stepEvent(p, j);
      if (n === '~') assert.ok(e.off || (j === 0 && p.steps[0].gate === 'tie'), 'pattern ' + i + ' step ' + j);
      else if (n === '_') assert.equal(p.steps[j].gate, 'tie');
      else assert.equal(midiOfName(n), e.midi, 'pattern ' + i + ' step ' + j);
    });
  }
});

test('strudelFiles: one per non-empty pattern, named like the .txt beside it, with the title', () => {
  const names = (fs) => plain(fs.map((f) => f.name));
  assert.deepEqual(names(X.strudelFiles(demo)), names(T.exportFiles(demo).filter((f) => f.name.endsWith('.txt') && f.name !== 'song.txt')).map((n) => n.replace(/\.txt$/, '.strudel')));
  assert.ok(names(X.strudelFiles(demo, ' Acid/Rain: v2? ')).every((n) => n.startsWith('AcidRain v2 - ') && n.endsWith('.strudel')));
  assert.equal(X.strudelFiles(null).length, 0);
  const first = new TextDecoder().decode(X.strudelFiles(demo)[0].data);
  assert.match(first, /^\/\/ I-A1 · 16 steps · \d+ bpm\nsetcps\(\d+\/60\/4\)\nnote\(/);
});

test('patternsToMidi with no profile is byte-for-byte what it was before profiles existed', () => {
  assert.equal(demo.patterns.slice(0, 6).map((p) => sha(T.patternsToMidi([p], 120, 'x'))).join(' '),
    'c05173ab3ca6d356 d01c0e894a6225fa e0768e8e915cc71d add0d63f385f5697 cf00c98a972b5d92 2ae598400d37a327');
  assert.equal(sha(T.patternsToMidi(demo.song.map((i) => demo.patterns[i]), 120, 'song')), '87db5cdbb54e52b8');
  assert.equal(sha(T.patternsToMidi([demo.patterns[2]], 93, 'g', 0.8)), 'eeb7ae3f311c5e33');
});

test('patternsToMidi profile: channel and velocities', () => {
  const m = readSmf(T.patternsToMidi([T.parsePattern('C* - E')], 120, 'x', undefined, { channel: 2, velAccent: 100, velNormal: 50 }));
  assert.deepEqual(plain(m.notes.map((n) => [n.channel, n.note, n.vel])), [[2, 36, 100], [2, 40, 50]]);
});

test('patternsToMidi profile: noteRange folds by octaves, reports each fold, keeps a slide balanced', () => {
  const folds = [];
  const bytes = T.patternsToMidi([T.parsePattern('C_ C^ D~ A^')], 120, 'x', undefined, { noteRange: [36, 47], onFold: (a, b) => folds.push([a, b]) });
  assert.deepEqual(plain(folds), [[24, 36], [48, 36], [57, 45]]);   // D~ is 38: in range, so it is not reported
  const notes = readSmf(bytes).notes;
  assert.ok(notes.every((n) => n.note >= 36 && n.note <= 47));
  assert.equal(notes.length, 4);
  assert.throws(() => T.patternsToMidi([T.parsePattern('C')], 120, 'x', undefined, { noteRange: [36, 40] }), /noteRange must span/);
});

test('toNubassMidi: today the Nubass profile is the default bytes, and a caller can still override', () => {
  assert.equal(sha(X.toNubassMidi([demo.patterns[0]], 120, { name: 'x' })), 'c05173ab3ca6d356');
  const m = readSmf(X.toNubassMidi([T.parsePattern('C*')], 120, { profile: { channel: 5 } }));
  assert.equal(m.notes[0].channel, 5);
});