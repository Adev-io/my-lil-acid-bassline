# Plugin envelopes (filter + amp ADSR) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** the plugin gets the web app's filter and amp envelopes (attack, decay, sustain, release) as automatable parameters, and the Envelope panel shows in the plugin window.

**Architecture:** seven new 0..1 knob parameters named like the web keys (`fatk fsus frel aatk adec asus arel`). `Maps.h` gets the web's three time maps. `AcidVoice` replaces its fixed amp attack/release and its decay-only filter envelope with attack / decay-to-sustain / release stages. `ui-bridge.js` stops listing those keys as "no plugin parameter" and the page's Envelope panel is un-hidden. The web `fdec` (filter decay) already maps to the existing `decay` parameter. Gate length stays out (it only means something with a sequencer).

**Tech Stack:** JUCE 9.0.4 C++20 (`plugin/`), the web page (`index.html`, `acidbass.js`, `ui-bridge.js`), bun/node tests, `plugin\build.bat`.

Web reference (index.html `play()`/`gateOff()`, acidbass.js): `atkSec(k)=0.002*750^k`, `decSec(k)=0.03*83^k`, `relSec(k)=0.005*400^k`. Defaults: fatk 0, fsus 0, frel 0.68, aatk 0, adec 0.5, asus 1, arel 0.03. Amp: rises with time constant `max(atkSec,0.002)/4` for that long, then falls toward `level*asus` with time constant `decSec(adec)/3`; on gate off it falls to 0 with time constant `relSec(arel)/3`. Filter (octave fraction `filtEnv`, cutoff = base * 2^(oct*filtEnv)): rises 0 to 1 linearly over `atkSec(fatk)`, then falls toward `fsus` with time constant `dec/3`; on gate off it falls to 0 with time constant `relSec(frel)/3`.

---

### Task 1: Parameters, maps and voice (C++)

**Files:** Modify `plugin/Source/Maps.h`, `plugin/Source/AcidVoice.h`, `plugin/Source/PluginProcessor.cpp` (`createLayout`, `currentParams`), `plugin/Tests/smoke.cpp`.

