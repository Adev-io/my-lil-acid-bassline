# My lil acid house, A Dorian rebuild and the two Transits

Author: Ari Klopfer / A_Development · 2026-11-22 · status: built through d9 and heard end to end; last save `my-lil-acid-house-d9-no-arp.vcv`

Supersedes the tonality, chord and scene parts of `2026-11-22-my-lil-acid-house-design.md` (A natural minor, 10 auto-advancing sections). The signal path, drums, mix and ducking in that spec stay.

## Why

The A natural minor song, with its 10-section auto-advancing Transit arrangement, was heard and rejected ("i dont like it"). The harmony was one fixed seven-note set with no colour change. The rebuild starts from the harmony and then plans the scenes.

## Tonality

A Dorian, one home: A B C D E F# G. The F# is the colour note. Any F natural, C#, G# or other out-of-pool note fails the key check (`dorian.mjs`, which polls the live Rolls and checks the stored Acid slots). Roll and Harmony run key A, mode 1 (Dorian), scale snap on, Harmony Lead snap on.

## Progressions (two bars per chord, rootless voicings, the sub plays the root)

| Set | Used in | Chords (bars 1-8) | Sub roots |
|---|---|---|---|
| P1 base | intro, groove, build, outro | Am9 Am9 D9 D9 Am9 Am9 Cmaj9 Bm11 | A A D D A A C B |
| P-break | break | Cmaj9 Cmaj9 Bm11 Bm11 Am9 Am9 D9 D9 | C C B B A A D D |
| P-drop | drop | Am9 Am9 D9 D9 Gmaj9 Gmaj9 F#m7b5 F#m7b5 | A A D D G G F# F# |

The break opens on the bright chord and ends on D9, which resolves into the build's Am9. The drop lifts through G and F#. Every chord is inside the pool.

## The two Transits

Both are recalled by the same slot button (1-6), by hand or by `dorian.mjs`. There is no auto-advance: the End of loop and Clocked reset cables to the Transits are cut.

**Transit S (Fade 0, 13 maps, instant).** Drums pattern, lead Acid slot, chord Roll pattern, sub Roll pattern, strip mutes 2-8, hook Roll pattern, arp Roll pattern. Mutes sit on S, not M: a mute inside a glide flips only at its midpoint, so long glides left the old instruments playing.

**Transit M (14 maps, per-scene fade).** Lead and answer acid cutoff; lead resonance and envelope mod; chord and pad Triple cutoff; hook delay send, hook reverb send, pad reverb send; delay feedback; reverb decay; master level; lead acid reverb send; chord reverb send. Delay time is left alone because moving it pitch-bends.

**Quantized `next`.** A spare VCA-1 (level 0 closed, 1 armed) gates Ripple's Accent output (one pulse per 16-step cycle, one bar) into both Transits' CV input (slotCvMode 2, TRIG_FWD). `dorian.mjs next` arms it, waits until both Transits advance, closes it and checks both landed on the same scene. Landings measured 1 bar apart (1.93 s at 124 bpm), and it wraps from outro to intro. `scene <name>` is the immediate jump; it presses both Transits and re-presses until each one's preset reads the scene (S once stayed behind).

## Scenes

| # | Scene | Bars (song) | Drums | Lead acid | Chords / sub | On (besides drums) | Hook | Arp | Master | Fade knob |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | intro | 8 | intro | sparse | none / held, P1 | lead, sub, pads | off | off | -7 dB | 0.8 |
| 2 | groove | 16 | groove | groove | none / offbeat, P1 | lead, sub, hook, pads | 8-bar melody | off | -5 dB | 0.85 |
| 3 | break | 8 | no kick | slides | pad / held, P-break | lead, chords, sub, hook | held notes E5 F#5 E5 C5 | off | -8 dB | 0.85 |
| 4 | build | 6 | snare roll | rising run | pad / held, P1 | lead, chords, sub, hook | 8-bar melody | off | -6 dB | 0.999 (5.3 bars) |
| 5 | drop | 16 | drop | busy | 3-3-2 stab / offbeat plus pickup, P-drop | lead, answer acid, chords, sub, hook | held notes A5 F#5 G5 A5 | off | -4 dB | 0.7 |
| 6 | outro | 8 | intro | sparse | none / held, P1 | lead (filter closing), sub, pads | off | off | -6 dB | 0.999 (5.3 bars) |

