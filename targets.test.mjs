// targets.test.mjs — Strudel text, the Nubass profile, and the profile argument on patternsToMidi.
// Author: Ari Klopfer / A_Development · MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './tools/load.mjs';

const { T, X } = loadCore();
const plain = (v) => JSON.parse(JSON.stringify(v));   // the page's objects come from another realm: compare them as plain data
const demo = T.loadDemo(T.newState());

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
