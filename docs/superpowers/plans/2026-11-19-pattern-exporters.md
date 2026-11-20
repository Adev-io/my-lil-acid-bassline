# Pattern Exporters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pattern from the web app or a stem's `.mid` reaches Strudel, the Volca Nubass and Rack with its accents, slides and ties intact: a `toStrudel` exporter, a Nubass MIDI profile, a `.mid` reader, and one CLI that joins them.

**Architecture:** Pure scripts in the page's existing style: `targets.js` (a browser IIFE loaded after `acidbass.js`, tested through `node:vm`) holds the exporters and calls `TB303.stepEvent`, so tie, slide and accent rules live in one place. `tools/smf.mjs` reads `.mid` files and snaps them to the 16th grid; `tools/pattern-export.mjs` is the command line. The spec is `docs/superpowers/specs/2026-11-19-pattern-exporters-design.md`; Task 1 corrects it where building showed it was wrong.

**Tech Stack:** Plain JS, `node --test` (Bun also runs the CLI), `node:vm`. No new runtime dependency. Strudel is installed only in a throwaway folder for one check (Task 4).

**Conventions for every task**
- Working directory: `C:\Users\Arikl\Desktop\_Projects\my-lil-acid-bassline` (repo root). Commands are PowerShell.
- Baseline before you start: `node --test` reports `tests 79`, `pass 79`. The expected totals below count up from there.
- Files in this repo are CRLF in the working copy. The Edit tool keeps that; after any edit run `git diff --stat` and confirm only the lines you meant changed (a whole-file diff means mixed line endings: stop and fix).
- Commits are plain prose, no `Co-Authored-By` or other AI attribution (Ari's rule).
- Authorship header on every new file: `// Author: Ari Klopfer / A_Development · MIT`.
- `patternsToMidi` and friends return arrays and objects created inside the `node:vm` context. In tests, compare them as plain data (`plain()` below) or compare strings; `assert.deepEqual` on a vm-realm array fails with "not reference-equal" and `assert.throws(..., RangeError)` fails on a vm-realm error. Use regexes on messages.

## File structure

| File | Responsibility |
|---|---|
| `targets.js` (create) | `noteName`, `toStrudel`, `strudelFiles`, `NUBASS`, `toNubassMidi`. Pure. Exposes `window.TB303Targets`. |
| `acidbass.js` (modify) | `patternsToMidi` gains an optional 5th `profile` argument. Nothing else changes. |
| `tools/load.mjs` (create) | Runs `acidbass.js` and `targets.js` in `node:vm` the way the page does. Shared by the tests and the CLI. |
| `tools/smf.mjs` (create) | `readSmf` (bytes to notes, in ticks and seconds), `notesToPattern` (notes to a step pattern on the file's ticks or, with `gridBpm`, on the song's real tempo; plus a report), `describe`. |
| `tools/fixtures.mjs` (create) | Test-only: a tiny MIDI writer and `stemLike`, a pattern saved the way basic-pitch saves a transcription. |
| `tools/pattern-export.mjs` (create) | The command line. |
| `targets.test.mjs`, `tools/smf.test.mjs`, `tools/pattern-export.test.mjs` (create) | Tests. |
| `index.html` (modify) | Load `targets.js`; list the `.strudel` chips beside `.txt` and `.mid`. |
| `plugin/CMakeLists.txt`, `plugin/Source/Editor.cpp`, `.github/workflows/plugin.yml`, `plugin/README.md` (modify, Task 11) | Embed `targets.js` in the plugin's window. |
| `README.md`, the spec (modify) | Docs. |

---

### Task 0: Branch and baseline

**Files:** none.

- [ ] **Step 1: Branch off main**

Run: `git switch -c feat/pattern-exporters`
Expected: `Switched to a new branch 'feat/pattern-exporters'`

- [ ] **Step 2: Confirm the baseline**

Run: `node --test 2>&1 | Select-String -Pattern '^ℹ (tests|pass|fail)'`
Expected: `ℹ tests 79`, `ℹ pass 79`, `ℹ fail 0`. If it is not green, stop: nothing below is trustworthy.

---

### Task 1: Correct the spec

Building the prototype found six places where the spec is wrong or too loose. Fix them first so the spec and the code agree.

**Files:**
- Modify: `docs/superpowers/specs/2026-11-19-pattern-exporters-design.md`

- [ ] **Step 1: Apply these sixteen edits (Edit tool, exact strings)**

1. old `// I-A1 · 16 steps · 120 bpm` → new `// I-A1 · 10 steps · 120 bpm` (the example is 10 steps long, not 16)
2. old `setcps(120/60/4)` → new `setcps(120/60/2.5)`
3. old `  .legato("1.05 .55 .55 .55 .55 .55 .55 .55 1.05 .55")` → new `  .legato(".55 .55 .55 .55 .55 .55 .55 .55 1.05 .55")` (the example wrongly slid step 1; only `G~` at step 9 slides)
4. old ``| tie `=` | `_` (extends the previous event, no retrigger) |`` → new ``| tie `=` | `_` (extends the previous event, no retrigger); the note before it gets legato 1 so it fills the slots |``
5. old `Known limits: Strudel has no pitch glide that was checked, so a slide renders as overlap, not a pitch ramp. The octave` → new `Strudel facts, read from the @strudel/core 1.2.6 source: noteToMidi gives c2 = 36 and c4 = 60, an s after a letter is a sharp (cs2), and legato is a synonym of clip, which multiplies the event's duration. A tie on step 1 plays as a rest (nothing before it to extend). The cycle is the whole pattern, so the tempo line is setcps(bpm/60/(len/4)).`
6. old ``naming (`c4` = middle C) is believed, not confirmed; see the manual check under Tests.`` → new `Still unverified until plan Task 4 runs: that _ extends the previous event and that the gain and legato layers line up with it. Strudel has no pitch glide that was checked, so a slide renders as overlap, not a pitch ramp.`
7. old ``- More than 32 steps is an error with a hint (`--bars`, `--offset`), never a silent cut.`` → new ``- More than 32 steps is an error with a hint (`--offset`, `--steps`), never a silent cut. `--steps` sets the pattern length (1-32); without it the length is the notes' span rounded up to a multiple of 4.``
8. old `- Polyphony: keeps the lowest note per step (it is a bass) and counts what it drops.` → new that same line plus a newline and: `- A note that runs to the end of the pattern is read as a slide into step 1 when step 1 is a note. That is how patternsToMidi writes a slide off the last step.`
9. old ``- `toStrudel(pattern, opts)` returns one Strudel expression as a string.`` → new that same line plus a newline and: ``- `strudelFiles(rawState, title)` returns the page's per-pattern `{name, data}` files, named like the `.txt` beside them.``
10. old ```exportFiles` adds a `<name>.strudel` file next to each `.txt` and `.mid` in the existing Export folder zip. No new UI.`` → new ``The page's Export lists `exportFiles` as draggable chips (it does not call `zip` today, whatever the README says). `targets.js` adds a `<name>.strudel` chip next to each `.txt` and `.mid`; `exportFiles` itself cannot, because `acidbass.js` is loaded without `targets.js`. No new UI.``

Then two more, in the Tests and Build order sections:

11. old ``- Round trip: each demo pattern goes `pattern -> patternsToMidi -> smf reader -> formatPattern` and must equal the`` → new ``- Round trip: each demo pattern goes `pattern -> patternsToMidi -> reader -> pattern' -> patternsToMidi` and the two files must be byte-identical. Text equality is too strict: C^ and C' are one pitch, and a slide into a rest changes nothing. Where the spelling has one meaning the notation also comes back as written; the reader writes C^ for the pitch the two share.``
12. old `  original text exactly.` → new `  Both checks live in tools/smf.test.mjs.`
13. old `## Build order` → new that heading plus a blank line and: ``The plan (`docs/superpowers/plans/2026-11-19-pattern-exporters.md`) refines this: the page lists the `.strudel` chips, and the plugin embeds `targets.js` in its own task.``

And three for the stem timebase (Ari caught it in review: notegrab's MIDI is written at basic-pitch's placeholder 120 bpm and 220 PPQ, so its ticks do not follow the song):

14. old ``- Reads format 0 or 1 at any PPQ, takes the tempo from the first tempo event, reads all tracks or one (`--track`).`` → new ``- Reads format 0 or 1 at any PPQ and the whole tempo map, reads all tracks or one (`--track`), and gives every note its time in ticks and in seconds.`` plus a newline and: ``- Snaps on the file's ticks by default, which is right for DAW and web-app files. A stem transcribed from audio has ticks that do not follow the song (notegrab calls basic-pitch's `predict()` without `midi_tempo`, so every file is saved at 120 bpm and 220 PPQ): `--grid-bpm N`, the song's real tempo, snaps the notes' seconds instead, and `--start S` says where step 1 falls. When the notes sit more than 15% of a step off the grid on average the report warns that the grid is probably wrong, and the CLI names basic-pitch's placeholder when it sees 120 bpm at 220 PPQ.``
15. old `- Every run prints a report: notes read, folded, dropped, and the largest snap in ticks. Sub-project A has to beat that` → new `- Every run prints a report: notes read, folded, dropped, the largest snap as a share of a step, and a warning when the notes sit off the grid. Sub-project A has to beat that`
16. old `Live MIDI out, a new interchange format, stem cleanup (sub-project A), pattern generation (sub-project C), EP-133 file` → new `Live MIDI out, a new interchange format, stem cleanup, finding a stem's tempo and downbeat for --grid-bpm and --start, and notegrab writing its MIDI at the song's tempo (all sub-project A), pattern generation (sub-project C), EP-133 file`

