# My lil acid house rack: a melodic Chicago-acid patch built from the My lil modules

Author: Ari Klopfer / A_Development · 2026-11-22 · status: approved design, not built

## Why

The My lil modules (Acid Bass, Drums, Triple, Roll, Harmony, Toolbox, Looper) have been used in separate patches (funk-house-E,
arrow-remix, idm-130). There is no single rack that shows the whole series working together in one song. This design builds one:
a melodic, dynamic acid house patch where every part reads the same key and chords, so nothing plays a wrong note.

## Scope

In: one new Rack patch, built live in the open Rack over the Rack MCP (My lil MCP 2.0.0), one section per step, ear check and a
numbered save after each step. 124 bpm, A minor (Aeolian), mouse-driven macro knobs (no controller plugged in).

Out: Chop (needs MIDI pads), Recycler and Looper textures (a later step once the core groove holds), MiniLab mapping, FL Studio,
new modules or new code. If a gap shows up while building (a missing module behaviour), it is logged and decided separately.

## Signal path

```
Clocked 124 bpm ─> Drums (16ths), Acid Bass, Roll, Ripple, Slider (one clock, one reset)
Drums (909-style)  pad 1 kick out ─> Mixer SC (whole mix pumps off the kick); mix L/R ─> strips 1-2
Acid Bass          ─> strip 3   lead acid, 32 steps, slots 1-4
AcidVoice          ─> strip 4   answer acid, fed by Slider B through Arpeggio
Roll ─> Triple     ─> strip 5   chords; My lil Filter on the stab bus
Slider A ─> Harmony ─> Triple #2 ─> strip 6   hook; Harmony follows Roll's chords
Ripple             polyrhythm triggers and ENV: cutoff CV for the stab Filter, accent for Triple #2
Send 1 delay (dotted 1/8), Send 2 reverb (third-party FX at first), returns into the Mixer
Mixer master soft clip ─> Audio (WASAPI until the Steinberg interface is back)
Transit            4 scenes: Intro, Groove, Break, Drop
My lil MCP         in the patch for measurement and editing
```

## Music

**Key and chords.** Roll and Harmony set to A Aeolian, scale snap on. Progression, one chord per bar: Am9, Fmaj7, Cmaj7, G6
(i-VI-III-VII). Close voicing around A3-E4 so the chords stay out of the bass. Roll patterns: 1 offbeat 8th stabs, 2 whole-note
pad (break), 3 syncopated 3-3-2 stab (drop).

**Acid Bass.** A as a pedal (root of Am, 3rd of F, 6th of C, 9th of G), A minor pentatonic (A C D E G), A1/A2 octave jumps,
slides into the octave, accent every third 16th. Slots: 1 sparse intro, 2 main groove, 3 busy drop, 4 break with long slides.

**Hook.** Slider A, 16 steps inside A3-A4, through Harmony. Chord-tones-only mode in the drop, scale mode in the groove and
break. Triple #2: pulse pluck, short decay, dotted-1/8 delay.

**Answer acid.** Slider B through Arpeggio (A minor) into AcidVoice, an octave up (A2-A3). Plays in the gaps of the lead acid in
Groove and Drop only.

**Drums.** Four on the floor kick, clap on 2 and 4, offbeat closed hats plus 16th shaker with velocity variation, open hat and
ride in the drop only, syncopated rim with a fill in bar 8. Swing about 54 percent. A 909-style kit is needed; the kits on disk
are checked at step s2.

**Mix roles.** Kick and acid low, centre, dry. Stabs mid, ducked hard. Hook upper-mid with delay. Pads wide with reverb.

## Movement

- Ripple periods 3, 5, 7 and 16 sixteenths. ENV drives the stab Filter cutoff CV (stabs pulse in polyrhythm against 4/4). Accent
  fires the Triple #2 filter envelope once per cycle.
- A slow LFO (16-bar cycle) rides the AcidVoice cutoff.
- Each scene changes the Acid Bass slot, so the riff evolves every 16 bars.

| Scene | Drums | Acid | Chords | Hook | Answer | FX |
|---|---|---|---|---|---|---|
| Intro | kick, hats | slot 1, filter low | stab, filtered | off | off | dry |
| Groove | + clap, shaker | slot 2 | stab | scale mode | on | delay |
| Break | no kick | slot 4 | pad | scale, reverb up | off | wet |
| Drop | full + open hat, ride | slot 3 | 3-3-2 stab | chord tones | on | delay |

Transit morph time is 1 bar. Hands: four macro knobs by mouse: acid cutoff, acid resonance, stab Filter cutoff, hook delay send.
Later, LooperSong can record which scene played on which bar.

## Build steps

Each step is one change to the live Rack.

| Step | Adds | Check before listening |
|---|---|---|
| s1 | Clocked 124, Mixer, Audio, MCP | clock toggles, master silent, no errors |
| s2 | Drums 909 kit | kick strip present, master peak below -1 dBFS |
| s3 | Acid Bass slots 1-4 | strip RMS set against the kick, duck light moves |
| s4 | Roll to Triple, 3 patterns | duck visible on strip, chord notes read back match the progression |
| s5 | Slider A, Harmony, Triple #2 | hook voltages inside A minor |
| s6 | Slider B, Arpeggio, AcidVoice | quantized notes only A minor |
| s7 | Ripple, LFO, Filter | cutoff CV moves (voltage read) |
| s8 | Delay and reverb sends and returns | returns present, master LUFS about -12 to -10 |
| s9 | Transit, 4 scenes | each scene recalls, no audible clicks |

At every step: Claude measures, Ari listens and says keep or adjust, Claude saves
`my-lil-acid-house-sN-<name>.vcv` in the Rack patches folder. The next step starts only after a keep.

## Failure handling

- MCP down: stop and tell Ari.
- Rack crash: reopen the last numbered save; answer No to the "clear your patch" dialog.
- Never kill Ari's running Rack.
- The MCP calls go through the existing `tools/rack.mjs` or direct HTTP to `http://127.0.0.1:2600/mcp`. No new code files.
- Audio device: WASAPI until the Steinberg interface is back; reselect it then.

## Done when

All four scenes play through and Ari calls the whole song keep.
