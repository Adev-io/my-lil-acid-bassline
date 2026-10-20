# Plugin step sequencer (host-tempo locked) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** the plugin plays the web app's step pattern in time with FL Studio's tempo and song position, with the step grid in the plugin window and the pattern saved in the FL project.

**Architecture:** a pure, host-free `Sequencer.h` (pattern, `stepEvent` port of `acidbass.js`, and an `Engine` that turns FL's tempo and position into timed note-on/note-off events per audio block). The processor feeds those events into the same voice as MIDI (merged by sample), holds one pattern (spin-locked copy for the audio thread), stores it in the saved state as JSON, and exposes three new parameters (`seqon`, `swing`, `gate`). The page edits the pattern as JSON; `ui-bridge.js` ships it by event and shows the playing step.

**Tech Stack:** JUCE 9.0.4 C++20 (`plugin/`), `juce::AudioPlayHead` (bpm, ppq, isPlaying), the web page (`index.html`, `acidbass.js`, `ui-bridge.js`), bun/node tests, `plugin\build.bat` (run it from PowerShell with stdin from nul; it hangs under Bash).

**Decisions (user, 18 Oct):** one pattern (up to 32 steps; per step: note, octave, accent, slide, tie, rest); piano-roll notes play live over the sequencer (both feed the one voice, newest note wins); plays only while FL's transport plays; no slots, song, export, keyboard typing or tempo knob in the plugin. The standalone app has no host clock, so the sequencer stays silent there.

Web reference: one step = a 16th (`stepSeconds = 60/bpm/4`); odd steps are delayed by `swing * step * 0.33`; gate off at `stepStart + step*len` where `len` is `gateFrac(gate)` = `0.1 + 0.9*gate` for plain notes (`ev.len < 0.9`) and the event's own len (0.95) for ties; velocity 110/127 or more is an accent; a new trigger step cancels a gate-off still pending, a rest does not; `hold` (slide into a note, or a tie follows) schedules no gate-off. The voice treats a note-on while another note is held as a legato slide, and a trigger step must therefore release the previous note first.

---

### Task 1: `Sequencer.h` (pure engine) and its smoke checks

**Files:** Create `plugin/Source/Sequencer.h`; modify `plugin/Source/Maps.h` (add `gateFrac`), `plugin/Tests/smoke.cpp`.

- [ ] **Step 1: Write failing smoke checks** (before the final failure printf, in the file's existing style; include `Sequencer.h`). Cases, each with the exact expectation:
  1. `acidmaps::gateFrac(0.5)==0.55`, `gateFrac(0)==0.1`, `gateFrac(1)==1.0`.
  2. Timing: pattern of 4 notes (`C D E F`, all `note`, len 4), `Settings{on,swing 0,gateFrac 0.55}`, bpm 120, sr 44100, one block of 22050 samples from ppq 0 (playing): NoteOn samples are `0, 5512, 11025, 16537` (+-1), midi `36,38,40,41`.
  3. Gate off: each plain note's NoteOff lands `0.55*5512.5` samples (3032 +-1) after its NoteOn, and before the next NoteOn.
  4. Rest: steps `C rest C rest` give two NoteOns, no extra events at the rests.
  5. Accent: step with `accent` gives velocity >= 110/127, plain gives < 110/127.
  6. Slide: `C(slide) D`: events at D's start are `NoteOn D` and then `NoteOff C` at the same sample; there is no NoteOff for C before it.
  7. Tie: `C tie rest`: no NoteOn at the tie step; one NoteOff for C at `tieStart + 0.95*step` (+-1).
  8. Octave: `oct +1` adds 12 to midi, `-1` subtracts 12.
  9. Stop: after a block where a note is sounding, a block with `playing=false` emits one NoteOff at sample 0 and nothing afterwards.
  10. Jump: after a block ending at ppq 2.0, a block starting at ppq 0.0 (loop) emits NoteOff for the sounding note at sample 0, then NoteOn at 0 for step 0.
  11. Swing 1.0: step 1 starts `0.33*5512.5` (1819 +-1) samples after its straight position.
  12. Swing drop rule: a swung odd step's pending NoteOff that would land after the next even step's start is dropped when that step triggers (no NoteOff for the old note after the new NoteOn).
  13. Block-split invariance: processing the same 22050 samples as 8 blocks of 2756/2757 gives the same NoteOn/NoteOff sample positions (sum offsets) as one block.
  14. JSON: `fromJson` of a web-shaped string clamps (`len` 99 to 32, `note` 99 to 12, `oct` 5 to 1, an unknown gate string to rest, missing steps to rests), and `toJson(fromJson(x))` equals `JSON.stringify(cleanPattern(x))` from node for the same x (generate the expected string with node: `node -e "..."` requiring `acidbass.js` with a `window` stub, as the earlier envelope task did).
  Run `plugin\build.bat`: expect compile failure (no `Sequencer.h`).
- [ ] **Step 2: `Maps.h`** add `inline double gateFrac (double k) { return 0.1 + 0.9 * k; }`.
- [ ] **Step 3: `plugin/Source/Sequencer.h`** (namespace `acidseq`), written like this:
  ```cpp
  // Sequencer.h — the web app's step pattern and its event rules, plus an engine that turns a host's tempo and position into note events.
  // No JUCE audio code in here (only juce::var for JSON), so the smoke test can drive it without a host.
  // Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see plugin/LICENSE)
  #pragma once
  #include <juce_core/juce_core.h>
  #include <algorithm>
  #include <cmath>
  #include <vector>

  namespace acidseq
  {
  constexpr int maxSteps = 32;
  enum class Gate : int { Note = 0, Rest = 1, Tie = 2 };
  struct Step { Gate gate = Gate::Rest; int note = 0, oct = 0; bool accent = false, slide = false; };
  struct Pattern { int len = 16; Step steps[maxSteps]; };

  inline int midiOf (const Step& s) { return 36 + s.note + 12 * s.oct; }

  // acidbass.js stepEvent(): what one step does, given its neighbours (patterns wrap).
  struct Event { bool off = true, trig = false, glide = false, hold = false, accent = false; int midi = 0; float len = 0.55f; };

  inline Event stepEvent (const Pattern& p, int i)
  {
      const int L = std::max (1, p.len);
      auto at = [&] (int j) -> const Step& { return p.steps[((j % L) + L) % L]; };
      const Step& s = at (i); const Step& prev = at (i - 1); const Step& next = at (i + 1);
      Event e;
      if (s.gate == Gate::Rest) return e;
      e.hold = (s.slide && next.gate == Gate::Note) || next.gate == Gate::Tie;
      if (s.gate == Gate::Tie)
      {
          for (int b = 1; b <= L; ++b)
          {
              const Step& q = at (i - b);
              if (q.gate == Gate::Note) { e.off = false; e.midi = midiOf (q); e.len = 0.95f; return e; }
              if (q.gate == Gate::Rest) break;
          }
          e.hold = false; return e;   // nothing but ties: no pitch, treated as a rest
      }
      const bool legato = prev.slide && prev.gate == Gate::Note;
      e.off = false; e.trig = ! legato; e.glide = legato; e.midi = midiOf (s); e.accent = s.accent; e.len = 0.55f;
      return e;
  }

  inline Pattern fromJson (const juce::String& text)
  {
      Pattern p;
      const auto v = juce::JSON::parse (text);
      auto num = [] (const juce::var& x, int lo, int hi, int d) { return x.isDouble() || x.isInt() || x.isInt64() ? juce::jlimit (lo, hi, (int) std::lround ((double) x)) : d; };
      p.len = num (v["len"], 1, maxSteps, 16);
      if (auto* a = v["steps"].getArray())
          for (int i = 0; i < maxSteps && i < a->size(); ++i)
          {
              const auto& s = (*a)[i]; Step& o = p.steps[i];
              const auto g = s["gate"].toString();
              o.gate = g == "note" ? Gate::Note : g == "tie" ? Gate::Tie : Gate::Rest;
              o.note = num (s["note"], 0, 12, 0); o.oct = num (s["oct"], -1, 1, 0);
              o.accent = s["accent"].isBool() && (bool) s["accent"]; o.slide = s["slide"].isBool() && (bool) s["slide"];
          }
      return p;
  }

  // The same text JSON.stringify(cleanPattern(...)) gives in the page: keys in this order, no spaces.
  inline juce::String toJson (const Pattern& p)
  {
      juce::String t = "{\"len\":" + juce::String (p.len) + ",\"steps\":[";
      for (int i = 0; i < maxSteps; ++i)
      {
          const Step& s = p.steps[i];
          t << (i ? "," : "") << "{\"gate\":\"" << (s.gate == Gate::Note ? "note" : s.gate == Gate::Tie ? "tie" : "rest")
            << "\",\"note\":" << s.note << ",\"oct\":" << s.oct << ",\"accent\":" << (s.accent ? "true" : "false") << ",\"slide\":" << (s.slide ? "true" : "false") << "}";
      }
      return t + "]}";
  }

  struct Settings { bool on = false; float swing = 0.0f; float gateFrac = 0.55f; };
  struct Out { bool on; int sample; int note; float velocity; };

  class Engine
  {
  public:
      int currentStep() const { return stepNow; }   // -1 when silent

      // One block. ppq0 is the song position in quarter notes at the block's first sample. Events come out in time order.
      void process (const Pattern& pat, const Settings& s, bool playing, double ppq0, double bpm, int n, double sr, std::vector<Out>& out)
      {
          out.clear();
          if (! s.on || ! playing || bpm <= 0.0 || sr <= 0.0) { release (0, out); haveEnd = false; stepNow = -1; return; }
          const double perSample = bpm / 60.0 / sr, ppq1 = ppq0 + n * perSample;
          if (! haveEnd || std::abs (ppq0 - lastEnd) > 0.05)   // start, or the host jumped (loop, locate): let go and re-sync
          {
              release (0, out);
              nextK = (long long) std::ceil (ppq0 * 4.0 - 1.0e-6);
          }
          haveEnd = true; lastEnd = ppq1;
          auto timeOf = [&] (long long k) { return k * 0.25 + ((k & 1) ? (double) s.swing * 0.25 * 0.33 : 0.0); };
          auto sampleOf = [&] (double t) { return juce::jlimit (0, n - 1, (int) ((t - ppq0) / perSample)); };
          for (;;)
          {
              const double tStep = timeOf (nextK), tOff = pendingOff ? offAt : 1.0e300;
              if (tOff < ppq1 && tOff <= tStep) { release (sampleOf (tOff), out); continue; }
              if (tStep >= ppq1) break;
              const int len = std::max (1, pat.len), idx = (int) (((nextK % len) + len) % len);
              const Event e = stepEvent (pat, idx);
              const int at = sampleOf (tStep);
              if (! e.off)
              {
                  stepNow = idx;
                  pendingOff = false;   // a step that sounds cancels a gate-off still waiting; a rest leaves it be, as in the page
                  if (e.trig || ! sounding) { release (at, out); start (e, at, out); }
                  else if (e.glide) { const int old = cur; start (e, at, out, false); if (old != e.midi) out.push_back ({ false, at, old, 0.0f}); }   // new note first, then let the old one go: the voice slides (a slide to the same pitch must not release it)
                  if (! e.hold) { pendingOff = true; offAt = tStep + 0.25 * (e.len < 0.9f ? s.gateFrac : e.len); }
              }
              ++nextK;
          }
      }

  private:
      void start (const Event& e, int at, std::vector<Out>& out, bool) { out.push_back ({ true, at, e.midi, e.accent ? 1.0f : 0.7f }); cur = e.midi; sounding = true; }
      void release (int at, std::vector<Out>& out)
      {
          if (sounding) out.push_back ({ false, at, cur, 0.0f });
          sounding = false; pendingOff = false;
      }

      long long nextK = 0; double lastEnd = 0.0, offAt = 0.0; bool haveEnd = false, pendingOff = false, sounding = false; int cur = 0, stepNow = -1;
  };
  }
  ```
  (Tidy the unused `bool` parameter of `start` away if you prefer; keep the behaviour. A tie step with nothing sounding starts its note as a trigger; that is deliberate for starting playback mid-tie.) Note `stepNow` must also become -1 when a note releases because of a rest? No: it stays on the last sounding step until the next sounding step, and goes to -1 only when the sequencer stops; the page highlight is fine with that.
- [ ] **Step 4:** `plugin\build.bat` green, new checks pass, old 80 unchanged.
- [ ] **Step 5: Commit** (plain prose, no attribution): `Plugin: step sequencer engine locked to host tempo and position`.

### Task 2: Processor integration, parameters and saved state

**Files:** Modify `plugin/Source/PluginProcessor.h`, `plugin/Source/PluginProcessor.cpp`, `plugin/Tests/smoke.cpp`.

- [ ] **Step 1: Failing smoke checks** using a small `juce::AudioPlayHead` subclass in the test that returns a fixed `PositionInfo` (isPlaying, bpm, ppqPosition) and `proc.setPlayHead (&head)`:
  1. Params `seqon` (bool, default false), `swing` (0..1, default 0), `gate` (0..1, default 0.5) exist.
  2. With `seqon` on, playing at 120 BPM from ppq 0 and a pattern set through `proc.setPatternJson (...)` (C D E F, len 4), one beat of blocks gives non-silent output; with `seqon` off the same run is silent (peak < 1e-6).
  3. With `seqon` on and the host not playing: silent.
  4. Piano-roll MIDI still plays while the sequencer is on.
  5. State: set a pattern, `getStateInformation`, make a second processor, `setStateInformation`: `getPatternJson()` equals the first.
  6. `getPatternJson()` of a fresh processor equals `acidseq::toJson (acidseq::Pattern{})` (all rests, len 16).
- [ ] **Step 2: Header:** add `#include "Sequencer.h"`, public `void setPatternJson (const juce::String&); juce::String getPatternJson() const; int seqStep() const { return seqStepNow.load(); }`; private members `acidseq::Engine seqEngine; acidseq::Pattern pattern, audioPattern; mutable juce::SpinLock patternLock; std::vector<acidseq::Out> seqOut; juce::MidiBuffer merged; std::atomic<int> seqStepNow { -1 };`.
- [ ] **Step 3: Parameters:** in `createLayout` add `l.add (std::make_unique<juce::AudioParameterBool> (juce::ParameterID { "seqon", 1 }, "Sequencer On", false)); knob ("swing", "Swing", 0.0f); knob ("gate", "Gate Length", 0.5f);` (after the other knobs).
- [ ] **Step 4: Pattern storage** in the `.cpp`:
  ```cpp
  void AcidBassProcessor::setPatternJson (const juce::String& json)
  {
      const auto p = acidseq::fromJson (json);
      { const juce::SpinLock::ScopedLockType l (patternLock); pattern = p; }
      apvts.state.setProperty ("pattern", acidseq::toJson (p), nullptr);
  }
  juce::String AcidBassProcessor::getPatternJson() const
  {
      const juce::SpinLock::ScopedLockType l (patternLock);
      return acidseq::toJson (pattern);
  }
  ```
  In `setStateInformation`, after `replaceState`, call `setPatternJson (apvts.state.getProperty ("pattern", acidseq::toJson (acidseq::Pattern{})).toString());`. In the constructor, set the `pattern` property to the default JSON so a fresh state has it. Because `apvts.state` holds the property, `getStateInformation` already saves it.
- [ ] **Step 5: `processBlock`:** before the MIDI loop add (the existing loop then iterates `merged` instead of `midi`):
  ```cpp
  bool playing = false; double bpm = 120.0, ppq = 0.0;
  if (auto* ph = getPlayHead())
      if (auto pos = ph->getPosition())
      {
          playing = pos->getIsPlaying() && pos->getPpqPosition().hasValue();
          bpm = pos->getBpm().orFallback (120.0); ppq = pos->getPpqPosition().orFallback (0.0);
      }
  { const juce::SpinLock::ScopedTryLockType l (patternLock); if (l.isLocked()) audioPattern = pattern; }
  acidseq::Settings ss;
  ss.on = apvts.getRawParameterValue ("seqon")->load() > 0.5f;
  ss.swing = apvts.getRawParameterValue ("swing")->load();
  ss.gateFrac = (float) acidmaps::gateFrac (apvts.getRawParameterValue ("gate")->load());
  seqEngine.process (audioPattern, ss, playing, ppq, bpm, n, getSampleRate(), seqOut);
  seqStepNow.store (seqEngine.currentStep());
  merged.clear(); merged.addEvents (midi, 0, n, 0);
  for (const auto& e : seqOut)
      merged.addEvent (e.on ? juce::MidiMessage::noteOn (1, e.note, e.velocity) : juce::MidiMessage::noteOff (1, e.note), e.sample);
  ```
  Change `for (const auto meta : midi)` to `for (const auto meta : merged)`. Add a `// ponytail:` comment that `merged` and `seqOut` allocate only on the first big block. Keep everything else.
- [ ] **Step 6:** `plugin\build.bat` green, 80 old + Task 1 + new checks pass.
- [ ] **Step 7: Commit:** `Plugin: sequencer plays through the voice from the host clock, pattern saved with the project`.

### Task 3: Editor events, page, window

**Files:** Modify `plugin/Source/Editor.h`, `plugin/Source/Editor.cpp`, `ui-bridge.js`, `ui-bridge.test.mjs`, `index.html` only if unavoidable.

- [ ] **Step 1: Editor:** add listener `.withEventListener ("pattern", [this] (const juce::var& v) { const auto j = v["json"].toString(); proc.setPatternJson (j); lastPattern = proc.getPatternJson(); })` (store `AcidBassProcessor& proc` and `juce::String lastPattern; int lastStep = -2;`). In `pushChanges`: if `all` or `proc.getPatternJson() != lastPattern`, emit `pattern` `{ json }` and update `lastPattern`; if `proc.seqStep() != lastStep` (or `all`), emit `step` `{ i }`. The `ready` event sends everything (`pushChanges(true)`).
- [ ] **Step 2: `ui-bridge.js`** (plug mode only, keep inert outside the plugin):
  - `NONE = ['tempo']` (gate becomes a real plugin id); add `swing` and `seqon` to the `SW` switch table: `swing: [() => S.swing, (x) => { S.swing = x; $('swing').value = Math.round(x * 100); }]`, `seqon: [() => (seqOn ? 1 : 0), (x) => { seqOn = x > 0.5; paintSeq(); }]` with a `Seq` button created in the first `.sect` (`<button class="btn" id="seqOn" aria-pressed="false">Seq</button>`) that toggles `seqOn` and `aria-pressed`.
  - Pattern sync: poll `JSON.stringify(S.patterns[S.cur])` at 30 Hz and on change `backend.emitEvent('pattern', { json })`; on a `pattern` event from the plugin set `S.patterns[S.cur] = T.cleanPattern(JSON.parse(m.json))`, `cursor = Math.min(cursor, S.patterns[S.cur].len - 1)`, call `paintSteps()`, and remember it as last-sent so it is not echoed.
  - On a `step` event set `playing = m.i; paintSteps();` (that is the page's own playing-step variable); `-1` clears it.
  - Make the page's `play` a no-op in plug mode (`window.play = () => {};`), because on-screen keys write steps and would otherwise throw without an audio context.
  - Visibility: show the step grid and its hint line, the keyboard section (keys, Up, Down, Accent, Slide), the swing slider, the Gate group (`#envG`), the pattern edit buttons (pitch/time write, Write, Rest, Back, Next, length -, +, Clear) and Load demo; hide the bank/group/slot group, Run/Stop, the Pattern/Track mode button, the song line with Add and Clear song, `stop at pattern end`, the import/export box, MIDI in and Automate. Edit the injected CSS accordingly (use the page's real ids from index.html around lines 84-140).
  - Update `ui-bridge.test.mjs`: the NONE cross-check now expects only `tempo` missing (swing and seqon are switches, not knobs).
- [ ] **Step 3: Window size:** re-measure the page's natural size with the grid showing (16 default steps; also note the 32-step width) and update `NAT_W/NAT_H` in `ui-bridge.js` and the default size and limits in `Editor.cpp` so the default window shows everything without scroll.
- [ ] **Step 4: Verify (Standalone, CDP)**: first check no `FL64` is running (if so stop and report). Build, launch with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, and prove: the grid, keyboard and Seq button show and the song/slot/run parts do not; clicking a step then a key writes a note into `S.patterns[S.cur]` (via CDP `Runtime.evaluate`/mouse events); after `Page.reload` the written pattern is still there (round trip through the processor); the Seq button and swing survive reload; no script errors in the console. State plainly that the playing-step highlight and real timing cannot be proved in the standalone (no host clock). PrintWindow screenshots from a DPI-aware process into `C:\Users\Arikl\Desktop\screenshots`. Close the app and confirm no 'My lil acid bassline' process remains.
- [ ] **Step 5:** `node --test` and `bun test` green; `plugin\build.bat` green. Commit: `Plugin window: step grid, Seq switch and swing, pattern kept by the plugin`.

### Task 4: Install, FL check, docs, merge (controller)

- [ ] Install (FL closed). The user checks in FL: write a pattern in the grid; turn Seq on and press play in FL, the pattern plays in time with FL's tempo and the playing step lights; change tempo in FL, it follows; loop or jump the playhead, it re-syncs without stuck notes; stop FL, it goes quiet; slide, tie, accent and rest sound as in the web app; Swing and Gate length knobs work and appear in automation; save the project, close and reopen it, the pattern is still there; piano-roll notes still play with Seq on.
- [ ] README (plugin and top), roadmap F13 done (and F11 gate length done; Fat and Sync remain), merge to main locally, ask before pushing.