Check: `Select-String -Path docs/superpowers/specs/2026-11-19-pattern-exporters-design.md -Pattern 'grid-bpm'` finds at least two lines.

- [ ] **Step 2: Verify the edits landed**

Run: `Select-String -Path docs/superpowers/specs/2026-11-19-pattern-exporters-design.md -Pattern '2\.5\)|--steps|@strudel/core 1\.2\.6|byte-identical|does not call|refines this' | Measure-Object | Select-Object -ExpandProperty Count`
Expected: `6` or more. Also run `Select-String -Path docs/superpowers/specs/2026-11-19-pattern-exporters-design.md -Pattern '--bars|1\.05 \.55 \.55 \.55 \.55 \.55 \.55 \.55 1\.05'` and expect no output.

- [ ] **Step 3: Commit**

```powershell
git add docs/superpowers/specs/2026-11-19-pattern-exporters-design.md docs/superpowers/plans/2026-11-19-pattern-exporters.md
git commit -m "Spec: correct the Strudel example, the tempo line, the reader options and the round-trip check; add the plan"
```

---

### Task 2: `toStrudel`

**Files:**
- Create: `tools/load.mjs`, `targets.js`, `targets.test.mjs`

- [ ] **Step 1: Write the shared loader**

Create `tools/load.mjs`:

```js
// tools/load.mjs — runs the page's two pure scripts in node:vm the way the page loads them. Returns { T: TB303, X: TB303Targets }.
// Author: Ari Klopfer / A_Development · MIT
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadCore() {
  const sandbox = { TextEncoder };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of ['acidbass.js', 'targets.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
  return { T: sandbox.TB303, X: sandbox.TB303Targets };
}
```

- [ ] **Step 2: Write the failing tests**

Create `targets.test.mjs`:

```js
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
```

- [ ] **Step 3: Run it to see it fail**

Run: `node --test targets.test.mjs`
Expected: FAIL with `Cannot find module` or an error reading `targets.js` (it does not exist yet).

- [ ] **Step 4: Write `targets.js`**

Create `targets.js`:

