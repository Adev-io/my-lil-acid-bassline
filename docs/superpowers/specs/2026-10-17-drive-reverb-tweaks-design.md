# Drive, Reverb and Tweaks: design

Date: 2026-10-17. Status: draft for review. App: My lil acid bass, by A_Development (web, `index.html` + `acidbass.js`), with the VST3 in `plugin/` following.

## Goal

Add a drive stage, a reverb and a set of oscillator and filter tweaks, so the synth goes past a plain 303 and past FL Studio's Transistor Bass. Defaults leave the sound exactly as it is today.

## Scope

In: Tweaks panel, Drive panel, Reverb panel, Delay tone and stereo width, automation of every new continuous knob, saved state, tests, VST3 parity plan.

Out (decided): VCA Smooth (the amp ADSR covers it), early reflections (ER) in the reverb, polyphony, the wave-morph knob (comes later with the Sound design piece), sequencer superpowers, sub/noise/osc2, effects rack, presets.

## Panels and parameters

Three toggle buttons beside Envelope and Delay: **Tweaks**, **Drive**, **Reverb**. Each panel is hidden by default. Drive and Reverb have an on/off LED.

| Panel | Parameter (range, default) |
|---|---|
| Tweaks | HP: 20 to 500 Hz, 20 (off). Key Follow: 0 to 100 %, 0. Min Decay: 30 ms to 0.6 s, 30 ms. PW: 5 to 95 %, 50 %. LFO rate: 0.05 to 20 Hz, 2. LFO to PW: 0 to 100 %, 0 |
| Drive | on/off, off. HP: 20 to 800 Hz. Drive: 0 to 30 dB. Type: soft, tube, wavefold (soft). Tone: 0.8 to 16 kHz lowpass. Volume: plus or minus 12 dB. Mix: 0 to 100 % |
| Reverb | on/off, off. Pre-delay 0 to 200 ms. Size. Decay. Hi damp. Low cut. Hi cut. Width. Dry. Wet (0) |
| Delay (extras) | Tone (lowpass in the repeats), Stereo (ping-pong width) |

Every continuous knob joins the existing Automate row (min, max, rate). On/off switches and Type are saved state, like ping-pong and fat. Exact knob maps live in `acidbass.js` next to `KNOBS`.

## Signal chain

`oscillator -> HP -> 24 dB lowpass -> amp -> Drive -> output clip -> Delay -> Reverb`

- **Oscillator:** pulse width and the LFO need a custom oscillator. Replace the built-in saw/square with a small AudioWorklet (PolyBLEP, same maths as the plugin's C++ voice). If AudioWorklet is missing, fall back to the built-in oscillator and grey out PW and LFO with a note.
- **Key Follow and Min Decay:** applied per note where the envelopes are set today. Min Decay also floors the accent decay.
- **Drive:** HP, pre-gain, 4x-oversampled waveshaper (soft: tanh; tube: asymmetric; wavefold), Tone, Volume, parallel Mix. Level compensated so full drive is at most about 3 dB louder than bypass.
- **Reverb:** a seeded, generated stereo impulse response in a ConvolverNode, then pre-delay, low cut, high cut and width. A change to Size, Decay or Hi damp rebuilds it with a short crossfade (no click). The plugin uses the same recipe, so tails match in character, not bit for bit.
- **Shared maths:** knob maps, drive curves, the impulse-response generator and oscillator maths live in `acidbass.js`, so node tests them and the plugin ports them with golden test values.

## State and compatibility

New fields are cleaned on load by `cleanState`, so old saves open with everything neutral. Unknown Type falls back to soft. Storage key `acidbass2` is unchanged. The txt export header lists the new settings. Export is the existing MIDI + TXT chips; MIDI content does not change.

## Testing

Node (`acidbass.test.mjs`, run under node and bun):
- Knob maps and drive curves are bounded; tube is asymmetric.
- The impulse response is repeatable for a seed, decays over time, and Hi damp darkens it.
- Key Follow maths and oscillator duty cycle.
- `cleanState` migrates an old save to neutral defaults and rejects bad Type values.

Browser (offline render of the real graph, `OfflineAudioContext`):
- Drive and Reverb off gives output identical to today's.
- Drive adds harmonics without a big level jump. Reverb leaves a tail only when Wet is above 0. HP removes bass. Key Follow brightens higher notes. PW changes the duty cycle. Min Decay floors the envelope.

VST3 (`plugin/Tests/smoke.cpp`): add checks per ported feature as it lands.

## VST3 parity

Phase 2 ports the Tweaks and Drive (same maps and golden values), using `juce::Reverb` plus extra DSP for the reverb, with matching parameter names. Delay tone and stereo come with the plugin's delay.

## Order of work

1. Pure maths and state in `acidbass.js` with node tests.
2. AudioWorklet oscillator and Tweaks panel.
3. Drive panel.
4. Reverb panel.
5. Delay tone and stereo width.
6. Browser render checks, then the plugin port as its own plan.
