# Pattern exporters: Strudel, Nubass MIDI and a `.mid` reader

Date: 2026-11-19. Author: Ari Klopfer / A_Development.
Sub-project B of three (A: stem extraction accuracy, C: pattern generation). B comes first because A and C both hand their
output to it.

## Problem

Basslines made in the web app or the plugin, and basslines pulled from stems, reach VCV Rack, Strudel / EP-133 and the
Volca Nubass by four routes: MIDI file drag, pasted step notation, live MIDI through loopMIDI / FL, and retyping by hand.
Accent, slide and tie get lost on the way, and Strudel has no exporter at all. The aim is that a pattern arrives in each
tool with its notes, accents, slides and ties intact, without hand fixing.

## Decisions

- The pattern format stays what it is: the step notation (`parsePattern` / `formatPattern`) and the pattern JSON. Nothing
  new carries a pattern. Optional JSON fields can be added later if sub-project A needs them.
- Tie, slide and accent rules live in one place, `stepEvent` in `acidbass.js`. Every exporter calls it and never
  re-derives them, because that is where feel drifts between tools.
- Strudel is the first exporter (it is the only route with no exporter). Nubass MIDI is second. Rack paste and handoff
  polish is last and has no code in this spec beyond the shared pieces.

## Components

### `targets.js` (new, repo root)

Pure code, no DOM, written as an IIFE like `acidbass.js` so the `node:vm` loader in the tests runs it. It exposes
`window.TB303Targets`:

- `toStrudel(pattern, opts)` returns one Strudel expression as a string.
- `strudelFiles(rawState, title)` returns the page's per-pattern `{name, data}` files, named like the `.txt` beside them.
- `toNubassMidi(patterns, bpm, profile)` returns MIDI bytes (see Nubass profile).

It reads `TB303.stepEvent` and `TB303.midiOf`; it holds no pattern rules of its own.

### Strudel mapping

One pattern is one expression; each step takes one slot in every layer, rests included, so the layers stay aligned.

```js
// I-A1 · 10 steps · 120 bpm
setcps(120/60/2.5)
note("a2 ~ a2 a3 ~ a1 a2 ~ g2 a2")
  .gain("1 .7 .7 .7 .7 1 .7 .7 .7 .7")
  .legato(".55 .55 .55 .55 .55 .55 .55 .55 1.05 .55")
  .s("sawtooth")
```

| Notation | Strudel |
|---|---|
| note | scientific pitch name; the machine's C2 (MIDI 36) is `c2` |
| rest `-` | `~` |
| tie `=` | `_` (extends the previous event, no retrigger); the note before it gets legato 1 so it fills the slots |
| accent `*` | gain 1 instead of .7 (matches MIDI velocity 127 vs 90) |
| slide `~` | legato 1.05, so the note runs into the next one; other steps use the pattern's gate length (0.55 default) |
| octave `^` `_` | carried by the name (`a3`, `a1`) |

The header comment holds the slot name, step count and tempo, and a root note when one is known.

Strudel facts, read from the @strudel/core 1.2.6 source: noteToMidi gives c2 = 36 and c4 = 60, an s after a letter is a sharp (cs2), and legato is a synonym of clip, which multiplies the event's duration. A tie on step 1 plays as a rest (nothing before it to extend). The cycle is the whole pattern, so the tempo line is setcps(bpm/60/(len/4)).
Still unverified until plan Task 4 runs: that _ extends the previous event and that the gain and legato layers line up with it. Strudel has no pitch glide that was checked, so a slide renders as overlap, not a pitch ramp.

### Nubass MIDI profile

`toNubassMidi` wraps the existing `patternsToMidi`, which gains an optional `profile` argument so tie, slide and gate
logic is not duplicated. The profile is `{ channel, velAccent, velNormal, accentCC?, slideCC?, noteRange }`.

- The default profile is today's behaviour (channel 1, velocity 127 / 90). With it, `patternsToMidi` output is
  byte-identical to now, so the web export does not change.
- The Nubass profile starts equal to the default. Its values (channel, whether velocity counts, any accent or slide CC,
  playable range) are filled in only after reading Korg's MIDI implementation chart for the volca nubass; a web search for
  it returned download pages but not the chart's contents, so nothing about the Nubass is assumed here.
- Notes outside `noteRange` fold by octave, and the exporter reports each fold.
- It writes a file. Live MIDI out stays on the current route (FL / loopMIDI).