```js
// targets.js — where a pattern goes next: Strudel text and Nubass-shaped MIDI. Pure like acidbass.js (no DOM) and loaded after it:
// it reads TB303.stepEvent, so tie, slide and accent mean here exactly what they mean everywhere else.
// Author: Ari Klopfer / A_Development · MIT
(function () {
  'use strict';
  const T = window.TB303;

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

  window.TB303Targets = { noteName, toStrudel };
})();
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `node --test targets.test.mjs 2>&1 | Select-String -Pattern '^ℹ (tests|pass|fail)'`
Expected: `ℹ tests 5`, `ℹ pass 5`, `ℹ fail 0`.

- [ ] **Step 6: Commit**

```powershell
git add tools/load.mjs targets.js targets.test.mjs
git commit -m "Add targets.js with toStrudel: one slot per step in the note, gain and legato layers"
```

---

### Task 3: `strudelFiles` for the page's Export

**Files:**
- Modify: `targets.js`, `targets.test.mjs`

- [ ] **Step 1: Add the failing test**

Append to `targets.test.mjs`:

```js
test('strudelFiles: one per non-empty pattern, named like the .txt beside it, with the title', () => {
  const names = (fs) => plain(fs.map((f) => f.name));
  assert.deepEqual(names(X.strudelFiles(demo)), names(T.exportFiles(demo).filter((f) => f.name.endsWith('.txt') && f.name !== 'song.txt')).map((n) => n.replace(/\.txt$/, '.strudel')));
  assert.ok(names(X.strudelFiles(demo, ' Acid/Rain: v2? ')).every((n) => n.startsWith('AcidRain v2 - ') && n.endsWith('.strudel')));
  assert.equal(X.strudelFiles(null).length, 0);
  const first = new TextDecoder().decode(X.strudelFiles(demo)[0].data);
  assert.match(first, /^\/\/ I-A1 · 16 steps · \d+ bpm\nsetcps\(\d+\/60\/4\)\nnote\(/);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --test targets.test.mjs 2>&1 | Select-String -Pattern 'strudelFiles|^ℹ fail'`
Expected: the new test FAILS with `X.strudelFiles is not a function`; `ℹ fail 1`.

- [ ] **Step 3: Implement**

In `targets.js`, add `const enc = new TextEncoder();` on the line after `const T = window.TB303;`, then add this function above the `window.TB303Targets = ...` line, and change that line to export it:

```js
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
```

- [ ] **Step 4: Run to see it pass**

Run: `node --test 2>&1 | Select-String -Pattern '^ℹ (tests|pass|fail)'`
Expected: `ℹ tests 85`, `ℹ pass 85`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```powershell
git add targets.js targets.test.mjs
git commit -m "targets.js: strudelFiles, the page's per-pattern .strudel files named like the .txt beside them"
```

---

### Task 4: Check the Strudel mapping against Strudel itself

This is the check the spec left open: does `_` extend the previous event, and do the gain and legato layers line up with it? The Strudel source already confirmed note naming (c2 = 36, `cs2` is a sharp) and that `legato` is a synonym of `clip`. This task runs real Strudel in a throwaway folder; nothing in it is committed. It needs permission to run code from an npm install, so expect a prompt.

**Files:** none in the repo. Work in a new empty folder outside it, e.g. `$env:TEMP\strudel-check`.

- [ ] **Step 1: Generate the two inputs from the CLI-free API**

Run (PowerShell, from the repo root):

```powershell
$d = Join-Path $env:TEMP 'strudel-check'; New-Item -ItemType Directory -Force $d | Out-Null
node -e "import('./tools/load.mjs').then(({loadCore})=>{const {T,X}=loadCore();const fs=require('fs');fs.writeFileSync(process.argv[1]+'/demo.strudel',X.toStrudel(T.parsePattern('A* - A A^ - A_* A - G~ A'),{name:'demo'}));fs.writeFileSync(process.argv[1]+'/tie.strudel',X.toStrudel(T.parsePattern('F* = = F C#'),{name:'tie'}));})" $d
Get-Content "$d\tie.strudel"
```
Expected: the last command prints the `tie` expression with `note("f2 _ _ f2 cs2")`.

- [ ] **Step 2: Install Strudel and write the check**

```powershell
Set-Location $d
'{"name":"strudel-check","private":true,"type":"module"}' | Set-Content package.json
bun add @strudel/core@1.2.6 @strudel/mini@1.2.6
```
Expected: `installed @strudel/core@1.2.6` and `installed @strudel/mini@1.2.6`.

Create `$d\check.mjs`:

```js
import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

await core.evalScope(core, mini);
mini.miniAllStrings();   // plain strings inside note("...") are mini-notation

const names = Object.keys(core).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k) && k !== 'default');
function events(file) {
  const code = readFileSync(file, 'utf8').split('\n').filter((l) => !l.startsWith('//') && !l.startsWith('setcps')).join('\n');
  const pat = new Function(...names, 'return ' + code)(...names.map((k) => core[k]));
  return pat.queryArc(0, 1).filter((h) => h.hasOnset()).map((h) => ({
    begin: h.whole.begin.valueOf(), end: h.whole.end.valueOf(), midi: core.noteToMidi(h.value.note), gain: h.value.gain, clip: h.value.clip,
  }));
}
const same = (got, want, label) => {
  assert.equal(got.length, want.length, label + ': event count ' + JSON.stringify(got));
  want.forEach(([begin, end, midi, gain, clip], i) => {
    const g = got[i];
    assert.ok(Math.abs(g.begin - begin) < 1e-9 && Math.abs(g.end - end) < 1e-9, label + ' #' + i + ' timing ' + JSON.stringify(g));
    assert.deepEqual([g.midi, g.gain, g.clip], [midi, gain, clip], label + ' #' + i + ' ' + JSON.stringify(g));
  });
};

const d = process.argv[2] || '.';
// A* - A A^ - A_* A - G~ A  (10 steps): the seven notes, their accents, and the slide on G~ (step 9)
same(events(d + '/demo.strudel'), [
  [0.0, 0.1, 45, 1, 0.55], [0.2, 0.3, 45, 0.7, 0.55], [0.3, 0.4, 57, 0.7, 0.55], [0.5, 0.6, 33, 1, 0.55],
  [0.6, 0.7, 45, 0.7, 0.55], [0.8, 0.9, 43, 0.7, 1.05], [0.9, 1.0, 45, 0.7, 0.55],
], 'demo');
// F* = = F C#  (5 steps): the first f2 spans three slots with its own onset gain and legato 1; the rest follow
same(events(d + '/tie.strudel'), [
  [0.0, 0.6, 41, 1, 1], [0.6, 0.8, 41, 0.7, 0.55], [0.8, 1.0, 37, 0.7, 0.55],
], 'tie');
console.log('strudel mapping holds: notes, rests, ties, gain and legato line up');
```

- [ ] **Step 3: Run it**

Run: `bun check.mjs .`
Expected: `strudel mapping holds: notes, rests, ties, gain and legato line up`.

- [ ] **Step 4: If it fails**

Do not edit `check.mjs` to make it pass. A failure means the mapping is wrong. Read the printed event, fix `toStrudel` and its Task 2 test together (for example, if `.gain` is sampled at the wrong slot for a tied event, move the tied note's gain), re-run `node --test`, and re-run this check. Common suspects: a tied event's `gain` taken from a later slot, or `_` read as a rest.

- [ ] **Step 5: Record the result in the spec and commit**

In `docs/superpowers/specs/2026-11-19-pattern-exporters-design.md`, replace the sentence beginning `Still unverified until plan Task 4 runs:` with `Checked against @strudel/core 1.2.6 on 2026-11-19 (plan Task 4): _ extends the previous event, and the gain and legato layers line up with the notes and ties.`

```powershell
Set-Location C:\Users\Arikl\Desktop\_Projects\my-lil-acid-bassline
git add docs/superpowers/specs/2026-11-19-pattern-exporters-design.md
git commit -m "Spec: the Strudel mapping is checked against Strudel itself"
```

---

### Task 5: Show the `.strudel` chips on the page

**Files:**
- Modify: `index.html` (line 148 and the Export handler around line 727)

- [ ] **Step 1: Load the script**

Edit `index.html`: old `<script src="acidbass.js"></script>` → new:

```html
<script src="acidbass.js"></script>
<script src="targets.js"></script>
```

- [ ] **Step 2: Add the chips**

Edit `index.html`: old `  const files = T.exportFiles(S, $('gTitle').value);` → new:

```js
  const title = $('gTitle').value;
  // the plugin's window has no targets.js until it is embedded (plan Task 11): without it the page just has no Strudel chips
  const files = T.exportFiles(S, title).concat(window.TB303Targets ? TB303Targets.strudelFiles(S, title) : []);
```

Edit the line below it that sets the message: old `drag a .mid chip into FL Studio, or a .txt chip to keep the pattern (click to save)` → new `drag a .mid chip into FL Studio, or a .txt / .strudel chip to keep the pattern (click to save)`.

- [ ] **Step 3: Check it in a browser (Playwright MCP, Edge, headless)**

Open `file:///C:/Users/Arikl/Desktop/_Projects/my-lil-acid-bassline/index.html`, then run this in `browser_evaluate`:

```js
() => { document.getElementById('demo').click(); document.getElementById('expFiles').click(); return [...document.querySelectorAll('#drag a.midf')].map((a) => a.textContent); }
```
Expected: 20 names: `I-A1.txt`, `I-A1.mid`, ... `I-A6.mid`, `song.txt`, `song.mid`, then `I-A1.strudel` ... `I-A6.strudel`. Also check `browser_console_messages` shows no errors. If you take a screenshot, save it under `C:\Users\Arikl\Desktop\screenshots`.

- [ ] **Step 4: Run all tests and commit**

Run: `node --test 2>&1 | Select-String -Pattern '^ℹ (tests|pass|fail)'`
Expected: `ℹ tests 85`, `ℹ pass 85`, `ℹ fail 0`.

```powershell
git add index.html
git commit -m "Page: the Export lists a .strudel chip beside each .txt and .mid"
```

---

### Task 6: The profile argument on `patternsToMidi`, and `toNubassMidi`

**Files:**
- Modify: `acidbass.js` (the `patternsToMidi` function), `targets.js`, `targets.test.mjs`

- [ ] **Step 1: Add the failing tests**

In `targets.test.mjs`, change the imports block to:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadCore } from './tools/load.mjs';
import { readSmf } from './tools/smf.mjs';
```

and add after the `demo` line: `const sha = (u8) => createHash('sha1').update(Buffer.from(u8)).digest('hex').slice(0, 16);`

Append these tests. The hashes are the SHA-1 prefixes of today's `patternsToMidi` output, captured before any change, so the first test proves the profile argument changes nothing for existing callers.

```js
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
```

These tests read their own MIDI output with `readSmf` from `tools/smf.mjs`, so the reader's first half is written in this task. It is the real code, not a stub; Task 7 adds its tests and Task 8 adds the rest of the file.

- [ ] **Step 2: Write `readSmf` (the tests need it)**

Create `tools/smf.mjs` with only this content for now (Task 8 appends the rest):

```js
// tools/smf.mjs — a Standard MIDI File in, a step pattern out: the inverse of TB303.patternsToMidi, for any file.
// readSmf() turns the bytes into notes; notesToPattern() snaps them to the 16th grid and reads accent, slide and tie off them.
// The grid is the file's own ticks, which is right for anything a DAW or the web app wrote. A stem transcribed from audio
// (notegrab, basic-pitch) is written at a placeholder 120 bpm, so its ticks do not follow the song: give notesToPattern the
// song's real tempo (gridBpm) and it snaps on seconds instead.
// Author: Ari Klopfer / A_Development · MIT

