# My lil acid bassline: VST3 for FL Studio (in progress)

**by A_Development**

The web version's sound as a real plugin: a monophonic acid bass instrument that plays from FL Studio's piano roll, with every knob a host parameter you can automate.

**Status: phase 1.** The voice and eight parameters work, with a plain generic panel. Not yet in the plugin: the filter/amp ADSR, gate length, the delay, the 32-step sequencer and the custom panel. They come from the web version in later phases (the roadmap below).

## What works now

| | |
|---|---|
| Voice | PolyBLEP saw or square into a 24 dB resonant lowpass, soft-clipped output |
| Parameters | Tuning, Cutoff, Resonance, Env Mod, Decay, Accent, Volume, Waveform |
| MIDI | Notes play the voice. Velocity 110 or more is an accent. A note struck while another is held **slides** to the new pitch without retriggering, so overlapping notes in the piano roll give the 303 slide. |
| Host | Parameters are visible to FL for automation; state saves with the project |

## Build

Needs CMake, Ninja, and Visual Studio (or the free Build Tools) with the "Desktop development with C++" workload.

```
plugin\build.bat
```

It fetches JUCE 9.0.4, builds the VST3 and a standalone app, and runs a headless smoke test that plays MIDI through the real processor and checks the audio (pitch, release, cutoff, envelope, accent, slide, saved state). The plugin lands in `plugin\build\MyLilAcidBassline_artefacts\Release\VST3\My lil acid bassline.vst3`.

## Install in FL Studio

1. Copy `My lil acid bassline.vst3` to `C:\Program Files\Common Files\VST3\` (needs admin).
2. In FL Studio: **Options > Manage plugins**, then **Find installed plugins** (rescan). Add **My lil acid bassline** from the plugin list as an instrument.
3. Play it from the piano roll. To automate a knob, right-click the knob in the plugin panel and choose **Link to controller** / create an automation clip.

## Roadmap

1. **Voice and parameters** (done): sound, MIDI, slide, accent, state.
2. **Match the web version:** filter and amp ADSR, gate length, the ping-pong / fat / tempo-synced delay (reading the host tempo).
3. **Sequencer:** port the 32-step sequencer so it runs on the host clock; keep the `.txt` / `.mid` export.
4. **Panel:** the web page's look, as the plugin window.
5. **Release:** installer, GitHub Release, and (optional) a code-signing certificate so Windows does not warn on install.

## License

This folder is **AGPL-3.0-or-later** (see [LICENSE](LICENSE)), because it links the [JUCE](https://juce.com) framework under JUCE's open-source AGPLv3 option. In practice: you can use, change and share it freely, but anyone you give the plugin to must be able to get its source under the same license. Selling it as closed source would need a commercial JUCE licence instead.

The rest of this repository (the web plugins) stays MIT.
