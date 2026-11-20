// targets.js — where a pattern goes next: Strudel text and Nubass-shaped MIDI. Pure like acidbass.js (no DOM) and loaded after it:
// it reads TB303.stepEvent, so tie, slide and accent mean here exactly what they mean everywhere else.
// Author: Ari Klopfer / A_Development · MIT
(function () {
  'use strict';
  const T = window.TB303;
  const enc = new TextEncoder();

  const PC = ['c', 'cs', 'd', 'ds', 'e', 'f', 'fs', 'g', 'gs', 'a', 'as', 'b'];
  // Scientific pitch, the way Strudel reads it: MIDI 36 is c2, MIDI 60 is c4.
  const noteName = (midi) => PC[midi % 12] + (Math.floor(midi / 12) - 1);
  const fmt = (x) => String(+x.toFixed(2)).replace(/^0\./, '.');   // 0.55 -> .55, 1.05 -> 1.05, 1 -> 1
  const GAIN_ACCENT = 1, GAIN_PLAIN = 0.7, LEGATO_SLIDE = 1.05;     // gain 1 / .7 is MIDI velocity 127 / 90; a sliding note runs into the next

  // One pattern as one Strudel expression. Every step is one slot in each layer (rests and ties too), so the layers line up.
  // opts: name (comment line), bpm (default 120), gate (fraction of a step a plain note is held, default 0.55).
  function toStrudel(pat, opts) {
    const o = opts || {};
    const gate = o.gate === undefined ? 0.55 : o.gate, bpm = o.bpm || 120, name = o.name || 'pattern';
    const notes = [], gain = [], legato = [];
    for (let i = 0; i < pat.len; i++) {
      const s = pat.steps[i], e = T.stepEvent(pat, i), next = pat.steps[(i + 1) % pat.len];
      let leg = gate;
      if (e.off) notes.push('~');
      // ponytail: a tie on step 1 holds a note from the end of the pattern; Strudel has nothing before it to extend, so it plays as a rest
      else if (s.gate === 'tie') notes.push(i === 0 ? '~' : '_');
      else {
        notes.push(noteName(e.midi));
        if (next.gate === 'tie') leg = 1;                              // the held note fills the slots the underscores give it
        else if (s.slide && next.gate === 'note') leg = LEGATO_SLIDE;
      }
      gain.push(fmt(e.accent ? GAIN_ACCENT : GAIN_PLAIN));
      legato.push(fmt(leg));
    }
    return [
      '// ' + name + ' · ' + pat.len + ' steps · ' + bpm + ' bpm',
      'setcps(' + bpm + '/60/' + pat.len / 4 + ')',   // a cycle is the whole pattern: len sixteenths = len/4 beats
      'note("' + notes.join(' ') + '")',
      '  .gain("' + gain.join(' ') + '")',
      '  .legato("' + legato.join(' ') + '")',
      '  .s("sawtooth")',
      '',
    ].join('\n');
  }

  // The page's Export gets one .strudel per non-empty pattern, named like the .txt and .mid beside it ([{name, data}]).
  function strudelFiles(raw, title) {
    const S = T.cleanState(raw);
    const pre = T.fileTitle(title) ? T.fileTitle(title) + ' - ' : '';
    const bpm = T.bpmOf(S.knobs.tempo), gate = T.gateFrac(S.knobs.gate);
    const files = [];
    S.patterns.forEach((p, i) => {
      if (!p.steps.slice(0, p.len).some((s) => s.gate !== 'rest')) return;   // an untouched slot is not a pattern
      const name = pre + T.slotName(i);
      files.push({ name: name + '.strudel', data: enc.encode(toStrudel(p, { name, bpm, gate })) });
    });
    return files;
  }

  window.TB303Targets = { noteName, toStrudel, strudelFiles };
})();