export const LO = 24, HI = 60;   // the machine's range: 13 keys, octave -1..+1
const ACCENT_VEL = 110;          // the plugin's threshold: velocity 110/127 and up is an accent
const TIE_SLACK = 0.25;          // a note within this much of a whole number of steps counts as that many
const OFF_GRID = 0.15;           // notes this far from the grid on average (in steps) mean the grid is wrong, not the playing

// d: Uint8Array / Buffer. opts.track: read only this track's notes (0-based); tempo events are read from every track.
// Returns { ppq, bpm (first tempo, or null), notes: [{ start, end, note, vel, channel, startSec, endSec }] } sorted by start.
// Ticks are the file's own; seconds follow its whole tempo map.
export function readSmf(d, opts = {}) {
  const b = Buffer.from(d);
  if (b.length < 14 || b.toString('latin1', 0, 4) !== 'MThd') throw new Error('not a MIDI file');
  const ntrks = b.readUInt16BE(10), division = b.readUInt16BE(12);
  if (division & 0x8000) throw new Error('SMPTE time division is not supported');
  let pos = 8 + b.readUInt32BE(4);
  const notes = [], tempos = [];
  for (let t = 0; t < ntrks && pos + 8 <= b.length; t++) {
    if (b.toString('latin1', pos, pos + 4) !== 'MTrk') throw new Error('missing track chunk');
    const end = Math.min(b.length, pos + 8 + b.readUInt32BE(pos + 4));
    const wanted = opts.track === undefined || opts.track === t;
    let i = pos + 8, tick = 0, status = 0;
    const open = new Map();
    const vlq = () => { let v = 0, c; do { c = b[i++]; v = (v << 7) | (c & 127); } while (c & 128 && i < end); return v; };
    const close = (key, at) => { const n = open.get(key); if (n) { notes.push({ ...n, end: at }); open.delete(key); } };
    while (i < end) {
      tick += vlq();
      let st = b[i];
      if (st & 0x80) i++; else { st = status; if (!st) throw new Error('bad running status'); }
      if (st === 0xff) {
        const type = b[i++], len = vlq();
        if (type === 0x51 && len === 3) tempos.push({ tick, us: b.readUIntBE(i, 3) });
        i += len; status = 0; continue;
      }
      if (st === 0xf0 || st === 0xf7) { i += vlq(); status = 0; continue; }
      status = st;
      const kind = st & 0xf0, a = b[i++], v = kind === 0xc0 || kind === 0xd0 ? 0 : b[i++];
      if (!wanted) continue;
      const key = ((st & 15) << 7) | a;
      if (kind === 0x90 && v > 0) { close(key, tick); open.set(key, { start: tick, note: a, vel: v, channel: st & 15 }); }
      else if (kind === 0x80 || kind === 0x90) close(key, tick);
    }
    for (const key of [...open.keys()]) close(key, tick);   // a note never switched off ends with its track
    pos = end;
  }
  // the tempo map: 120 bpm until the first tempo event (the SMF default), then each change from its tick on
  tempos.sort((x, y) => x.tick - y.tick);
  const map = [{ tick: 0, us: 500000, sec: 0 }];
  for (const t of tempos) {
    const last = map[map.length - 1];
    if (t.tick === last.tick) last.us = t.us;
    else map.push({ tick: t.tick, us: t.us, sec: last.sec + (t.tick - last.tick) * last.us / 1e6 / division });
  }
  const secOf = (tick) => { let m = map[0]; for (const x of map) { if (x.tick > tick) break; m = x; } return m.sec + (tick - m.tick) * m.us / 1e6 / division; };
  for (const n of notes) { n.startSec = secOf(n.start); n.endSec = secOf(n.end); }
  notes.sort((x, y) => x.start - y.start || x.note - y.note);
  const bpm = tempos.length ? Math.round(6e7 / tempos[0].us * 100) / 100 : null;
  return { ppq: division, bpm, notes };
}
```

(`LO`, `HI`, `ACCENT_VEL`, `TIE_SLACK` and `OFF_GRID` are used by `notesToPattern` in Task 8; they sit here so the file's head is written once.)

- [ ] **Step 3: Run to see the tests fail for the right reason**

Run: `node --test targets.test.mjs 2>&1 | Select-String -Pattern '✖|^ℹ (pass|fail)'`
Expected: `patternsToMidi profile: channel and velocities` FAILS (channel is 0, velocities 127 and 90), and the fold test and the Nubass test FAIL; the no-profile hash test PASSES (it should already match today's bytes).

- [ ] **Step 4: Add the profile to `patternsToMidi`**

In `acidbass.js`, edit 1: old

```js
  function patternsToMidi(pats, bpm, name, gate) {
    const g = gate === undefined ? 0.55 : gate;
    const ev = [];
```

→ new

```js
  // The optional profile shapes the file for one target: { channel 0-15, velAccent, velNormal, noteRange: [lo, hi], onFold(from, to) }.
  // No profile is channel 1, velocities 127 / 90 and no folding, the bytes this function always wrote. A noteRange folds out-of-range
  // notes by octaves (and calls onFold for each one); it has to span at least an octave.
  function patternsToMidi(pats, bpm, name, gate, profile) {
    const g = gate === undefined ? 0.55 : gate;
    const pr = profile || {};
    const ch = int(pr.channel, 0, 15, 0), velAcc = int(pr.velAccent, 1, 127, 127), velNorm = int(pr.velNormal, 1, 127, 90);
    const range = Array.isArray(pr.noteRange) ? pr.noteRange : null;
    if (range && !(range[1] - range[0] >= 11)) throw new RangeError('noteRange must span at least an octave');
    const fold = (m) => {
      if (!range) return m;
      let r = m;
      while (r < range[0]) r += 12;
      while (r > range[1]) r -= 12;
      if (r !== m && pr.onFold) pr.onFold(m, r);
      return r;
    };
    const ev = [];
```

Edit 2: old

```js
      const off = (tick) => { if (open !== null) { ev.push({ tick, order: 0, bytes: [0x80, open, 0] }); open = null; } };
      for (let i = 0; i < pat.len; i++) {
        const e = stepEvent(pat, i), t = base + i * STEP16;
        if (e.off) continue;
        const vel = e.accent ? 127 : 90;
        if (e.trig) { off(t); ev.push({ tick: t, order: 1, bytes: [0x90, e.midi, vel] }); open = e.midi; }
        else if (e.glide && open !== e.midi) {
          ev.push({ tick: t, order: 1, bytes: [0x90, e.midi, vel] });
          if (open !== null) ev.push({ tick: t + 2, order: 0, bytes: [0x80, open, 0] });
          open = e.midi;
        }
```

→ new

```js
      const off = (tick) => { if (open !== null) { ev.push({ tick, order: 0, bytes: [0x80 | ch, open, 0] }); open = null; } };
      for (let i = 0; i < pat.len; i++) {
        const e = stepEvent(pat, i), t = base + i * STEP16;
        if (e.off) continue;
        const vel = e.accent ? velAcc : velNorm;
        const midi = e.trig || e.glide ? fold(e.midi) : e.midi;   // a tie only holds the note already open
        if (e.trig) { off(t); ev.push({ tick: t, order: 1, bytes: [0x90 | ch, midi, vel] }); open = midi; }
        else if (e.glide && open !== midi) {
          ev.push({ tick: t, order: 1, bytes: [0x90 | ch, midi, vel] });
          if (open !== null) ev.push({ tick: t + 2, order: 0, bytes: [0x80 | ch, open, 0] });
          open = midi;
        }
```

- [ ] **Step 5: Add `toNubassMidi`**

In `targets.js`, above the `window.TB303Targets = ...` line, add:

```js
  // ponytail: the Nubass profile is plain notes and the web app's velocities until Korg's MIDI implementation chart says otherwise (plan Task 10).
  const NUBASS = { channel: 0, velAccent: 127, velNormal: 90 };
  // o: name (track name), gate (fraction of a step), profile (overrides of the Nubass profile, e.g. onFold).
  function toNubassMidi(pats, bpm, o) {
    const x = o || {};
    return T.patternsToMidi(pats, bpm, x.name || 'nubass', x.gate, Object.assign({}, NUBASS, x.profile));
  }
```

and change the export line to `window.TB303Targets = { noteName, toStrudel, strudelFiles, NUBASS, toNubassMidi };`

- [ ] **Step 6: Run everything**

Run: `node --test 2>&1 | Select-String -Pattern '✖|^ℹ (tests|pass|fail)'`
Expected: `ℹ tests 89`, `ℹ pass 89`, `ℹ fail 0`. The 79 original tests (especially the midi ones in `acidbass.test.mjs`) must still pass.

- [ ] **Step 7: Commit**

```powershell
git add acidbass.js targets.js targets.test.mjs tools/smf.mjs
git commit -m "patternsToMidi takes an optional profile (channel, velocities, note range); toNubassMidi; readSmf"
```

---

### Task 7: Test `readSmf`

`readSmf` was written in Task 6 because Task 6's tests read their own MIDI output with it. This task adds its own tests.

**Files:**
- Create: `tools/fixtures.mjs`, `tools/smf.test.mjs`

- [ ] **Step 1: Write the test fixtures**

Create `tools/fixtures.mjs`. It is test-only: a tiny MIDI writer, and a "stem" written the way basic-pitch writes one (notegrab's `uvrcore/transcription.py` calls basic-pitch's `predict()` without `midi_tempo`, so every transcription is saved at 120 bpm and pretty_midi's 220 PPQ, whatever the song's tempo).

```js
// tools/fixtures.mjs — test-only MIDI files: a tiny format-0 writer, and a "stem" written the way basic-pitch writes one.
// Author: Ari Klopfer / A_Development · MIT
import { readSmf } from './smf.mjs';

const vlq = (n) => { const b = [n & 0x7f]; while ((n >>= 7) > 0) b.unshift((n & 0x7f) | 0x80); return b; };
const be = (n, k) => Array.from({ length: k }, (_, i) => (n >>> (8 * (k - 1 - i))) & 255);

// A format-0 file from [tick, ...bytes] events, sorted by tick (note-offs before note-ons on the same tick).
export function smf(ppq, events) {
  const ev = [...events].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const body = [];
  let last = 0;
  for (const [tick, ...bytes] of ev) { body.push(...vlq(tick - last), ...bytes); last = tick; }
  body.push(0, 0xff, 0x2f, 0);
  return Uint8Array.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, ...be(ppq, 2), 0x4d, 0x54, 0x72, 0x6b, ...be(body.length, 4), ...body]);
}
export const tempo = (tick, bpm) => { const us = Math.round(6e7 / bpm); return [tick, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255]; };

// The pattern played at realBpm, starting startSec into the file, each note nudged by +-jitterMs, then written as basic-pitch
// writes a transcription: a placeholder 120 bpm at pretty_midi's 220 PPQ, so the ticks no longer follow the song's beat.
export function stemLike(T, text, realBpm, startSec = 0, jitterMs = 0) {
  const played = readSmf(T.patternsToMidi([T.parsePattern(text)], realBpm, 'x')).notes;
  const tick = (sec) => Math.round(sec * 2 * 220);   // 120 bpm = 2 beats a second, 220 ticks a beat
  const ev = [tempo(0, 120)];
  played.forEach((n, i) => {
    const j = (i % 2 ? -1 : 1) * jitterMs / 1000;
    ev.push([tick(startSec + n.startSec + j), 0x90, n.note, n.vel], [tick(startSec + n.endSec + j), 0x80, n.note, 0]);
  });
  return smf(220, ev);
}
```

- [ ] **Step 2: Write the tests**

Create `tools/smf.test.mjs`:

```js
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
```

Only `readSmf` is imported from `smf.mjs` here, because `notesToPattern` and `describe` do not exist until Task 8, which widens the import line. `stemLike` is imported now and first used in Task 8.

- [ ] **Step 3: Run**

Run: `node --test tools/smf.test.mjs 2>&1 | Select-String -Pattern '✖|^ℹ (tests|pass|fail)'`
Expected: `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`. (These pass at once because Task 6 wrote `readSmf`; they are the characterisation tests for it.)

- [ ] **Step 4: Commit**

```powershell
git add tools/fixtures.mjs tools/smf.test.mjs
git commit -m "Tests for the .mid reader: its own output in ticks and seconds, a tempo map, format 1 with running status, bad files"
```

---

### Task 8: `notesToPattern`

**Files:**
- Modify: `tools/smf.mjs`, `tools/smf.test.mjs`

- [ ] **Step 1: Restore the full test header and add the failing tests**

In `tools/smf.test.mjs`, change the import line back to `import { describe, notesToPattern, readSmf } from './smf.mjs';` and re-add after the `plain` line:

```js
const demo = T.loadDemo(T.newState());
const note = (start, end, n, vel = 90) => ({ start, end, note: n, vel, channel: 0 });
```

Append:

```js
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
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test tools/smf.test.mjs 2>&1 | Select-String -Pattern 'SyntaxError|does not provide|^ℹ (pass|fail)'`
Expected: a SyntaxError that `./smf.mjs` does not provide an export named `notesToPattern` (or `describe`).

- [ ] **Step 3: Implement**

Append to `tools/smf.mjs`:

```js

const fold = (m) => { let r = m; while (r < LO) r += 12; while (r > HI) r -= 12; return r; };
// 24..60 as { note 0-12, oct -1..1 }: twelve notes per octave, the top C only at 60 (so C^ and C' never both appear).
const stepOf = (m) => { const oct = m === HI ? 1 : Math.floor((m - LO) / 12) - 1; return { note: m - 36 - 12 * oct, oct }; };

// notes: readSmf's notes (or [{ start, end, note, vel }] in ticks). T: TB303 (emptyPattern). opts:
//   steps     pattern length, 1-32 (default: the notes' span rounded up to a multiple of 4)
//   offset    16th steps to skip from the start of the grid
//   gridBpm   the music's real tempo: snap the notes' seconds to its 16ths instead of the file's ticks (needs startSec/endSec)
//   startSec  with gridBpm, where step 1 falls in seconds (default 0)
// Returns { pattern, report }; throws when there is nothing to read or the notes run past 32 steps without a window.
export function notesToPattern(notes, ppq, T, opts = {}) {
  const offset = opts.offset || 0, origin = opts.startSec || 0;
  if (!notes.length) throw new Error('no notes in the file');
  if (opts.gridBpm !== undefined && !(opts.gridBpm > 0)) throw new Error('--grid-bpm must be a positive number');
  // where a moment sits on the 16th grid, in steps: from ticks, or from seconds at the music's real tempo (bpm / 15 steps a second)
  const at = opts.gridBpm ? (sec) => (sec - origin) * opts.gridBpm / 15 : (tick) => tick / (ppq / 4);
  const rows = notes.map((n) => {
    const p0 = opts.gridBpm ? at(n.startSec) : at(n.start), p1 = opts.gridBpm ? at(n.endSec) : at(n.end);
    return { ...n, p0, p1, s: Math.round(p0) - offset };
  });
  const ahead = rows.filter((r) => r.s >= 0);
  if (!ahead.length) throw new Error('no notes after --offset ' + offset);
  let len = opts.steps;
  if (len === undefined) {
    const span = Math.max(...ahead.map((r) => r.s)) + 1;
    if (span > 32) throw new Error('more than 32 steps (' + span + '): pick a window with --offset N and --steps N');
    len = Math.ceil(span / 4) * 4;
  }
  if (!Number.isInteger(len) || len < 1 || len > 32) throw new Error('--steps must be a whole number from 1 to 32');
  const inWindow = ahead.filter((r) => r.s < len);
  if (!inWindow.length) throw new Error('no notes inside the window (offset ' + offset + ', ' + len + ' steps)');

  // a bass: the lowest note on a step stays, the rest are counted and dropped
  const byStep = new Map();
  for (const r of inWindow) { const k = byStep.get(r.s); if (!k || r.note < k.note) byStep.set(r.s, r); }
  const kept = [...byStep.values()].sort((x, y) => x.s - y.s);
  const snaps = kept.map((k) => Math.abs(k.p0 - (k.s + offset)));
  const meanSnap = snaps.reduce((a, x) => a + x, 0) / snaps.length;
  const report = {
    read: notes.length, kept: kept.length, dropped: inWindow.length - kept.length, folded: 0,
    outside: rows.length - inWindow.length, steps: len,
    maxSnap: Math.max(...snaps), meanSnap, offGrid: meanSnap > OFF_GRID,   // in steps: 0.5 is as far off as a note can be
  };

  const p = T.emptyPattern();
  p.len = len;
  kept.forEach((k, j) => {
    const next = kept[j + 1];
    const midi = fold(k.note);
    if (midi !== k.note) report.folded++;
    const slide = !!next && next.s === k.s + 1 && k.p1 > next.p0;
    const room = (next ? next.s : len) - k.s - 1;
    const ties = slide ? 0 : Math.max(0, Math.min(room, len - 1 - k.s, Math.floor(k.p1 - k.p0 + TIE_SLACK) - 1));
    p.steps[k.s] = { gate: 'note', ...stepOf(midi), accent: k.vel >= ACCENT_VEL, slide };
    for (let t = 1; t <= ties; t++) p.steps[k.s + t].gate = 'tie';
  });
  // a note held to the end of the pattern runs into step 1 of the loop: that is how a slide off the last step is written
  const last = kept[kept.length - 1];
  if (last.s === len - 1 && last.p1 >= offset + len - 1e-6 && p.steps[0].gate === 'note') p.steps[len - 1].slide = true;
  return { pattern: p, report };
}

const pct = (x) => Math.round(x * 100) + '%';
export const describe = (r) =>
  'read ' + r.read + ' notes: ' + r.kept + ' kept, ' + r.dropped + ' dropped (one note per step, the lowest stays), ' + r.folded +
  ' folded into MIDI ' + LO + '-' + HI + ', ' + r.outside + ' outside the window; ' + r.steps + ' steps, largest snap to the grid ' +
  pct(r.maxSnap) + ' of a step' +
  (r.offGrid ? '\nwarning: the notes sit ' + pct(r.meanSnap) + ' of a step off this grid on average, so the grid is probably wrong: ' +
    'is the tempo right? A stem from notegrab / basic-pitch needs --grid-bpm <song bpm> (and --start <seconds> if step 1 is not at 0)' : '');
```

- [ ] **Step 4: Run all tests**

Run: `node --test 2>&1 | Select-String -Pattern '✖|^ℹ (tests|pass|fail)'`
Expected: `ℹ tests 104`, `ℹ pass 104`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```powershell
git add tools/smf.mjs tools/smf.test.mjs
git commit -m "notesToPattern: snap a .mid to the 16th grid (its ticks, or seconds at the song's real tempo for transcribed stems), read accent, slide and tie, warn when the grid is wrong"
```

---

### Task 9: The command line

**Files:**
- Create: `tools/pattern-export.mjs`, `tools/pattern-export.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tools/pattern-export.test.mjs`:

```js
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
import { stemLike } from './fixtures.mjs';

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
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test tools/pattern-export.test.mjs 2>&1 | Select-String -Pattern '^ℹ (pass|fail)'`
Expected: all 6 fail (the CLI file does not exist, so each run exits with `Cannot find module`).

- [ ] **Step 3: Write the CLI**

Create `tools/pattern-export.mjs`:

```js
// tools/pattern-export.mjs — one pattern in (step notation, pattern JSON, or a .mid), one target out (strudel, nubass, notation).
//   bun tools/pattern-export.mjs I-A1.txt --to strudel
//   bun tools/pattern-export.mjs bass-stem.mid --to notation --steps 16 --offset 32
//   bun tools/pattern-export.mjs I-A1.txt --to nubass --out I-A1-nubass.mid
//   bun tools/pattern-export.mjs bass-stem.mid --to strudel --grid-bpm 128 --start 0.47   (a notegrab / basic-pitch stem)
// Author: Ari Klopfer / A_Development · MIT
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { loadCore } from './load.mjs';
import { describe, notesToPattern, readSmf } from './smf.mjs';

const TARGETS = ['strudel', 'nubass', 'notation'];
const USAGE = 'usage: pattern-export <input.txt|.json|.mid> --to strudel|nubass|notation [--out file] [--force] [--bpm N] [--name X] [--steps N] [--offset N] [--track N] [--grid-bpm N] [--start SECONDS]';

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--force') a.force = true;
    else if (x.startsWith('--')) {
      if (argv[i + 1] === undefined) throw new Error(x + ' needs a value');
      a[x.slice(2)] = argv[++i];
    } else a._.push(x);
  }
  return a;
}