- [ ] **Step 1: Write failing smoke checks** (add before the final failure printf, in the file's existing style):
  - Maps: `acidmaps::atkSec(0)==0.002`, `atkSec(1)==1.5` (1.5 s), `envDecSec(0.5)` and `relSec(0.03)` equal the numbers `acidbass.js` gives (compute them with node: `node -e "const T=require('./acidbass.js')..."` or read the file; use the same pattern the existing map checks use).
  - The seven parameters exist (`apvts.getParameter("fatk")` etc. non-null) with the web defaults above.
  - Audio, using the existing note-rendering helper in smoke.cpp: (a) `asus`=0, `adec`=0.1: a held note's level 1 s in is under 5 % of its peak; with `asus`=1 it stays above 50 %. (b) `aatk`=1 (1.5 s): RMS of the first 20 ms is under 10 % of the RMS at the default `aatk`=0. (c) `arel`=1 (2 s): 300 ms after note off the output is still above 10 % of the held level; at the default `arel` it is under 1 %. (d) `fsus`=1 with `envmod`=1, `decay` short: late in a held note the output is brighter (higher RMS of the first difference) than with `fsus`=0.
  - Run `plugin\build.bat`: expect the build to fail or the new checks to fail.
- [ ] **Step 2: Maps.h** add to `namespace acidmaps`:
  ```cpp
  inline double atkSec (double k)    { return 0.002 * std::pow (750.0, k); }
  inline double envDecSec (double k) { return 0.03 * std::pow (83.0, k); }
  inline double relSec (double k)    { return 0.005 * std::pow (400.0, k); }
  ```
- [ ] **Step 3: AcidParams** add (after `lfoPw`):
  ```cpp
  float fAtkSec = 0.002f, fSus = 0.0f, fRelSec = 0.2833f;        // filter attack, sustain (fraction of the env depth), release
  float aAtkSec = 0.002f, aDecSec = 0.1904f, aSus = 1.0f, aRelSec = 0.0059f;   // amp ADSR; the numbers are the web defaults
  ```
- [ ] **Step 4: AcidVoice**: remove the fixed `atkCoef`/`relCoef` (and their lines in `prepare`). Add members `float filtAtkInc = 0.0f, ampAtkCoef = 0.0f; double ampAtkLeft = 0.0; bool filtRising = false;`, reset them in `reset()`. In `noteOn`, replace `filtEnv = 1.0f;` with:
  ```cpp
  filtEnv = 0.0f; filtRising = true;
  filtAtkInc = 1.0f / (std::max (p.fAtkSec, 0.001f) * (float) sampleRate);
  const float aa = std::max (p.aAtkSec, 0.002f);
  ampAtkLeft = aa * sampleRate; ampAtkCoef = 1.0f - std::exp (-1.0f / (aa / 4.0f * (float) sampleRate));
  ```
  In `render`, add before the loop (next to `decCoef`):
  ```cpp
  const float fRelCoef = std::exp (-1.0f / (std::max (p.fRelSec, 0.002f) / 3.0f * (float) sampleRate));
  const float aDecCoef = 1.0f - std::exp (-1.0f / (std::max (p.aDecSec, 0.005f) / 3.0f * (float) sampleRate));
  const float aRelCoef = 1.0f - std::exp (-1.0f / (std::max (p.aRelSec, 0.002f) / 3.0f * (float) sampleRate));
  ```
  and replace the two envelope lines inside the loop (`ampEnv += ...` and `filtEnv *= decCoef;`) with:
  ```cpp
  if (gate)
  {
      if (ampAtkLeft > 0.0) { ampEnv += (level - ampEnv) * ampAtkCoef; ampAtkLeft -= 1.0; }
      else                  { ampEnv += (level * p.aSus - ampEnv) * aDecCoef; }
      if (filtRising) { filtEnv += filtAtkInc; if (filtEnv >= 1.0f) { filtEnv = 1.0f; filtRising = false; } }
      else            { filtEnv = p.fSus + (filtEnv - p.fSus) * decCoef; }
  }
  else { ampEnv -= ampEnv * aRelCoef; filtEnv *= fRelCoef; filtRising = false; }
  ```
  Keep `out[i] = s * ampEnv;`. Update the file's header comment to say it now has filter and amp ADSR.
- [ ] **Step 5: Processor**: in `createLayout` after the existing `knob (...)` lines add `knob ("fatk","Filter Attack",0.0f); knob ("fsus","Filter Sustain",0.0f); knob ("frel","Filter Release",0.68f); knob ("aatk","Amp Attack",0.0f); knob ("adec","Amp Decay",0.5f); knob ("asus","Amp Sustain",1.0f); knob ("arel","Amp Release",0.03f);`. In `currentParams` add:
  ```cpp
  p.fAtkSec = (float) acidmaps::atkSec (v ("fatk")); p.fSus = v ("fsus"); p.fRelSec = (float) acidmaps::relSec (v ("frel"));
  p.aAtkSec = (float) acidmaps::atkSec (v ("aatk")); p.aDecSec = (float) acidmaps::envDecSec (v ("adec")); p.aSus = v ("asus"); p.aRelSec = (float) acidmaps::relSec (v ("arel"));
  ```
- [ ] **Step 6:** `plugin\build.bat` green, all old checks (70) plus the new ones pass; any old audio check that fails because the envelope shape moved a little must be reported, not loosened. The existing state-save test may count parameters: update its count (38 to 45) only if it hard-codes it.
- [ ] **Step 7: Commit** (plain prose, no attribution lines): `Plugin: filter and amp ADSR parameters and voice stages`.

### Task 2: Show the Envelope panel in the plugin window

**Files:** Modify `ui-bridge.js`, `ui-bridge.test.mjs`, `plugin/Source/Editor.cpp`.

- [ ] **Step 1:** In `ui-bridge.js` set `NONE = ['tempo', 'gate']`; in the injected CSS delete `.plug .eg:has(#envA),` (keep `.plug .eg:has(#envG)`, the gate length stays hidden). Update `ui-bridge.test.mjs` where it pins the old `NONE` list; keep the cross-check that every web knob key has a plugin id in `PluginProcessor.cpp` or is in `NONE` (it now covers the seven new ids).
- [ ] **Step 2:** `node --test` and `bun test` green.
- [ ] **Step 3:** `plugin\build.bat`, launch the Standalone (first check `FL64` is not running; if it is, stop and report). Use the CDP method from the earlier tasks (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`) to prove: the Filter and Amp envelope panels are visible; a drag on an Amp Sustain knob changes `S.knobs.asus` and survives `Page.reload` (round trip through the processor). Re-measure the page's natural size with the Envelope panel open; update `fitZoom`'s natural width/height constants (810/750) and the editor's default size and limits in `Editor.cpp` so the whole page shows at default size with zoom 1. Screenshots via PrintWindow from a DPI-aware process, saved to `C:\Users\Arikl\Desktop\screenshots`. Close the app.
- [ ] **Step 4: Commit** (plain prose, no attribution): `Plugin window: Envelope panel shown, size refitted`.

### Task 3: Install and FL check (controller)

- [ ] Install, ask the user to check in FL: Amp Attack to the right gives a slow swell; Amp Sustain at 0 with a short Amp Decay gives plucks even on held notes; Amp Release to the right gives a tail after the note ends; Filter Attack/Sustain/Release audibly change the sweep; the Envelope knobs show up in FL's automation list.
- [ ] README note, roadmap F11 updated (envelopes done; delay Fat and Sync still open), merge `feat/plugin-web-ui` to `main` locally, ask before pushing.