Pads keep one pattern on P1, so they are muted in break and drop, where the progression differs. The Triple arp is muted in every scene: Ari did not like it, first as the 16th run, then as the pluck and the pulse. Its Roll patterns stay stored and selectable on S.

Break reverb: the lead acid send 0.2 (the slides ring out), chord send 0.85, decay 0.78. Elsewhere the lead send is 0 to 0.1 and the chord send 0.8.

## Voices as built

- **Lead acid** (slot 0 intro and outro, 1 groove, 2 drop, 3 break, 4 build): a slide flag glides into the next step. The kick owns steps 1, 5, 9, 13 and the sub plays the offbeat 8ths in the groove, so the lead plays the 16th gaps, leaves rests, puts accents off the beat, glides down into the 2nd and the F#, and ends bar 2 on a pickup into bar 1. Answer acid slot 2: held accents over the busy lead.
- **Hook** (Roll #4 through Harmony): pattern 1 is the 8-bar composed melody (groove, build). Patterns 2 and 3 are one held chord tone per two bars on the break and drop progressions. The melody sounded like an arp when it ran in break and drop.
- **Arp** (Roll #3, Triple, strip 8): out of the song. The 16th sine run was cut, then the replacements (pattern 1 an offbeat pluck on steps 4, 7, 11, 16; pattern 2 a steady 8th pulse for the build) were cut too. Strip 8 is muted in all six scenes. Open: a top line for the groove (the answer acid an octave up at low level) and a build riser from the filter and snare roll.

## Levels measured (last full check, master RMS and peak in dBFS)

intro -11.4 / -4.1, groove -9.5 / -2.4, break -10.5 / -3.7, build -9.4 / -2.4, drop -7.6 / -2.1, outro -9.5 / -3.6 (check run, arp muted). A full `song` run read the break at -12.2 and the drop 1 dB above the groove. The drop is the loudest scene and every peak is under -1 dBFS. Runs differ by 1 to 2 dB. Master level per scene is an absolute dB (gain = 2 * raw^2, so raw 0.707 = 0 dB), not "relative to the current level".

## Wiring and traps

- Slot values must not be JSON integers (Transit reads them as 0): add 1e-4. Give every slot a real fade value (0.999, never 1.0). Fade seconds = 0.01 * 2^(10 * knob).
- Rebuild a Transit whole: write `sourceMaps: []`, wait 2 s, write maps and presets, read the map count back (`dorian.mjs d6`). Never patch a slot in place: it wiped M's maps, the preset index still moved, and nothing applied. Check live params, not the preset index.
- Do not read baselines from the live patch inside a rebuild. Resonance and envelope mod (lead acid, 0.138 and 0.224 from the d5 save) and the master levels are fixed in code; reading them live compounded the scene offsets to zero over four rebuilds.
- Do not press the slot buttons while a check runs; two runs read back another scene's values and the cause was not found.
- Recall crossfades every non-switch param, so selectors and mutes go on S (Fade 0) and knobs on M.
- Build and check with `dorian.mjs` (next to `build.mjs`, outside the repo): `d6` rebuild and check, `scene <name>`, `next`, `qsetup`, `song` (plays all six scenes on the bar lines, 62 bars, about 2.3 minutes), `save <name>`.

## Done when

All six scenes recall the intended values (read back per scene), the key check passes in every scene, master peak is under -1 dBFS in all, and Ari calls the song keep. Heard end to end with `song`; the final keep is pending.