function run(argv) {
  const a = parseArgs(argv);
  if (a._.length !== 1 || !a.to) throw new Error(USAGE);
  if (!TARGETS.includes(a.to)) throw new Error('unknown target "' + a.to + '": use ' + TARGETS.join(', '));
  const num = (name) => {
    if (a[name] === undefined) return undefined;
    const n = Number(a[name]);
    if (!Number.isFinite(n)) throw new Error('--' + name + ' needs a number');
    return n;
  };
  const { T, X } = loadCore();
  const file = a._[0], ext = extname(file).toLowerCase();
  const raw = readFileSync(file);
  const name = a.name || basename(file, extname(file));
  let pattern, bpm = num('bpm');
  if (ext === '.mid' || ext === '.midi') {
    const m = readSmf(raw, { track: num('track') });
    const gridBpm = num('grid-bpm');
    // basic-pitch (and so notegrab) writes every transcription at 120 bpm and 220 PPQ, whatever the song's tempo
    if (!gridBpm && m.ppq === 220 && m.bpm === 120) console.error('this file has basic-pitch\'s placeholder tempo (120 bpm at 220 PPQ): its ticks do not follow the song; pass --grid-bpm <song bpm>');
    const r = notesToPattern(m.notes, m.ppq, T, { steps: num('steps'), offset: num('offset'), gridBpm, startSec: num('start') });
    pattern = r.pattern;
    bpm = bpm || gridBpm || m.bpm || undefined;
    console.error(describe(r.report));
  } else {
    const text = raw.toString('utf8');
    if (ext === '.json') pattern = T.cleanPattern(JSON.parse(text));
    else {
      // the exported .txt files start with "# ..." comment lines; the first of them says the tempo
      pattern = T.parsePattern(text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).join(' '));
      bpm = bpm || Number((/(\d+) bpm/.exec(text) || [])[1]) || undefined;
    }
  }
  bpm = bpm || 120;

  let out;
  if (a.to === 'strudel') out = X.toStrudel(pattern, { name, bpm });
  else if (a.to === 'notation') out = T.formatPattern(pattern) + '\n';
  else {
    if (!a.out) throw new Error('nubass writes a .mid file: give --out file.mid');
    out = X.toNubassMidi([pattern], bpm, { name, profile: { onFold: (from, to) => console.error('folded MIDI ' + from + ' to ' + to) } });
  }
  if (!a.out) { process.stdout.write(out); return; }
  try { writeFileSync(a.out, out, { flag: a.force ? 'w' : 'wx' }); }
  catch (e) { throw e.code === 'EEXIST' ? new Error(a.out + ' exists: pass --force to overwrite it') : e; }
  console.error('wrote ' + a.out);
}

