# My lil acid house rack: a melodic Chicago-acid patch built from the My lil modules

Author: Ari Klopfer / A_Development · 2026-11-22 · status: built through s9 (scenes), updated to match the patch; see the plan's "As built"

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
Clocked 124 bpm ─> Drums (16ths), 2 Acid Bass, 5 Roll (#0 to #4), Ripple (one clock, one reset)
Drums              pad 1 kick out ─> Mixer SC and the reverb Duck; mix L/R ─> strip 1
Acid Bass #1       ─> strip 2   lead acid, 32 steps, 5 slots; Mutate from Ripple A; slow LFO on its cutoff
Acid Bass #2       ─> strip 3   answer acid an octave up, plays in the lead's rests; Mutate from Ripple B
Roll #1 ─> Triple  ─> strip 4   chords (rootless voicings); muted in the groove, on in break and drop
Roll #4 ─> Harmony ─> Triple    ─> strip 5   hook, an 8-bar composed melody; Harmony follows the chord Roll
Roll #0 ─> Triple  ─> strip 6   sub bass, one root per bar
Roll #2 ─> Triple  ─> Duck (Ripple B) ─> strip 7   ambient pads
Roll #3 ─> Triple  ─> Duck (Ripple C) ─> strip 8   sine arp, 16ths from the chord tones, dotted-8th delay
Send 1 delay (Fundamental, 0.365 s), Send 2 reverb (AS ReverbStereoFx) ─> Duck keyed by the kick ─> Return 2
Mixer master soft clip ─> Audio (WASAPI until the Steinberg interface is back)
Transit x2         scenes: one instant (patterns, Harmony snap), one morph (mutes, cutoffs, sends, master level)
My lil MCP         in the patch for measurement and editing
```

## Music

**Key and chords.** Roll and Harmony set to A Aeolian, scale snap on. Eight bars, one chord per bar: Am9, Fmaj7#11, Cmaj9, G6/9 |
Dm9, Em11, Fmaj9, G6/9. Rootless voicings (the sub plays the roots A F C G | D E F G). Roll patterns: 1 syncopated stab, 2 whole-note
pad (break), 3 syncopated 3-3-2 stab (drop). The chords are muted in the groove because the stab distracted. Never out of key: `bun build.mjs key` polls every pitched
source against A natural minor and the stored Acid slots.

**Acid Bass.** A as a pedal, A minor pentatonic (A C D E G), A2 and above over the sub, slides into the high notes, accent every third 16th.
Slots: 1 sparse intro, 2 main groove, 3 busy drop, 4 break with long slides, 5 build. Mutate from Ripple A moves one step per bar, only among the
stored pitches; the chord Roll's end-of-loop undoes it every 8 bars.

**Sub bass.** Sine on a Roll, one root per bar, offbeat 8ths in the groove, held in the intro and break, with a 16th pickup in the drop.

**Hook.** An 8-bar composed melody on a Roll (A4 to A5, long notes and rests, tones of each bar's chord) through Harmony on Solo, glide 0.
Triangle plus an octave sine, soft attack; velocity shapes each phrase and opens the filter. Chord-tones-only in the drop. (The Slider A motif
of the first design was too repetitive: "same 4 notes", "too annoying".)

**Answer acid.** A second Acid Bass an octave up (A3 to E4) that plays only in the lead's rests, brighter and less resonant. Plays in groove and drop; muted in the intro and break.

**Pads and arp.** Open-voiced pads (Roll #2) and a sine arp (Roll #3, 16th notes from the chord tones) with an ADSR pluck and a dotted-8th delay.

**Drums.** Four on the floor kick, clap on 2 and 4, offbeat closed hats plus quiet 16th closed hats as the shaker, open hat in
the drop only, syncopated rim. The My lil Drums kit has kick, snare, chat, ohat, clap, rim, tom and crash (no ride, no shaker).
Swing is left to the ear after s9.

**Mix roles.** Kick and acid low, centre, dry. Stabs mid, ducked hard. Hook upper-mid with delay. Pads wide with reverb.

## Movement

- Ripple: A (period 16) mutates the lead acid, B (period 4) ducks the pads and C (period 8) ducks the arp, so both pump on the beat with the kick.
  The first try (6 and 10 sixteenths, interlocking against the kick) was too busy and then not danceable. The answer acid does not mutate, so it loops
  steady. Ripple's R' is every tick R did not fire, so it is not used.
- Swing 0.12 on Clocked's Clock 1 (measured about 56 percent) swings the drums, both acids and every Roll together.
- A slow LFO (30 s cycle) rides the lead acid's cutoff.
- The kick sidechain pumps the whole mix; the reverb return has its own kick-keyed Duck, so the tail breathes with the kick.
- Each scene changes the Acid Bass slots, so the riff evolves.

| Scene | Drums | Acid | Answer | Chords | Hook | Pads / arp | Reverb | Master |
|---|---|---|---|---|---|---|---|---|
| Intro | pattern 1 (kick, hats) | slot 1, filter low | off | off | off | pads on, arp off | pads | -4 dB |
| Groove | pattern 2 (+ clap, open hat on the offbeat, ghost hats) | slot 2 | on | off (the stab distracts) | on | on | pads and hook | 0 |
| Break | pattern 3 (no kick) | slot 4, long slides | off | pad | on, big reverb send | pads on, arp off | up | -5 dB |
| Drop | pattern 4 (full + open hat) | slot 3, filter open | on, brighter | 3-3-2 stab | chord tones, more delay | on, syncopated arp | less | 0 |

Measured master RMS per scene: intro -12.0, groove -8.2, break -11.0, drop -7.5 dB, peak under -1 dBFS in all four.

Scenes are two scripted Transits plus `scene(name)` (`bun build.mjs scene drop`). The instant one (Fade 0) jumps the pattern selectors and Harmony
snap; the morph one glides mutes, cutoffs, sends and master level over about one bar. By hand, press the same slot on both. Later, LooperSong can record
which scene played on which bar.

## Build steps

Each step is one change to the live Rack.

| Step | Adds | Check before listening |
|---|---|---|
| s1 | Clocked 124, Mixer, Audio, MCP | clock toggles, master silent, no errors |
| s2 | Drums 909 kit | kick strip present, master peak below -1 dBFS |
| s3 | Acid Bass slots, sub bass | strip RMS set against the kick, duck light moves |
| s4 | Chords, ambient pads, sine arp with delay | chord notes read back match the progression |
| s5 | Hook Roll, Harmony, Triple, velocity dynamics | hook pitches inside A minor |
| s6 | Second Acid Bass (answer) | stored slots in A minor |
| s7 | Ripple mutate, LFO, Duck on pads and arp | ducked RMS below the un-ducked RMS |
| s8 | Reverb on send 2, kick-keyed Duck, return 2 | tail audible (about -23 dB RMS), master peak below -1 dBFS |
| s9 | Two Transits and `scene()`, per-scene master level | each scene recalls the intended values, master peak below -1 dBFS |

At every step: Claude measures, Ari listens and says keep or adjust, Claude saves
`my-lil-acid-house-sN-<name>.vcv` in the Rack patches folder. The next step starts only after a keep.

## Failure handling

- MCP down: stop and tell Ari.
- Rack crash: reopen the last numbered save; answer No to the "clear your patch" dialog.
- Never kill Ari's running Rack.
- The MCP calls go through the existing `tools/rack.mjs`. The build helper (`ah.mjs`, `build.mjs`) lives outside the repo in
  `Desktop\claude artifacts\my-lil-acid-bassline\acid-house`; no new code files in the repo.
- Audio device: WASAPI until the Steinberg interface is back; reselect it then.

## Done when

All four scenes play through and Ari calls the whole song keep.
