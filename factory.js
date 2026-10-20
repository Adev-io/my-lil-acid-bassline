// factory.js — 64 factory bass lines for the plugin's pattern bank, in the page's step notation (see acidbass.js parsePattern).
// Base pitch C2: ^ is an octave up, _ an octave down. Every line is 8..32 steps and loops.
// Author: Ari Klopfer / A_Development
(function () {
  const BANK = [
    // Funk: syncopated 16ths, ghost rests, octave pops, chromatic walk-ups.
    ['Funk', [
      "E* - E E - E^ - E* - E G - A - B E^*",                                          // E: pops and a walk to the octave
      "A* - - A A^ - A* - G - A - C^ - A G",                                            // A: gaps, octave kick, minor third climb
      "C* - C^ - C C^* - C - D# - F G - A# C^*",                                        // C: octave stabs then a walk-up
      "D* D - D^ - D D* - C - D - F - G A",                                             // D: ghost 16ths answered by C and F
      "G* - - G G# A A# B* - - C^ - C^ B A# A",                                         // G: chromatic walk-up and walk-down
      "F* - F_ - F F^* - F - F - D# - F - G",                                           // F: low and high octave pops
      "E* - E^ - - E E - E* - E^ - D - E -",                                            // E: off-beat octave hits
      "A_* - A - A^ A_ - A_* - A^ - A_ A - G~ A",                                       // A: octave pops with a slide home
      "C* - - C D# - C* - F - - F G~ A# - C^*",                                         // C: minor riff, slide up to the top
      "D#* - D# D#^ - D# - D#* - A# - D# - F G G#",                                     // D#: fifth drop and a walk-up
      "G* - G - G^ - G G* - G - A# - C^ - D^ G* - G G - G^* - G - F - D# - D - F",      // G: two bars, riff then answer (32)
      "F#* - - F# - F#^ F# - F#* - - A - B - C#^",                                      // F#: space, climbing out
      "A* A - A - A^* - A G~ A - A^* - E - G",                                          // A: tight 16ths with a fifth drop
    ]],
    // Disco: driving octave bass.
    ['Disco', [
      "C - C^* - C - C^* - C - C^* - C - C^* -",                              // C: classic octave pump on the off-8ths
      "D D^* D D^* D D^* D D^* D D^* D D^* D D^* D D^*",                                 // D: wall of octave 16ths
      "F* - F^ F - F^ F - F^ F - F^ F G A# C^*",                                        // F: 3-3-3-3 swing, climb to the octave
      "G* G^ - G^ G* - G^ - G* G^ - G^ G* - G^ -",                                      // G: syncopated octaves, gaps on the 3s
      "A - A^ A_ - A^ A - A^ A_ - A^ A - A^ E",                                         // A: low-high-mid bounce, fifth pickup
      "D#* D#^ D#* D#^ D#* D#^ D#* D#^ F* F^ F* F^ G* G^ G* G^",                        // D#: octave pump through a rising chord line
      "A* - A^ - A - A^~ A - A* - A^ - A G~ A^",                                        // A: octave bass with slides
      "E* E^ E E^ E E^ E E^ E* E^ E E^ G* G^ A* A^",                                    // E: even octaves, G and A turnaround
      "C#* - C#^ C# - C#^ C# - C#^* - C# C#^ - C# C#^ G#",                              // C#: shuffled octaves
      "G#_* - G# G#_ - G# G#_* - G#_ - G# G#_ - G#^ G#_ G#",                            // G#: deep, bouncing across three octaves
      "F#* - F#^ - F#* - F#^ F# - F#^* - F# - E F# A",                                  // F#: sparse octaves with a walk back
      "G* G^ G G^ G G^ G G^ G* G^ G G^ G G^ G G^ A#* A#^ A# A#^ A#* A#^ A# A#^ C^* B A# A G F D# D", // G then A#: two bars and a falling fill (32)
      "D* - D^ D - D^* D - D^ D - D^* D - D^ A",                                        // D: heavy accent on each 3rd 16th
    ]],
    // House: off-beat bass, one or two notes, a few slides.
    ['House', [
      "- - C* - - - C - - - C* - - - C -",                                               // C: the off-beat, plain
      "- - D* - - - D - - - D* - - - D D^*",                                             // D: off-beat with an octave kick at the end
      "- - F* - - - F - - - F* - - - F~ G",                                              // F: slide to G before the bar
      "- - G* - - - G - - - A#* - - - A# -",                                             // G to A#: two-chord off-beat
      "- - A* - - - A^ - - - A* - - - A^ A",                                             // A: low, high off-beat
      "- - D#* - - - D# - - - D#* - - - F~ G",                                            // D#: slide up the scale
      "- - C#* - C# - - - - - C#* - C# - - -",                                           // C#: doubled hits
      "- E - E* - - E - - E - E* - - E -",                                               // E: syncopated stabs
      "- - G#_* - - - G#_ - - - G#_* - - - G# G#^",                                      // G#: deep hits, octave run out
      "- - F#* - F#~ G# - - - - F#* - F#~ A - -",                                        // F#: slides up a step and a third
      "- - A#* - - - A# - - - A#* - - - C^ A#",                                          // A#: off-beat with a quick upper neighbour
      "- - B* - - - B - - - B* - - - B - - - B* - - - B - - - D^* - - - D^ E^",          // B: two bars, second one lifts (32)
      "C* = = - - - C - - C* = = - - - G",                                               // C: long held hits with a fifth at the end
    ]],
    // Tech house: minimal, rolling 16ths on one note, moving accents.
    ['Tech House', [
      "C* C C C* C C C* C C C* C C C* C C* C",                                           // C: 3-3-3-3-2-2 accent roll
      "D* D - D D* - D D D* D - D D* - D D",                                             // D: rolling with gaps
      "A* A A A_ A A A* A A A A_* A A A A^* A",                                           // A: roll with low drops and an octave flick
      "F F F* F F F* F F F* F F F* F F F* F F F F* F F F* F F F* F F F* F G~ G# A#*",       // F: roll, second bar climbs (32)
      "G* G G G^ G G G* G G G^ G G G* G G^ G",                                           // G: octave flicks
      "D#* - D# D# - D#* D# - D# D#* - D# - D#* D# D#^",                                 // D#: sparse and nervous
      "C# C#^ C# C# C#^* C# C# C#^ C#* C# C#^ C# C# C#^* C# C#",                          // C#: octave ticks on the off-beat
      "A#* A# A# A#~ C^ A# A# A#* A# A# A#~ C^ A# A#* A# D#",                            // A#: filter-groove slides to the second
      "E* E E E* E E E* E E E* E E E* E E E E* E E E* E E E* E E E^* E E G* E E D",      // E: roll, then a G and D answer (32)
      "G#* - G# G# G#* - G# G# G#* - G# G#^ G#* - G# G#",                                 // G#: hard gaps, one high note
      "F#_* F#_ F#_ F# F#_ F#_* F#_ F#_ F# F#_ F#_* F#_ F#_ F# F#_ F#_*",                  // F#: low rolling pulse
      "B* - B B B* - B B B* - B B B* - B B B* - B B B* - B B B* - B^ B B* - B B^",        // B: minimal roll, octave moves in bar two (32)
    ]],
    // Melodic: minor, dorian and phrygian hooks; slides and ties for legato.
    ['Melodic', [
      "A* - C^ - E^* - D^~ C^ A - G~ A* = - E G",                                         // A minor: arpeggio up, step down
      "D* - F - A = - G~ F D - E F~ G A C^",                                             // D dorian: held fifth, sliding return
      "E* F~ G - E^ - D^ - C^ B A~ G F E - -",                                           // E phrygian: top-down scale
      "C* - D# - G = F~ D# D - C - D# G~ A# C^*",                                        // C minor: climb with a held fifth
      "F* - G# - C^ = - A#~ G# G - F - G~ G# C^ C#^* - C^ - G#~ G = - F - G# - G F D# F", // F minor: question and answer (32)
      "G* - A# - D^ - C^~ A# G - F - G A# D^ F^",                                        // G dorian: arpeggio with a top slide
      "A* A#~ C - A^ - G^ - F^ E^ D^ C - A# A -",                                        // A phrygian: octave leap and a scale fall
      "D* - F - A - D^ - C^ A~ G F D - E~ F",                                            // D minor: arpeggio, then a slide back
      "C* D# = F G~ A - G D# = C - D G~ A D^*",                                          // C dorian: held third, lift to the octave
      "E* - G - B - E^ = - D^ B - G - A B C^* - B - A = - G~ F# E - G - B~ A G",         // E minor: two bars, second one answers (32)
      "A* - A C^ - D^ - E^* - D^ C^ - A G~ A -",                                         // A minor pentatonic hook
      "F#* - A - C#^ = - B~ A F# - G - A B~ C#^",                                         // F# phrygian: arpeggio with a flat second
      "G* - - A# D^ - C^ - A# - G - F - G A# D^* = - C^ - A#~ G = - F - G - A# C^ D^",   // G minor: long hook up and back (32)
    ]],
  ];

  const list = [];
  BANK.forEach(([style, lines]) => lines.forEach((steps, i) => list.push({ name: style + ' ' + String(i + 1).padStart(2, '0'), steps })));
  window.TB303Factory = { list };
})();