try { run(process.argv.slice(2)); }
catch (e) { console.error(e.message); process.exit(1); }
```

- [ ] **Step 4: Run all tests**

Run: `node --test 2>&1 | Select-String -Pattern '✖|^ℹ (tests|pass|fail)'`
Expected: `ℹ tests 110`, `ℹ pass 110`, `ℹ fail 0`.

- [ ] **Step 5: Try it on a real file**

Build a `.mid` of demo pattern 1: `node -e "import('./tools/load.mjs').then(({loadCore})=>{const {T}=loadCore();require('fs').writeFileSync(process.argv[1],T.patternsToMidi([T.loadDemo(T.newState()).patterns[0]],120,'x'))})" "$env:TEMP\demo1.mid"`, then `node tools/pattern-export.mjs "$env:TEMP\demo1.mid" --to strudel --steps 16`.
Expected: a report line on stderr (`read 10 notes: 10 kept, 0 dropped ...`) and a Strudel expression on stdout whose `note(...)` line starts `a2 ~ a2 a3`. This is the same line you would paste into Strudel.

- [ ] **Step 6: Commit**

```powershell
git add tools/pattern-export.mjs tools/pattern-export.test.mjs
git commit -m "tools/pattern-export.mjs: notation, JSON or .mid in; Strudel, Nubass MIDI or notation out"
```

---

### Task 10: The Nubass profile, from Korg's chart

This task cannot be finished from this plan alone: its values come from a document nobody has read yet (a web search found Korg's download pages but not the chart's contents). Do not guess.

**Files:**
- Modify: `targets.js`, `targets.test.mjs`, the spec

- [ ] **Step 1: Read the chart**

Find Korg's "volca nubass MIDI Implementation" (a PDF chart and a text file are on korg.com's support downloads for the volca nubass). Read it and write down, in the spec's Nubass section, exactly these facts and nothing inferred: (a) the receive channel and whether it is changeable; (b) whether note-on velocity changes anything; (c) every control-change number it lists, with its name; (d) its playable note range, if given.

- [ ] **Step 2: Decide with the table**

| The chart says | Do this |
|---|---|
| Channel N (1-16), velocity ignored, no CC for accent or slide, a note range `[lo, hi]` | Set `NUBASS = { channel: N - 1, velAccent: 127, velNormal: 90, noteRange: [lo, hi] }` in `targets.js` (velocity can stay; it is ignored). Add the test below. |
| Velocity matters | Also set `velAccent` and `velNormal` to values that make accents audible, and say why in the comment. |
| It lists a CC that means accent or slide | Stop. `patternsToMidi` has no CC output. Write that as a new spec section and a new plan; do not bolt it on. |

- [ ] **Step 3: Test the profile you set**

Append to `targets.test.mjs` (replace the three bracketed values with the ones you set, and the expectation with what the chart means):

```js
test('NUBASS is the chart\'s profile: its channel, and notes folded into its range', () => {
  const m = readSmf(X.toNubassMidi([T.parsePattern('C_ C^')], 120));
  assert.deepEqual(plain(m.notes.map((n) => [n.channel, n.note >= X.NUBASS.noteRange[0] && n.note <= X.NUBASS.noteRange[1]])), [[X.NUBASS.channel, true], [X.NUBASS.channel, true]]);
});
```

If the chart gives no note range, leave `noteRange` out of `NUBASS` and drop the range half of that assert. This test reads the profile it is checking, so it proves the folding is wired, not that the values are right. The values' only proof is Step 1's note from the chart, kept in the spec.

- [ ] **Step 4: Run and commit**

Run: `node --test 2>&1 | Select-String -Pattern '✖|^ℹ (tests|pass|fail)'`
Expected: all pass (`tests 111`).

```powershell
git add targets.js targets.test.mjs docs/superpowers/specs/2026-11-19-pattern-exporters-design.md
git commit -m "Nubass profile from Korg's MIDI implementation chart"
```

---

### Task 11: Embed `targets.js` in the plugin

The plugin's window is the same `index.html`. Its page now asks for `/targets.js`, which the plugin does not serve, so it has no Strudel chips (guarded in Task 5, nothing breaks). This task serves it. It changes C++ and CMake, so it needs the CI build to prove it: do it on this branch and read the CI result.

**Files:**
- Modify: `plugin/CMakeLists.txt` (lines 28-30), `plugin/Source/Editor.cpp` (the `assets` table), `.github/workflows/plugin.yml` (both `paths` lists), `plugin/README.md` (line 64)

- [ ] **Step 1: Make the four edits**

1. `plugin/CMakeLists.txt`: old `    ../index.html ../acidbass.js ../factory.js ../ui-bridge.js ui/juce-frontend.js)` → new `    ../index.html ../acidbass.js ../targets.js ../factory.js ../ui-bridge.js ui/juce-frontend.js)`. Also in the comment line above it, change `index.html, acidbass.js, factory.js and ui-bridge.js` to `index.html, acidbass.js, targets.js, factory.js and ui-bridge.js`.
2. `plugin/Source/Editor.cpp`: old `    { "/acidbass.js",       "acidbass_js",       "text/javascript" },` → that line plus a new line after it: `    { "/targets.js",        "targets_js",        "text/javascript" },` (JUCE names the resource after the file with the dot and dashes removed, as `acidbass.js` becomes `acidbass_js` and `ui-bridge.js` becomes `uibridge_js`).
3. `.github/workflows/plugin.yml`: in both `paths:` lists, add `      - 'targets.js'` after the `'acidbass.js'` line (it appears at lines 10 and 18).
4. `plugin/README.md` line 64: old ``(`index.html`, `acidbass.js`, `factory.js`, `ui-bridge.js`)`` → new ``(`index.html`, `acidbass.js`, `targets.js`, `factory.js`, `ui-bridge.js`)``.

- [ ] **Step 2: Check the diff is only those lines**

Run: `git diff --stat`
Expected: four files, a handful of changed lines each. A whole-file diff means line endings broke: undo that file with `git checkout -- <file>` and redo the edit.

- [ ] **Step 3: Push the branch and read the plugin build**

```powershell
git add plugin/CMakeLists.txt plugin/Source/Editor.cpp .github/workflows/plugin.yml plugin/README.md
git commit -m "Plugin: embed targets.js so the plugin window gets the Strudel chips too"
git push -u origin feat/pattern-exporters
gh run list --branch feat/pattern-exporters --limit 3
```
Expected: a `plugin` run starts for this push. Watch it with `gh run watch <id>`. It must finish green. A red run on a `BinaryData` or `getNamedResource` error means the resource name in Editor.cpp is wrong: copy the exact symbol from the `BinaryData` header in the failing log.

- [ ] **Step 4: Say what was not tested**

The CI build proves the plugin compiles and serves the file. It does not prove the Strudel chips appear inside FL Studio's window: that needs the built VST3 opened in FL Studio, which only Ari can do. Report it as untested.

---

### Task 12: README, final run, hand-off

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the docs**

In `README.md`, read the `**Export.**` paragraph (line 68), then add this paragraph directly after it (keep a blank line before and after):

```markdown
**Other tools.** The Export also lists a `.strudel` file per pattern: one Strudel expression with a slot per step, accents as gain, slides as overlap, ties as `_`. `tools/pattern-export.mjs` (Bun or node) turns a pattern into other things: `bun tools/pattern-export.mjs I-A1.txt --to strudel`, `--to notation`, or `--to nubass --out file.mid` for a Volca Nubass MIDI file. Its input can be the exported `.txt`, a pattern JSON, or any `.mid` (a stem's notes, say): it snaps the notes to 16ths, keeps the lowest note per step, folds anything outside MIDI 24-60 by octaves, and prints what it dropped and folded. `--steps N` and `--offset N` pick a window of a longer file. A stem transcribed by notegrab is saved at basic-pitch's placeholder 120 bpm, so its notes would come out scrambled: pass `--grid-bpm` with the song's real tempo (and `--start` with where step 1 falls, in seconds). The tool warns when the notes sit off the grid.
```

If Task 10 produced a Nubass profile, add one sentence to it stating the channel and range, from the chart.

- [ ] **Step 2: Run the whole suite one last time**

Run: `node --test 2>&1 | Select-String -Pattern '✖|^ℹ (tests|pass|fail)'`
Expected: `ℹ fail 0` and `pass` equal to `tests` (110, or 111 after Task 10).

- [ ] **Step 3: Commit and report**

```powershell
git add README.md
git commit -m "README: the .strudel export and tools/pattern-export.mjs"
git log --oneline main..HEAD
```

Report to Ari, in this order: what runs and was verified (test count, the Task 4 Strudel check, the Task 5 page check, CI result); what was not verified (the plugin window in FL Studio; Nubass values if Task 10 was skipped; real stems, which were never fed through the reader, so sub-project A still has no baseline from real audio); and the open decision (merge to `main` or a pull request).

---

## Self-review

**Spec coverage.** Strudel mapping: Tasks 2-4. `strudelFiles` and the page's Export: Tasks 3 and 5. Nubass profile and `patternsToMidi` change: Tasks 6 and 10. `.mid` reader: Tasks 6-8. CLI: Task 9. Plugin embedding (found during planning, not in the spec's original task list): Task 11. Spec corrections: Task 1. README: Task 12. Out-of-scope items (live MIDI, a new format, stem cleanup, generation, EP-133 import) have no task, as intended.

**Where the plan changes the spec, and why:** the spec's Strudel example had a wrong slide at step 1 and the tempo line was wrong for patterns not 16 steps long; `--bars` became `--steps`; the round-trip check compares bytes, not text, because C^ and C' are one pitch; the page lists chips rather than building a zip; a note followed by ties gets legato 1. All are in Task 1.

**Placeholders.** Task 10 is gated on a document that has not been read; its values cannot be written here, and it says so and says what to do for each answer. Every other step has its code and expected output.

**Proof the code works.** Every code block in Tasks 2, 3, 6, 7, 8 and 9 was run in a scratch copy of the repo on 2026-11-19 before this plan was written: the 31 new tests passed (26 first, then 5 more for the stem timebase), the 39 tests in `acidbass.test.mjs` still passed against the changed `acidbass.js`, and the no-profile MIDI hashes matched the bytes captured before the change. Task 4's Strudel check was not run (running the installed Strudel package needs a permission that was not given in that session).

**Type consistency.** `readSmf` returns `{ ppq, bpm, notes: [{start, end, note, vel, channel}] }` and `notesToPattern(notes, ppq, T, opts)` takes those fields (Tasks 6-9). `toStrudel(pat, opts)` and `toNubassMidi(pats, bpm, o)` have the same signatures in the tests, the CLI and the exports. `strudelFiles(raw, title)` is called with the page's state `S` in Task 5. The profile keys (`channel`, `velAccent`, `velNormal`, `noteRange`, `onFold`) are the same in `patternsToMidi`, `NUBASS` and the CLI. Test counts: 79, then 84 (Task 2), 85 (3), 85 (5), 89 (6), 93 (7), 104 (8), 110 (9), 111 (10). `gridBpm` and `startSec` are the same names in `notesToPattern`, its tests and the CLI (which spells them `--grid-bpm` and `--start`).

**Stem timebase (added after review).** Notegrab's MIDI comes from basic-pitch at a placeholder 120 bpm and 220 PPQ (`uvrcore/transcription.py` calls `predict()` without `midi_tempo`; basic-pitch then builds `PrettyMIDI(initial_tempo=120)`), so a reader that snaps on ticks scrambles any stem whose song is not at 120. Tasks 6-9 now carry seconds through `readSmf`, snap on them when given the song's tempo, and warn when notes sit off the grid. Finding the tempo and downbeat automatically stays in sub-project A.
