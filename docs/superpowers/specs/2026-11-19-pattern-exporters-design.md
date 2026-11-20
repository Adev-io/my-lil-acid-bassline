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
- `toNubassMidi(patterns, bpm, profile)` returns MIDI bytes (see Nubass profile).

It reads `TB303.stepEvent` and `TB303.midiOf`; it holds no pattern rules of its own.

### Strudel mapping

One pattern is one expression; each step takes one slot in every layer, rests included, so the layers stay aligned.

```js
// I-A1 · 16 steps · 120 bpm
setcps(120/60/4)
note("a2 ~ a2 a3 ~ a1 a2 ~ g2 a2")
  .gain("1 .7 .7 .7 .7 1 .7 .7 .7 .7")
  .legato("1.05 .55 .55 .55 .55 .55 .55 .55 1.05 .55")
  .s("sawtooth")
```

| Notation | Strudel |
|---|---|
| note | scientific pitch name; the machine's C2 (MIDI 36) is `c2` |
| rest `-` | `~` |
| tie `=` | `_` (extends the previous event, no retrigger) |
| accent `*` | gain 1 instead of .7 (matches MIDI velocity 127 vs 90) |
| slide `~` | legato 1.05, so the note runs into the next one; other steps use the pattern's gate length (0.55 default) |
| octave `^` `_` | carried by the name (`a3`, `a1`) |

The header comment holds the slot name, step count and tempo, and a root note when one is known.

Known limits: Strudel has no pitch glide that was checked, so a slide renders as overlap, not a pitch ramp. The octave
naming (`c4` = middle C) is believed, not confirmed; see the manual check under Tests.

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

- Reads format 0 or 1 at any PPQ, takes the tempo from the first tempo event, reads all tracks or one (`--track`).
- Snaps note starts to the nearest 16th. Velocity of 110 or more is an accent. A note that overlaps the next one is a
  slide. A note that runs past a step boundary with no new note-on is a tie.
- Polyphony: keeps the lowest note per step (it is a bass) and counts what it drops.
- The machine covers MIDI 24-60 (13 keys, octave -1 to +1). Notes outside fold by octave and are reported.
- More than 32 steps is an error with a hint (`--bars`, `--offset`), never a silent cut.
- Every run prints a report: notes read, folded, dropped, and the largest snap in ticks. Sub-project A has to beat that
  report.

### `tools/pattern-export.mjs` (new, Bun)

Input: step notation text, pattern JSON, or a `.mid`. Output: a chosen target (`strudel`, `nubass`, `notation`) to stdout
or a file. It loads `acidbass.js` and `targets.js` the way the tests do. It refuses to overwrite an existing output file
without `--force`.

### Web app

`exportFiles` adds a `<name>.strudel` file next to each `.txt` and `.mid` in the existing Export folder zip. No new UI.

## Errors

The CLI prints the existing `bad step "x"` message and exits 1. An unknown target lists the valid ones. The reader errors
on an empty file and on more than 32 steps.

## Tests

`node --test`, same loader as `acidbass.test.mjs`.

- Strudel: exact strings for the six demo patterns; note, gain and legato layers have equal length; a tie is `_`; a slide
  has legato 1.05; an accent has gain 1.
- Nubass default profile: bytes equal today's `patternsToMidi` output.
- Round trip: each demo pattern goes `pattern -> patternsToMidi -> smf reader -> formatPattern` and must equal the
  original text exactly.
- Reader failures: more than 32 steps, a polyphonic file (drop count), an empty file.
- Manual, once: play the generated Strudel line in the Strudel REPL and compare its pitch with the web app, and compare
  `c2` against the `.strudel` files `notegrab` writes. Record the result in this file.

## Build order

Each step is its own commit and has its own passing test.

1. `targets.js` with `toStrudel`, plus tests.
2. `exportFiles` writes `.strudel` into the zip. First check whether `plugin/` embeds a copy of `acidbass.js` that needs
   resyncing.
3. `tools/smf.mjs` and the round-trip test.
4. `tools/pattern-export.mjs`.
5. The `profile` argument on `patternsToMidi` and the Nubass profile, after reading Korg's chart.
6. A README section.

## Out of scope

Live MIDI out, a new interchange format, stem cleanup (sub-project A), pattern generation (sub-project C), EP-133 file
import (how it imports MIDI is unconfirmed).
