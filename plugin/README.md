# My lil acid bass: VST3 and standalone

**by A_Development**

The web version's sound as a real plugin: a monophonic acid bass instrument with its own 32-step sequencer, for FL Studio and any other VST3 host, plus a standalone app. Every knob is a host parameter you can automate. The window is the web page's panel.

## Download

Windows 10/11, 64-bit: **[latest release](https://github.com/Adev-io/my-lil-acid-bassline/releases/latest)**. The zip holds the VST3 bundle, the standalone exe, the licences and an install sheet.

## Install in FL Studio

1. Copy the whole folder `My lil acid bass.vst3` to `C:\Program Files\Common Files\VST3\` (needs admin).
2. **Options > Manage plugins**, then **Find installed plugins**. Add **My lil acid bass** as an instrument.
3. Play it from the piano roll, or turn the sequencer on and press play in FL. To automate a knob, right-click it in the plugin panel.

The files are not code-signed: if SmartScreen warns, choose **More info > Run anyway**. The window uses WebView2 (ships with Windows 11; Windows 10 may need the Evergreen runtime from Microsoft).

## What it has

| | |
|---|---|
| Voice | PolyBLEP saw or square into a 24 dB resonant lowpass, soft-clipped output. Tuning, Cutoff, Resonance, Env Mod, Decay, Accent, Volume, Waveform |
| Tweaks | HP, Key Follow, Min Decay, Pulse Width, LFO Rate, LFO to PW |
| Envelopes | Filter attack, decay (the Decay knob), sustain, release; amp attack, decay, sustain, release |
| Drive | On, type (soft, tube, wavefold), drive, HP, tone, volume, mix. 4x oversampled |
| Delay | Time, feedback, mix, tone, stereo, ping-pong |
| Reverb | On, pre-delay, size, decay, hi damp, low cut, hi cut, width, dry, wet |
| Sequencer | 32 steps on the host clock: note, octave, accent, slide, rest, tie. Swing and gate length. Starts and stops with the host transport |
| Patterns | 128 slots. The web version's factory patterns fill them; your edits are kept per slot, with Restore to get the factory one back |
| MIDI | Notes play the voice; velocity 110 or more is an accent; overlapping notes slide. Drag the current pattern out as MIDI, or Save MIDI to `Documents\A_Development\MyLilAcidBassline\midi` |
| Host | All knobs 0..1 and automatable, named like the web app's. State saves with the project. Pattern edits also save to `Documents\A_Development\MyLilAcidBassline\bank.json` |

Not in the plugin: the delay's Fat mode and tempo Sync (the web version has them).

## Build from source

Needs CMake, Ninja, and Visual Studio (or the free Build Tools) with the "Desktop development with C++" workload.

```
plugin\build.bat
```

It fetches JUCE 9.0.4, builds the VST3 and the standalone, and runs a headless smoke test that plays MIDI through the real processor and checks the audio (pitch, release, cutoff, envelope, accent, slide, saved state). Output: `plugin\build\MyLilAcidBassline_artefacts\Release\VST3\My lil acid bass.vst3` and `...\Standalone\My lil acid bass.exe`.

CI (`.github/workflows/plugin.yml`) runs the same steps on every push to `main`; a `vX.Y.Z` tag that matches the version in `CMakeLists.txt` also publishes the release zip.

## Roadmap

1. Voice, parameters, MIDI, slide, accent, state: done.
2. Envelopes, gate length, sequencer, pattern bank, web panel window: done.
3. Windows release on GitHub: done.
4. Delay Fat and tempo Sync.
5. macOS (AU + VST3, notarised) and Linux builds; Windows code signing.

## Known differences

- The plugin's reverb tail is about 0.45x the web page's tail level for a similar note (rms 0.0051 vs 0.0114). Likely cause: `Normalise::yes` on the impulse response versus WebAudio's normalisation. Not tuned yet.

## License

This folder is **AGPL-3.0-or-later** (see [LICENSE](LICENSE)), because it links the [JUCE](https://juce.com) framework under JUCE's open-source AGPLv3 option. In practice: you can use, change and share it freely, but anyone you give the plugin to must be able to get its source under the same license. Selling it as closed source would need a commercial JUCE licence instead.

The plugin binary embeds the MIT web files (`index.html`, `acidbass.js`, `factory.js`, `ui-bridge.js`) as its window. MIT code inside an AGPL binary is permitted; the combined work is AGPL-3.0-or-later. The rest of this repository stays MIT.
