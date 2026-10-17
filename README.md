# A_Development plugins

Browser instruments and tools by [A_Development](https://github.com/Adev-io). Each one is a single page: open it and use it. No install, no build, no dependencies.

| Plugin | What it is |
|---|---|
| [`acid-bass-2/`](acid-bass-2/) | **Acid Bass Line 2**: the 303-style bass synth plus separate filter and amp **ADSR**, a gate-length knob and a live envelope view |
| [`tb303/`](tb303/) | **Acid Bass Line** (v1): the original 303-style synth, one decay envelope |

## Use it

- **Online:** https://adev-io.github.io/A_Development-plugins/
- **Locally:** open `index.html` in a browser (Chrome, Edge, Firefox). Audio starts on your first click or key press.

## Acid Bass Line 2

Everything in v1 (below), plus an **Envelope** panel:

- **Filter envelope:** Attack, Decay, Sustain, Release. Env Mod is the depth; Sustain is a fraction of that depth held while the gate is up; Release returns the filter to the cutoff.
- **Amp envelope:** Attack, Decay, Sustain, Release for the volume shape. Short decay and sustain 0 gives plucks; long attack and release gives pads.
- **Gate length:** how much of each step the note is held, 10-100% (55% matches the original 303). It also sets the note lengths in the exported MIDI.
- **Live view:** both envelope shapes are drawn from the current knob values.
- **Automate** reaches every envelope knob too. Defaults reproduce v1's sound, so nothing changes until you touch them. Accent still shortens the filter decay.

State is stored under its own key, so v1 and v2 never overwrite each other's patterns.

## Acid Bass Line (v1)

**Sound.** Saw or square oscillator into a resonant 24 dB lowpass, with Tuning, Cutoff, Resonance, Env Mod, Decay, Accent, Volume and Tempo (40-300 BPM). Accent shortens the filter decay, boosts level and builds on stacked accents. Slide glides pitch without retriggering.

**Play.** The on-screen keys, or `Z S X D C V G B H N J M ,` on your keyboard. Up / Down shift the octave, Accent and Slide apply to the notes you play. Space runs and stops.

**Sequence.** 32 patterns (2 banks x A/B x 8), up to 32 steps each. Click a step, press a key to write a note (Write stays on), press **Rest** to remove it, **Tie** to hold the previous note. Under each step: octave, accent, slide. **Track** mode chains patterns into a song. **Load demo set** fills six starter lines and a sound to hear them in.

**Automate.** Press **Automate** to show min %, max %, `~` and beats-per-sweep under every knob. With `~` on, the knob sweeps between your min and max in time with the tempo.

**Export.** **Export folder** downloads `303-patterns.zip`: one `.txt` (step notation, tempo, knob settings) and one `.mid` per pattern, plus `song.txt` / `song.mid` for the song chain. In the MIDI, accents are loud notes, slides overlap the next note, and ties hold one note.

Step notation, one token per step: `C`..`B` note, `C'` high C, `^` `_` octave up/down, `*` accent, `~` slide, `-` rest, `=` tie. Example: `A* - A A^ - A_* A - G~ A - A* - C^ - E~`.

## Develop

```
bun test                           # or: node --test
```

Each plugin folder is `index.html` (audio and UI) plus a pure half (`tb303/tb303.js`, `acid-bass-2/acidbass2.js`): sequencer rules, state cleaning, automation, MIDI and zip writers, tested without a browser.

## License

MIT. Copyright (c) 2026 Ari Klopfer / A_Development.
