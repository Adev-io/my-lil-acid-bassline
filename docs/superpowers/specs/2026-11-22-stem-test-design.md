# Stem test: score a section's stems, then A/B them in Rack

Author: Ari Klopfer / A_Development · 2026-11-22 · status: approved design, not built

## Why

The pattern exporters (2026-11-19 spec, merged as fc79394) read a stem `.mid` into an acid step pattern. On 2026-11-20 one real stem
(arrow-rapsong hook bass) read cleanly, and its bass plus guitar chords played in arrow-remix (Acid Bass slot I-A5, Roll 16 → Triple).
That was a one-off script with no score. To know whether a reader change helps, each test needs a number to filter bad reads plus an
ear verdict on the survivors, and the same run must be repeatable against a saved baseline.

## Scope

One run = one crate section, all its melodic parts (`2-bass`, `3-guitar`, `5-other`; drums skipped).
Out of scope: drums, rendering through Rack and re-transcribing (round trip), audio-level compare, auto-tuning the reader, more than
one section per run.

## Command

```
bun tools/stem-test-run.mjs <crate> <section> [--load | --restore]
bun tools/stem-test-run.mjs arrow-rapsong-crate 04_hook
```

- `<crate>`: a folder under `~/Desktop/uvr-loops/crates/`. `<section>`: the `NN_name` part of the file names, e.g. `04_hook` matches
  `2-bass-04_hook-89bpm.wav`. The tempo comes from the `-<N>bpm` suffix; step 1 is at 0 s (crate loops are cut on the bar).
- A section with no file for a part skips that part and says so. No file at all → error, nothing written.

## Steps

1. **Transcribe.** For each part, use `~/Desktop/uvr-loops/notegrab/<stem>/<stem>.mid` if it exists; otherwise run notegrab
   (`uvrcore.notes.grab`, mode `loop`, outputs json+midi+html) with the venv Python in `~/dev/mcp-servers/my-lil-uvr-mcp`.
2. **Convert.**
   - **bass → Acid Bass** (mono, 32 steps): `notesToPattern` with `gridBpm` = section bpm, `startSec` 0, `steps` 32, tried at every
     offset 0, 32, 64, … that holds notes. Each window is scored (below); the window with the most stem notes kept wins, then the higher F1, then the earlier window.
   - **guitar, other → Roll** (polyphonic): every note snapped to 1/16 at the section bpm (Roll PPQ 96, a 16th = 24 ticks, minimum
     length one 16th), the first 16 bars in one pattern (`bars` = enough bars to hold the last note start, max 16). No window search:
     Roll holds up to 16 bars, and stem notes past bar 16 are ignored.
3. **Score** each part (below) and print one table row per part: part, target, window (bass only), F1, kept / dropped / extra,
   off-grid % (the reader's own report).
   The "off grid" column is the reader's mean snap over the notes it kept (bass) and the mean snap over the stem's notes (Roll parts).
4. **Write** to `~/Desktop/uvr-loops/notegrab/stem-test/<crate>-<section>/`: `results.md` (the table plus an empty `ear` column),
   `results.json` (the same numbers, machine-read), `bass-acid.json`, `guitar-roll.txt`, `other-roll.txt`.
5. **Baseline.** The first run of a section also copies `results.json` to `baseline.json`. Later runs print each part's F1 change
   against it and mark a part FAIL when its F1 dropped by more than 0.05. `baseline.json` is never overwritten by the tool.

## Score

F1 on note onsets, per part, over the stem notes that fall inside the scored span (the bass window, or the first 16 bars, Roll's cap, for Roll parts; stem notes past
bar 16 are ignored):

- A stem note is **hit** when the converted part has a note starting within half a 16th step of it with the same pitch class
  (octave ignored: the reader folds to MIDI 24-60). Each converted note can hit at most one stem note.
- precision = hits / converted notes, recall = hits / stem notes, F1 = 2PR / (P + R); 0 when either side is empty.
- kept = hits, dropped = stem notes not hit, extra = converted notes that hit nothing.

For the Roll parts the snap moves a note by at most half a step, so F1 there is close to 1 and mainly guards the conversion. The ear
verdict carries those parts. For the bass, F1 measures what the mono reader drops (chords, notes between 16ths, overlaps).

## Ear A/B in Rack

- The Rack MCP is the My lil MCP module 2.0.0 (source `C:\Users\Arikl\dev\active\my-lil-mcp`; tools `vcvrack_get_module_state` /
  `vcvrack_set_module_state`). The older bridge in `dev/mcp-servers/vcv-rack-plugin-mcp-server` has different tool names
  (`vcvrack_get_module_data` / `vcvrack_set_module_data`) and is not the one this targets.
- `--load` writes the winners into the open patch over the Rack MCP's HTTP endpoint (`http://127.0.0.1:2600/mcp`,
  `tools/call`), into fixed test slots: bass → Acid Bass slot index 4 (shown as **I-A5**), guitar → Roll pattern **16**,
  other → Roll pattern **15**. No other slot changes.