### `tools/smf.mjs` (new): the `.mid` reader

`parseMidi` in `acidbass.js` reads live Web MIDI bytes; it is not a file reader, so this is new.

- Reads format 0 or 1 at any PPQ and the whole tempo map, reads all tracks or one (`--track`), and gives every note its time in ticks and in seconds.
- Snaps on the file's ticks by default, which is right for DAW and web-app files. A stem transcribed from audio has ticks that do not follow the song (notegrab calls basic-pitch's `predict()` without `midi_tempo`, so every file is saved at 120 bpm and 220 PPQ): `--grid-bpm N`, the song's real tempo, snaps the notes' seconds instead, and `--start S` says where step 1 falls. When the notes sit more than 15% of a step off the grid on average the report warns that the grid is probably wrong, and the CLI names basic-pitch's placeholder when it sees 120 bpm at 220 PPQ.
- Snaps note starts to the nearest 16th. Velocity of 110 or more is an accent. A note that overlaps the next one is a
  slide. A note that runs past a step boundary with no new note-on is a tie.
- Polyphony: keeps the lowest note per step (it is a bass) and counts what it drops.
- A note that runs to the end of the pattern is read as a slide into step 1 when step 1 is a note. That is how patternsToMidi writes a slide off the last step.
- The machine covers MIDI 24-60 (13 keys, octave -1 to +1). Notes outside fold by octave and are reported.
- More than 32 steps is an error with a hint (`--offset`, `--steps`), never a silent cut. `--steps` sets the pattern length (1-32); without it the length is the notes' span rounded up to a multiple of 4.
- Every run prints a report: notes read, folded, dropped, the largest snap as a share of a step, and a warning when the notes sit off the grid. Sub-project A has to beat that
  report.

### `tools/pattern-export.mjs` (new, Bun)

Input: step notation text, pattern JSON, or a `.mid`. Output: a chosen target (`strudel`, `nubass`, `notation`) to stdout
or a file. It loads `acidbass.js` and `targets.js` the way the tests do. It refuses to overwrite an existing output file
without `--force`.

### Web app

The page's Export lists `exportFiles` as draggable chips (it does not call `zip` today, whatever the README says). `targets.js` adds a `<name>.strudel` chip next to each `.txt` and `.mid`; `exportFiles` itself cannot, because `acidbass.js` is loaded without `targets.js`. No new UI.

## Errors

The CLI prints the existing `bad step "x"` message and exits 1. An unknown target lists the valid ones. The reader errors
on an empty file and on more than 32 steps.

## Tests

`node --test`, same loader as `acidbass.test.mjs`.

- Strudel: exact strings for the six demo patterns; note, gain and legato layers have equal length; a tie is `_`; a slide
  has legato 1.05; an accent has gain 1.
- Nubass default profile: bytes equal today's `patternsToMidi` output.
- Round trip: each demo pattern goes `pattern -> patternsToMidi -> reader -> pattern' -> patternsToMidi` and the two files must be byte-identical. Text equality is too strict: C^ and C' are one pitch, and a slide into a rest changes nothing. Where the spelling has one meaning the notation also comes back as written; the reader writes C^ for the pitch the two share.
  Both checks live in tools/smf.test.mjs.
- Reader failures: more than 32 steps, a polyphonic file (drop count), an empty file.
- Manual, once: play the generated Strudel line in the Strudel REPL and compare its pitch with the web app, and compare
  `c2` against the `.strudel` files `notegrab` writes. Record the result in this file.

## Build order

The plan (`docs/superpowers/plans/2026-11-19-pattern-exporters.md`) refines this: the page lists the `.strudel` chips, and the plugin embeds `targets.js` in its own task.

Each step is its own commit and has its own passing test.

1. `targets.js` with `toStrudel`, plus tests.
2. `exportFiles` writes `.strudel` into the zip. First check whether `plugin/` embeds a copy of `acidbass.js` that needs
   resyncing.
3. `tools/smf.mjs` and the round-trip test.
4. `tools/pattern-export.mjs`.
5. The `profile` argument on `patternsToMidi` and the Nubass profile, after reading Korg's chart.
6. A README section.

## Out of scope

Live MIDI out, a new interchange format, stem cleanup, finding a stem's tempo and downbeat for --grid-bpm and --start, and notegrab writing its MIDI at the song's tempo (all sub-project A), pattern generation (sub-project C), EP-133 file
import (how it imports MIDI is unconfirmed).
