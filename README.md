# A_Development plugins

Browser instruments and tools by [A_Development](https://github.com/Adev-io). Each one is a single page: open it and use it. No install, no build, no dependencies.

| Plugin | What it is |
|---|---|
| [`tb303/`](tb303/) | **Acid Bass Line**: a 303-style bass synth with a 32-step sequencer, per-knob automation, and `.txt` / `.mid` export |

## Use it

- **Online:** https://adev-io.github.io/A_Development-plugins/
- **Locally:** open `index.html` in a browser (Chrome, Edge, Firefox). Audio starts on your first click or key press.

## Acid Bass Line

**Sound.** Saw or square oscillator into a resonant 24 dB lowpass, with Tuning, Cutoff, Resonance, Env Mod, Decay, Accent, Volume and Tempo (40-300 BPM). Accent shortens the filter decay, boosts level and builds on stacked accents. Slide glides pitch without retriggering.

**Play.** The on-screen keys, or `Z S X D C V G B H N J M ,` on your keyboard. Up / Down shift the octave, Accent and Slide apply to the notes you play. Space runs and stops.

**Sequence.** 32 patterns (2 banks x A/B x 8), up to 32 steps each. Click a step, press a key to write a note (Write stays on), press **Rest** to remove it, **Tie** to hold the previous note. Under each step: octave, accent, slide. **Track** mode chains patterns into a song. **Load demo set** fills six starter lines and a sound to hear them in.

**Automate.** Press **Automate** to show min %, max %, `~` and beats-per-sweep under every knob. With `~` on, the knob sweeps between your min and max in time with the tempo.

**Export.** **Export folder** downloads `303-patterns.zip`: one `.txt` (step notation, tempo, knob settings) and one `.mid` per pattern, plus `song.txt` / `song.mid` for the song chain. In the MIDI, accents are loud notes, slides overlap the next note, and ties hold one note.

Step notation, one token per step: `C`..`B` note, `C'` high C, `^` `_` octave up/down, `*` accent, `~` slide, `-` rest, `=` tie. Example: `A* - A A^ - A_* A - G~ A - A* - C^ - E~`.

## Develop

```
bun test tb303/tb303.test.mjs      # or: node --test tb303/
```

The page (`tb303/index.html`) is the audio and UI. `tb303/tb303.js` is the pure half (sequencer rules, state cleaning, automation, MIDI and zip writers), tested without a browser.

## License

MIT. Copyright (c) 2026 Ari Klopfer / A_Development.