- `--load` pushes only the parts this run produced; part files left in the section folder by an earlier run are not sent.
- **Backup first:** before any write it saves the Acid Bass and Roll module states and Triple's V/OCT and GATE input cables to
  `before.json`, one file in the stem-test folder (`notegrab/stem-test/`) shared by all sections. If `before.json` already
  exists it is kept (the first backup is the real one), so loading section X then section Y still restores to the state before X.
- It then patches Roll V/OCT → Triple V/OCT and Roll GATE → Triple GATE, replacing whatever fed those inputs.
- `--restore` (still given the crate and section) puts back only the three test slots (Acid Bass slot index 4, Roll patterns 15
  and 16) and Triple's original input cables from `before.json`; the current state of every other slot, and Roll's key and
  mode, is kept. It then renames the backup `before.restored-<timestamp>.json` in the same folder.
- Module states are sent as `{ id, plugin, model, version, data }` (Rack's `moduleFromJson` needs `plugin`; params are left alone).
  Acid Bass's `data.patterns` must list every slot in order: a missing slot loads empty.
- Rack not running (connection refused) → "open the patch in Rack first", nothing written to Rack (the run's own files are still
  written). A module missing from the patch
  (no Acid Bass, Roll or Triple), or a second one of the same kind → name it and stop before any write.
- Switching by hand: Acid Bass PATTERN I-A1 (yours) vs I-A5; Roll PATTERN 14 (yours) vs 15 / 16.
- **Verdict:** Ari fills the `ear` column in `results.md` with `keep`, `close` or `bad` per part. A `keep` with a low F1 (or a `bad`
  with a high one) means the score is wrong, not the ear.

## Checks

All run by `node --test` with the rest of the suite:

- `tools/stem-score.test.mjs` (11 tests), including the spec checks: (1) a pattern written to MIDI by the app (`patternsToMidi`), read
  back and scored against its own notes → F1 = 1; (2) the same notes moved by one semitone → F1 = 0; (3) a phrase placed at offset 32
  of an otherwise empty stem → the window search picks offset 32.
- `tools/stem-test.test.mjs` (9 tests): the CLI on a temp `uvr-loops` folder, no notegrab and no Rack.
- `tools/rack.test.mjs` (6 tests): the Rack client against a fake Rack MCP HTTP server. Cases: Rack down, load, restore, stale
  files, shared backup, duplicate modules.

The hand check in real Rack stays: `--load`, then `--restore`, then the Acid Bass and Roll states and Triple's input cables match
the backup.

## Baseline already on disk

`~/Desktop/uvr-loops/notegrab/2-bass-04_hook-89bpm/reader-baseline.txt` (2026-11-20) is the older hand-made read of the bass of this
section at four offsets, before any score existed. The tool does not read it. The tool's baseline is
`notegrab/stem-test/<crate>-<section>/baseline.json`, written by the first `stem-test` run of a section.
