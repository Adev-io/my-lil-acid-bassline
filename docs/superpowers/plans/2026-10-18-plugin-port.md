# Plugin Port (Tweaks, Drive, Delay, Reverb) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the web app's new sound features (Tweaks, Drive, Delay with Tone and Stereo, Reverb) into the JUCE VST3, with the same knob names, maps and defaults, so the plugin sounds like the web app and every knob is host-automatable.

**Architecture:** Pure maths live in one header (`Maps.h`) that mirrors `acidbass.js` and is checked against golden numbers computed from the web core. Each effect is its own small header (`DriveStage.h`, `DelayStage.h`, `ReverbStage.h`) used by `PluginProcessor`. The voice keeps its job (oscillator, HP, filters, envelopes) but no longer applies volume or the output clip: the processor does `voice -> drive -> volume + tanh clip -> delay -> reverb`, the same order as the web graph. New knobs are normalised 0..1 parameters named like the web knobs.

**Tech Stack:** C++20, JUCE 9.0.4 (`juce_dsp`), CMake + Ninja, `plugin/build.bat`, the headless smoke test `plugin/Tests/smoke.cpp`.

**Out of scope (say so in the README, do not build):** delay Fat and tempo Sync, the real editor (still the generic one), presets, filter attack/sustain/release and amp ADSR knobs, MIDI-learn. Latency from the drive oversampler is not compensated (the web graph has the same few-sample offset).

**Reference:** spec `docs/superpowers/specs/2026-10-17-drive-reverb-tweaks-design.md`; web code `acidbass.js` (maps, `driveShape`, `driveCurve`, `reverbIR`) and `index.html` (`play`, `buildDrive`, `buildReverb`, `buildDelay`).

**Build/run:** `plugin\build.bat` from a normal prompt (finds Visual Studio itself, builds the VST3 and the test, runs ctest). To run only the test after a build: `plugin\build\MyLilAcidBasslineTest_artefacts\Release\MyLilAcidBasslineTest.exe` (path may differ; `ctest --test-dir plugin\build --output-on-failure` always works). Use PowerShell for flags. Commits: normal prose, NO Co-Authored-By or any AI attribution.

**Golden numbers** (from `acidbass.js`, k = 0 / 0.5 / 1):

| map | k=0 | k=0.5 | k=1 |
|---|---|---|---|
| hpHz | 20 | 100 | 500 |
| minDecSec | 0.03 | 0.134164079 | 0.6 |
| pwFrac | 0.05 | 0.5 | 0.95 |
| lfoHz | 0.05 | 1 | 20 |
| drHpHz | 20 | 126.491106 | 800 |
| drDb | 0 | 15 | 30 |
| drToneHz | 800 | 3577.70876 | 16000 |
| drVolDb | -12 | 0 | 12 |
| rvPreSec | 0 | 0.1 | 0.2 |
| rvDecSec | 0.3 | 1.34164079 | 6 |
| rvSizeScale | 0.5 | 1 | 1.5 |
| rvLowHz | 20 | 100 | 500 |
| rvHighHz | 1000 | 4472.13595 | 20000 |
| dToneHz | 400 | 2828.42712 | 20000 |
| delayMs | 20 | 141.421356 | 1000 |
| delayFb | 0 | 0.45 | 0.9 |

Also: `keyMul(1, 60) = 2`, `keyMul(0.5, 36) = 0.70710678`, `driveMakeupDb(30) = -12`, `dbGain(6) = 1.99526231`.
Drive curves (2048 entries, indices 0 / 512 / 1024 / 1500 / 2047): soft `-0.905148268 -0.634930313 0.000732779561 0.603312433 0.905148268`; tube `-1.15412962 -0.716010988 0.000649706461 0.444784224 0.615370393`; wavefold `-0.928959727 -0.82743448 0.000952613424 0.788176656 0.928959727`.
Reverb IR `reverbIR(44100, seed 1, size 0.5, decay 0.5, damp 0.5)`: length 59167; L[100] = 0.0265145488, L[1000] = -0.00247813342, L[5000] = -0.0280174501; R[100] = 0.00853167567, R[1000] = -0.445941746. With decay 0, damp 1: length 13230, L[100] = 0.0259936936.

---

### Task 0: Branch and baseline

**Files:** Modify `plugin/Tests/smoke.cpp`.

- [ ] **Step 1: Branch**

```powershell
cd C:\Users\Arikl\Desktop\_Projects\my-lil-acid-bassline
git checkout -b feat/plugin-port
```

- [ ] **Step 2: Confirm the current plugin builds and passes**

Run `plugin\build.bat`. Expected: ends with "Done." and ctest `100% tests passed`. If it fails because the Visual Studio C++ tools are missing, stop and report.

- [ ] **Step 3: Record a baseline render of today's sound (before any change)**

Add this block just before the final `std::printf ("%d failure(s)...` line in `plugin/Tests/smoke.cpp`:

```cpp
    {   // baseline: print the default-sound signature so later tasks can prove "defaults sound as before"
        for (const char* wave : { "Saw", "Square" })
        {
            auto p = make();
            setParam (*p, "wave", std::string (wave) == "Square" ? 1.0f : 0.0f);
            auto a = render (*p, 0.6, { { 0, true, 45, 90 }, { (int) (0.4 * sr), false, 45, 0 } });
            std::printf ("BASELINE %s rms %.6f brightness %.6f\n", wave, rms (a, 2000, 15000), brightness (a, 2000, 15000));
        }
    }
```

Run `plugin\build.bat`; copy the two `BASELINE` lines from the ctest output (`ctest --test-dir plugin\build --output-on-failure -V`). Then replace the block with this check, filling the four numbers you just read (they must come from the UNCHANGED plugin):

```cpp
    {   // defaults sound as before (numbers recorded from the phase-1 plugin, before the port)
        const double refRms[2] = { SAW_RMS, SQUARE_RMS }, refBright[2] = { SAW_BRIGHT, SQUARE_BRIGHT };
        for (int w = 0; w < 2; ++w)
        {
            auto p = make();
            setParam (*p, "wave", (float) w);
            auto a = render (*p, 0.6, { { 0, true, 45, 90 }, { (int) (0.4 * sr), false, 45, 0 } });
            check (std::abs (rms (a, 2000, 15000) / refRms[w] - 1.0) < 0.03, w ? "default square matches the phase-1 level" : "default saw matches the phase-1 level", rms (a, 2000, 15000));
            check (std::abs (brightness (a, 2000, 15000) / refBright[w] - 1.0) < 0.05, w ? "default square matches the phase-1 tone" : "default saw matches the phase-1 tone", brightness (a, 2000, 15000));
        }
    }
```

Replace `SAW_RMS` etc. with the literal numbers. Note: the new square is the web's "saw minus delayed saw" and has the opposite polarity to phase-1's square; rms and brightness are polarity-blind, so they still match.

- [ ] **Step 4: Run and commit**

`plugin\build.bat` -> all `ok`. Commit: `git add plugin/Tests/smoke.cpp; git commit -m "Plugin: smoke baseline of the phase-1 sound"`.

---

### Task 1: Maps header with golden checks

**Files:** Create `plugin/Source/Maps.h`; modify `plugin/CMakeLists.txt` (add the header to `target_sources`), `plugin/Tests/smoke.cpp`.

- [ ] **Step 1: Write the golden checks first (they fail to compile until the header exists)**

Add `#include "Maps.h"` under `#include "PluginProcessor.h"` in `smoke.cpp`, and before the final `std::printf` line add:

```cpp
    {   // knob maps and curves match the web core (golden numbers from acidbass.js)
        using namespace acidmaps;
        auto near = [] (double a, double b, double tol = 1e-4) { return std::abs (a - b) <= tol * std::max (1.0, std::abs (b)); };
        check (near (hpHz (0), 20) && near (hpHz (0.5), 100) && near (hpHz (1), 500), "hpHz");
        check (near (minDecSec (0), 0.03) && near (minDecSec (0.5), 0.134164079) && near (minDecSec (1), 0.6), "minDecSec");
        check (near (pwFrac (0), 0.05) && near (pwFrac (1), 0.95), "pwFrac");
        check (near (lfoHz (0), 0.05) && near (lfoHz (0.5), 1.0, 1e-3) && near (lfoHz (1), 20), "lfoHz");
        check (near (drHpHz (0.5), 126.491106) && near (drHpHz (1), 800), "drHpHz");
        check (near (drDb (0.5), 15) && near (drToneHz (0), 800) && near (drToneHz (0.5), 3577.70876) && near (drVolDb (0), -12) && near (drVolDb (1), 12), "drive maps");
        check (near (rvPreSec (0.5), 0.1) && near (rvDecSec (0), 0.3) && near (rvDecSec (0.5), 1.34164079) && near (rvDecSec (1), 6), "reverb time maps");
        check (near (rvSizeScale (1), 1.5) && near (rvLowHz (0.5), 100) && near (rvHighHz (0.5), 4472.13595) && near (rvHighHz (1), 20000), "reverb filter maps");
        check (near (dToneHz (0), 400) && near (dToneHz (0.5), 2828.42712) && near (dToneHz (1), 20000), "dToneHz");
        check (near (delaySec (0), 0.02) && near (delaySec (0.5), 0.141421356) && near (delaySec (1), 1.0) && near (delayFb (0.5), 0.45) && near (delayFb (1), 0.9), "delay maps");
        check (near (keyMul (1, 60), 2) && near (keyMul (0.5, 36), 0.70710678) && near (keyMul (0, 90), 1), "keyMul");
        check (near (driveMakeupDb (30), -12) && near (dbGain (6), 1.99526231), "makeup and dB");
        const int idx[5] = { 0, 512, 1024, 1500, 2047 };
        const double soft[5] = { -0.905148268, -0.634930313, 0.000732779561, 0.603312433, 0.905148268 };
        const double tube[5] = { -1.15412962, -0.716010988, 0.000649706461, 0.444784224, 0.615370393 };
        const double fold[5] = { -0.928959727, -0.82743448, 0.000952613424, 0.788176656, 0.928959727 };
        const auto cs = driveCurve (DriveType::Soft), ct = driveCurve (DriveType::Tube), cf = driveCurve (DriveType::Wavefold);
        bool ok = cs.size() == 2048;
        for (int i = 0; i < 5; ++i) ok = ok && near (cs[(size_t) idx[i]], soft[i], 1e-5) && near (ct[(size_t) idx[i]], tube[i], 1e-5) && near (cf[(size_t) idx[i]], fold[i], 1e-5);
        check (ok, "drive curves match the web tables");
        const auto ir = reverbIR (44100.0, 1, 0.5, 0.5, 0.5);
        check (ir.L.size() == 59167 && ir.R.size() == 59167, "IR length", (double) ir.L.size());
        check (near (ir.L[100], 0.0265145488, 1e-4) && near (ir.L[1000], -0.00247813342, 1e-4) && near (ir.L[5000], -0.0280174501, 1e-4), "IR left samples match the web");
        check (near (ir.R[100], 0.00853167567, 1e-4) && near (ir.R[1000], -0.445941746, 1e-4), "IR right samples match the web");
        const auto ir2 = reverbIR (44100.0, 1, 0.5, 0.0, 1.0);
        check (ir2.L.size() == 13230 && near (ir2.L[100], 0.0259936936, 1e-4), "IR with decay 0 and full damp matches");
    }
```

- [ ] **Step 2: Write `plugin/Source/Maps.h`**

```cpp
// Maps.h — the web app's knob maps, drive curves and reverb impulse response, in C++. Every formula mirrors acidbass.js
// (and the smoke test checks them against numbers computed from it), so the plugin and the web app agree.
// Knob values are normalised 0..1 on both sides.
// Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see plugin/LICENSE)
#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>

namespace acidmaps
{
inline double hpHz (double k)       { return 20.0 * std::pow (25.0, k); }
inline double minDecSec (double k)  { return 0.03 * std::pow (20.0, k); }
inline double pwFrac (double k)     { return 0.05 + 0.9 * k; }
inline double lfoHz (double k)      { return 0.05 * std::pow (400.0, k); }
inline double keyMul (double k, int midi) { return std::pow (2.0, k * (midi - 48) / 12.0); }   // C3 is neutral
inline double drHpHz (double k)     { return 20.0 * std::pow (40.0, k); }
inline double drDb (double k)       { return 30.0 * k; }
inline double drToneHz (double k)   { return 800.0 * std::pow (20.0, k); }
inline double drVolDb (double k)    { return (k - 0.5) * 24.0; }
inline double dbGain (double db)    { return std::pow (10.0, db / 20.0); }
inline double driveMakeupDb (double db) { return 0.0 - 0.4 * db; }
inline double rvPreSec (double k)   { return 0.2 * k; }
inline double rvDecSec (double k)   { return 0.3 * std::pow (20.0, k); }
inline double rvSizeScale (double k) { return 0.5 + k; }
inline double rvLowHz (double k)    { return 20.0 * std::pow (25.0, k); }
inline double rvHighHz (double k)   { return 1000.0 * std::pow (20.0, k); }
inline double dToneHz (double k)    { return 400.0 * std::pow (50.0, k); }
inline double delaySec (double k)   { return 0.02 * std::pow (50.0, k); }
inline double delayFb (double k)    { return 0.9 * k; }

enum class DriveType { Soft = 0, Tube = 1, Wavefold = 2 };
constexpr double driveRange = 1.5;
constexpr int driveCurveLen = 2048;

inline double driveShape (DriveType t, double x)
{
    if (t == DriveType::Tube)     return std::tanh (x + 0.35) - std::tanh (0.35);   // biased tanh: asymmetric, zero at zero
    if (t == DriveType::Wavefold) return std::sin (x * 1.3);
    return std::tanh (x);
}

// A lookup table over input -1..1 (which stands for -driveRange..+driveRange shape units), like the web WaveShaper's curve.
inline std::vector<float> driveCurve (DriveType t)
{
    std::vector<float> c ((size_t) driveCurveLen);
    for (int i = 0; i < driveCurveLen; ++i) c[(size_t) i] = (float) driveShape (t, driveRange * (2.0 * i / (driveCurveLen - 1) - 1.0));
    return c;
}

// Read the table the way a Web Audio WaveShaper does: clamp to -1..1, then interpolate linearly.
inline float shapeLookup (const std::vector<float>& c, float x)
{
    x = std::min (1.0f, std::max (-1.0f, x));
    const float pos = (x + 1.0f) * 0.5f * (float) (c.size() - 1);
    const size_t i = std::min ((size_t) pos, c.size() - 2);
    const float f = pos - (float) i;
    return c[i] + (c[i + 1] - c[i]) * f;
}

// mulberry32, the same generator as the web core's rng(seed): same seed in, same numbers out.
struct Rng
{
    uint32_t a;
    explicit Rng (uint32_t seed) : a (seed) {}
    double next()
    {
        a += 0x6d2b79f5u;
        uint32_t t = a;
        t = (t ^ (t >> 15)) * (t | 1u);
        t ^= t + (t ^ (t >> 7)) * (t | 61u);
        return (double) (t ^ (t >> 14)) / 4294967296.0;
    }
};

struct StereoIR { std::vector<float> L, R; };

// Seeded noise with an exponential decay (-60 dB at the decay time), a fade-in set by Size, and a one-pole lowpass that
// closes as the tail ages (Hi damp). size, decay, damp are the 0..1 knob values.
inline StereoIR reverbIR (double sr, uint32_t seed, double size, double decay, double damp)
{
    const double rt = rvDecSec (decay), fade = 0.005 + 0.04 * size;
    const size_t len = (size_t) std::min (std::ceil (sr * rt), sr * 7.0);
    StereoIR out { std::vector<float> (len), std::vector<float> (len) };
    for (int c = 0; c < 2; ++c)
    {
        Rng r (seed * 2u + (uint32_t) c);
        double y = 0.0;
        auto& dst = c == 0 ? out.L : out.R;
        for (size_t i = 0; i < len; ++i)
        {
            const double t = (double) i / sr, env = std::exp (-6.9 * t / rt) * std::min (1.0, t / fade);
            const double a = 1.0 - damp * 0.9 * (1.0 - std::exp (-4.0 * t / rt));
            y += a * ((r.next() * 2.0 - 1.0) * env - y);
            dst[i] = (float) y;
        }
    }
    return out;
}
}
```

- [ ] **Step 3: Register the header and run**

In `plugin/CMakeLists.txt` add `Source/Maps.h` to the `target_sources(MyLilAcidBassline PRIVATE ...)` line. Run `plugin\build.bat`. Expected: all new `ok` lines. If an IR sample check fails by a small amount, compare `L[100]` printed to the golden value: the formula or the RNG port is wrong (do not widen the tolerance beyond 1e-4).

- [ ] **Step 4: Commit** `git add -A plugin; git commit -m "Plugin: knob maps, drive curves and reverb impulse response, checked against the web core"`

---

### Task 2: Voice tweaks (HP, key follow, min decay, pulse width, LFO)

**Files:** Modify `plugin/Source/AcidVoice.h`, `plugin/Source/PluginProcessor.cpp`, `plugin/Tests/smoke.cpp`.

Web reference: `play()` in `index.html` (key follow multiplies the cutoff, min decay floors the filter decay, the pulse is a saw minus a copy of itself delayed by pw/frequency, LFO adds `lfopw * 0.4` to the width). This task also moves volume and the output clip out of the voice so drive can sit in between (Task 4). With drive off the sound must not change (the Task 0 baseline check proves it).

- [ ] **Step 1: Write the failing checks** (add before the final printf in `smoke.cpp`)

```cpp
    {   // tweaks
        auto base = make();
        setParam (*base, "envmod", 0.0f); setParam (*base, "cutoff", 4000.0f);
        auto a = render (*base, 0.4, { { 0, true, 45, 90 } });
        auto hp = make();
        setParam (*hp, "envmod", 0.0f); setParam (*hp, "cutoff", 4000.0f); setParam (*hp, "hp", 1.0f);
        auto b = render (*hp, 0.4, { { 0, true, 45, 90 } });
        check (rms (b, 4000, 16000) < rms (a, 4000, 16000) * 0.5, "HP at max removes the bass of a low note", rms (b, 4000, 16000) / rms (a, 4000, 16000));

        auto lo = make(), hi = make();
        for (auto* p : { lo.get(), hi.get() }) { setParam (*p, "envmod", 0.0f); setParam (*p, "cutoff", 300.0f); }
        setParam (*hi, "kfol", 1.0f);
        auto c = render (*lo, 0.4, { { 0, true, 69, 90 } }), d = render (*hi, 0.4, { { 0, true, 69, 90 } });
        check (brightness (d, 4000, 16000) > brightness (c, 4000, 16000) * 1.2, "key follow brightens a high note", brightness (d, 4000, 16000) / brightness (c, 4000, 16000));

        auto md0 = make(), md1 = make();
        for (auto* p : { md0.get(), md1.get() }) { setParam (*p, "cutoff", 150.0f); setParam (*p, "envmod", 1.0f); setParam (*p, "decay", 0.05f); }
        setParam (*md1, "mind", 1.0f);
        auto e = render (*md0, 0.6, { { 0, true, 45, 90 } }), f = render (*md1, 0.6, { { 0, true, 45, 90 } });
        check (brightness (f, 4000, 12000) > brightness (e, 4000, 12000) * 1.2, "min decay keeps the filter open longer", brightness (f, 4000, 12000) / brightness (e, 4000, 12000));

        auto duty = [] (const std::vector<float>& v, int x, int y) { int pos = 0; for (int i = x; i < y; ++i) if (v[(size_t) i] > 0) ++pos; return (double) pos / (y - x); };
        auto sq = make();
        setParam (*sq, "wave", 1.0f); setParam (*sq, "envmod", 0.0f); setParam (*sq, "cutoff", 8000.0f);
        auto g = render (*sq, 0.6, { { 0, true, 57, 90 } });
        check (std::abs (duty (g, 6000, 20000) - 0.5) < 0.1, "pulse width 50 % is a square", duty (g, 6000, 20000));
        setParam (*sq, "pw", 0.0f);   // 5 %
        auto h = render (*sq, 0.6, { { 0, true, 57, 90 } });
        check (std::abs (duty (h, 6000, 20000) - 0.5) > 0.25, "pulse width 5 % is a narrow pulse", duty (h, 6000, 20000));
        auto pwm = make();
        setParam (*pwm, "wave", 1.0f); setParam (*pwm, "lfopw", 1.0f); setParam (*pwm, "lfor", 0.8f);
        auto m = render (*pwm, 1.0, { { 0, true, 45, 90 } });
        check (finite (m) && rms (m, 4000, 40000) > 0.01, "LFO to pulse width stays finite and audible", rms (m, 4000, 40000));
    }
```

Run `plugin\build.bat`: fails (unknown parameters `hp` etc.).

- [ ] **Step 2: Add the parameters** to `createLayout()` in `PluginProcessor.cpp` (after the `wave` line). Add this helper inside the function, after `using R`:

```cpp
    auto knob = [&l] (const char* id, const char* name, float def) { l.add (std::make_unique<F> (juce::ParameterID { id, 1 }, name, R (0.0f, 1.0f), def)); };
```

then:

```cpp
    knob ("hp", "HP", 0.0f); knob ("kfol", "Key Follow", 0.0f); knob ("mind", "Min Decay", 0.0f);
    knob ("pw", "Pulse Width", 0.5f); knob ("lfor", "LFO Rate", 0.6157f); knob ("lfopw", "LFO to PW", 0.0f);
```

(`l` must be declared before the lambda; it already is.)

- [ ] **Step 3: Extend `AcidParams` and the voice** (`AcidVoice.h`)

Add to the include list `#include "Maps.h"`. In `AcidParams` add:

```cpp
    float hpHz = 20.0f;        // input high-pass (20 = off)
    float keyFollow = 0.0f;    // 0..1, how far the cutoff follows the note (1 = an octave per octave, C3 neutral)
    float minDecSec = 0.03f;   // floor for the filter decay
    float pw = 0.5f;           // pulse width fraction (square only)
    float lfoHz = 1.0f;        // LFO rate
    float lfoPw = 0.0f;        // 0..1, LFO depth on the pulse width
```

In `AcidVoice` private members add `juce::dsp::StateVariableTPTFilter<float> hp; double lfoPhase = 0.0; float keyMulNow = 1.0f;`. Then change:

- `prepare`: extend the filter loop to `for (auto* f : { &f1, &f2, &hp })`, and after the loop add `hp.setType (juce::dsp::StateVariableTPTFilterType::highpass); hp.setResonance (0.7071f);` (the existing `setType(lowpass)` inside the loop runs first, so set the highpass type after the loop).
- `reset`: add `hp.reset(); lfoPhase = 0.0; keyMulNow = 1.0f;` (and keep `f1.reset(); f2.reset();`).
- `noteOn`: after `if (legato) return;` add `keyMulNow = (float) acidmaps::keyMul (p.keyFollow, note);`. Put it BEFORE `freq = targetFreq;`.
- `render`: replace the decay line with `const float decSec = std::max (accented ? std::min (p.decaySec, 0.2f) : p.decaySec, p.minDecSec);`; before the loop add `hp.setCutoffFrequency (std::min (p.hpHz, 0.45f * (float) sampleRate)); const double lfoInc = p.lfoHz / sampleRate;`; change the cutoff line to `const float hz = std::min (p.cutoffHz * keyMulNow * std::pow (2.0f, oct * filtEnv), maxHz);` (keep the existing `maxHz` cap; the web caps at 16 kHz, `maxHz` is the equivalent safe cap).
- Replace the oscillator branch (`if (p.square) ... else ...`) with:

```cpp
            float s = sawBlep (phase, dt);
            if (p.square)
            {   // the web's pulse: the saw minus a copy of itself shifted by the width (zero-mean, narrow = skewed)
                lfoPhase += lfoInc; if (lfoPhase >= 1.0) lfoPhase -= 1.0;
                const double w = (double) p.pw + 0.4 * (double) p.lfoPw * std::sin (6.283185307179586 * lfoPhase);
                double q = phase - w; q -= std::floor (q);
                s -= sawBlep (q, dt);
            }
            s = f2.processSample (0, f1.processSample (0, hp.processSample (0, s)));
```

- Replace the last line of the loop: `out[i] = s * ampEnv;` (volume and the tanh clip move to the processor), and keep `ampEnv`/`filtEnv` updates.
- Add the static helper next to `polyBlep`: `static float sawBlep (double t, double dt) { return (float) (2.0 * t - 1.0) - polyBlep (t, dt); }`.

- [ ] **Step 4: Processor** (`PluginProcessor.cpp`)

In `currentParams()` add: `p.hpHz = (float) acidmaps::hpHz (v ("hp")); p.keyFollow = v ("kfol"); p.minDecSec = (float) acidmaps::minDecSec (v ("mind")); p.pw = (float) acidmaps::pwFrac (v ("pw")); p.lfoHz = (float) acidmaps::lfoHz (v ("lfor")); p.lfoPw = v ("lfopw");`.

In `processBlock`, after the last `voice.render` call and before the channel copy, apply volume and the clip: 

```cpp
    for (int i = 0; i < n; ++i) out[i] = std::tanh (1.6f * out[i] * p.volume);   // master volume, then the soft clip standing in for the output stage (as on the web page)
```

Add `#include <cmath>` at the top if missing.

- [ ] **Step 5: Run** `plugin\build.bat`. Expected: every `ok`, including the Task 0 baseline checks (default saw and square unchanged within 3 % level and 5 % tone) and the new tweak checks. If the square baseline fails on level, the pulse maths is wrong (at pw 0.5, lfopw 0 the result must be ±1).

- [ ] **Step 6: Commit** `git add -A plugin; git commit -m "Plugin: HP, key follow, min decay, pulse width and LFO to PW; volume and clip move to the processor"`

---

### Task 3: Drive stage

**Files:** Create `plugin/Source/DriveStage.h`; modify `PluginProcessor.h/.cpp`, `CMakeLists.txt`, `smoke.cpp`.

Web reference: `buildDrive` / `applyDrive` (parallel stage: dry path untouched; wet path = HP -> pre-gain -> 4x oversampled shaper -> tone lowpass -> 20 Hz DC block -> volume incl. makeup; dry gain `1 - mix`, wet gain `mix`).

- [ ] **Step 1: Failing checks** (before the final printf)

```cpp
    {   // drive
        auto off = make(), on = make();
        for (auto* p : { off.get(), on.get() }) { setParam (*p, "envmod", 0.0f); setParam (*p, "cutoff", 3000.0f); }
        setParam (*on, "dron", 1.0f); setParam (*on, "drdrive", 0.5f);
        auto a = render (*off, 0.5, { { 0, true, 45, 90 } }), b = render (*on, 0.5, { { 0, true, 45, 90 } });
        check (finite (b) && rms (b, 4000, 20000) > 0.2 * rms (a, 4000, 20000) && rms (b, 4000, 20000) < 1.6 * rms (a, 4000, 20000), "drive on stays within a level band", rms (b, 4000, 20000) / rms (a, 4000, 20000));

        auto knobsOffA = make(), knobsOffB = make();
        for (auto* p : { knobsOffA.get(), knobsOffB.get() }) { setParam (*p, "envmod", 0.0f); setParam (*p, "cutoff", 3000.0f); }
        setParam (*knobsOffB, "drdrive", 1.0f); setParam (*knobsOffB, "drmix", 0.3f); setParam (*knobsOffB, "drhp", 0.7f);   // drive is off: these must not matter
        auto c = render (*knobsOffA, 0.3, { { 0, true, 45, 90 } }), d = render (*knobsOffB, 0.3, { { 0, true, 45, 90 } });
        double diff = 0; for (size_t i = 0; i < c.size(); ++i) diff = std::max (diff, (double) std::abs (c[i] - d[i]));
        check (diff < 1e-6, "drive off ignores the drive knobs", diff);

        auto soft = make(), tube = make(), fold = make();
        for (auto* p : { soft.get(), tube.get(), fold.get() }) { setParam (*p, "envmod", 0.0f); setParam (*p, "cutoff", 3000.0f); setParam (*p, "dron", 1.0f); setParam (*p, "drdrive", 1.0f); }
        setParam (*tube, "drtype", 1.0f); setParam (*fold, "drtype", 2.0f);
        auto s = render (*soft, 0.4, { { 0, true, 45, 90 } }), t = render (*tube, 0.4, { { 0, true, 45, 90 } }), w = render (*fold, 0.4, { { 0, true, 45, 90 } });
        check (finite (s) && finite (t) && finite (w), "all three drive types stay finite");
        double dTube = 0; for (size_t i = 4000; i < 16000; ++i) dTube += std::abs (s[i] - t[i]);
        check (dTube > 1.0, "tube sounds different from soft", dTube);

        auto hpOff = make(), hpOn = make();
        for (auto* p : { hpOff.get(), hpOn.get() }) { setParam (*p, "envmod", 0.0f); setParam (*p, "cutoff", 3000.0f); setParam (*p, "dron", 1.0f); setParam (*p, "drdrive", 0.3f); }
        setParam (*hpOn, "drhp", 1.0f);
        auto x = render (*hpOff, 0.4, { { 0, true, 45, 90 } }), y = render (*hpOn, 0.4, { { 0, true, 45, 90 } });
        check (rms (y, 4000, 16000) < rms (x, 4000, 16000) * 0.8, "drive HP thins the low note", rms (y, 4000, 16000) / rms (x, 4000, 16000));
    }
```

Run: fails (no `dron`).

- [ ] **Step 2: Parameters.** In `createLayout()` add:

```cpp
    l.add (std::make_unique<juce::AudioParameterBool> (juce::ParameterID { "dron", 1 }, "Drive On", false));
    l.add (std::make_unique<juce::AudioParameterChoice> (juce::ParameterID { "drtype", 1 }, "Drive Type", juce::StringArray { "Soft", "Tube", "Wavefold" }, 0));
    knob ("drdrive", "Drive", 0.0f); knob ("drhp", "Drive HP", 0.0f); knob ("drtone", "Drive Tone", 1.0f); knob ("drvol", "Drive Volume", 0.5f); knob ("drmix", "Drive Mix", 1.0f);
```

- [ ] **Step 3: `plugin/Source/DriveStage.h`**

```cpp
// DriveStage.h — the parallel drive: dry untouched; wet = HP -> pre-gain -> 4x oversampled shaper -> tone -> DC block -> volume.
// C++ twin of buildDrive/applyDrive in index.html. Mono. The oversampler's few samples of latency are not compensated (the web graph is the same).
// Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see plugin/LICENSE)
#pragma once
#include <juce_dsp/juce_dsp.h>
#include <algorithm>
#include <vector>
#include "Maps.h"

struct DriveParams { bool on = false; acidmaps::DriveType type = acidmaps::DriveType::Soft; float hpK = 0, driveK = 0, toneK = 1, volK = 0.5f, mix = 1; };

class DriveStage
{
public:
    void prepare (double sr)
    {
        sampleRate = sr;
        const juce::dsp::ProcessSpec spec { sr, (juce::uint32) chunk, 1u };
        for (auto* f : { &hp, &tone, &dc }) { f->prepare (spec); f->setResonance (0.7071f); }
        hp.setType (juce::dsp::StateVariableTPTFilterType::highpass);
        dc.setType (juce::dsp::StateVariableTPTFilterType::highpass); dc.setCutoffFrequency (20.0f);
        tone.setType (juce::dsp::StateVariableTPTFilterType::lowpass);
        os = std::make_unique<juce::dsp::Oversampling<float>> (1, 2, juce::dsp::Oversampling<float>::filterHalfBandPolyphaseIIR, true, false);   // 2 stages = 4x
        os->initProcessing ((size_t) chunk);
        for (int t = 0; t < 3; ++t) curves[(size_t) t] = acidmaps::driveCurve ((acidmaps::DriveType) t);
        for (auto* s : { &preG, &volG, &mixS }) s->reset (sr, 0.02);
        wet.assign ((size_t) chunk, 0.0f);
        reset();
    }
    void reset() { hp.reset(); tone.reset(); dc.reset(); if (os) os->reset(); }

    void process (float* x, int n, const DriveParams& p)
    {
        if (! p.on) return;   // off = the signal passes untouched
        const float maxHz = 0.45f * (float) sampleRate;
        hp.setCutoffFrequency (std::min ((float) acidmaps::drHpHz (p.hpK), maxHz));
        tone.setCutoffFrequency (std::min ((float) acidmaps::drToneHz (p.toneK), maxHz));
        const double db = acidmaps::drDb (p.driveK);
        preG.setTargetValue ((float) acidmaps::dbGain (db));
        volG.setTargetValue ((float) acidmaps::dbGain (acidmaps::drVolDb (p.volK) + acidmaps::driveMakeupDb (db)));
        mixS.setTargetValue (p.mix);
        const auto& curve = curves[(size_t) p.type];
        for (int start = 0; start < n; start += chunk)
        {
            const int m = std::min (chunk, n - start);
            float* w = wet.data();
            for (int i = 0; i < m; ++i) w[i] = hp.processSample (0, x[start + i]) * preG.getNextValue();
            float* ch[1] = { w };
            juce::dsp::AudioBlock<float> blk (ch, 1, (size_t) m);
            auto up = os->processSamplesUp (blk);
            float* u = up.getChannelPointer (0);
            for (size_t i = 0; i < up.getNumSamples(); ++i) u[i] = acidmaps::shapeLookup (curve, u[i]);
            os->processSamplesDown (blk);
            for (int i = 0; i < m; ++i)
            {
                const float y = dc.processSample (0, tone.processSample (0, w[i])) * volG.getNextValue();
                const float mx = mixS.getNextValue();
                x[start + i] = x[start + i] * (1.0f - mx) + y * mx;
            }
        }
    }

private:
    static constexpr int chunk = 512;
    double sampleRate = 44100.0;
    juce::dsp::StateVariableTPTFilter<float> hp, tone, dc;
    std::unique_ptr<juce::dsp::Oversampling<float>> os;
    std::array<std::vector<float>, 3> curves;
    juce::SmoothedValue<float> preG { 1.0f }, volG { 1.0f }, mixS { 1.0f };
    std::vector<float> wet;
};
```

Add `#include <array>` and `#include <memory>` at the top of the file.

- [ ] **Step 4: Wire it in.** `PluginProcessor.h`: `#include "DriveStage.h"`, member `DriveStage drive;`. `PluginProcessor.cpp`: in `prepareToPlay` add `drive.prepare (sampleRate);`; in `processBlock`, right BEFORE the volume/tanh loop from Task 2, add:

```cpp
    DriveParams dp;
    dp.on = apvts.getRawParameterValue ("dron")->load() > 0.5f;
    dp.type = (acidmaps::DriveType) juce::jlimit (0, 2, (int) apvts.getRawParameterValue ("drtype")->load());
    dp.hpK = apvts.getRawParameterValue ("drhp")->load(); dp.driveK = apvts.getRawParameterValue ("drdrive")->load();
    dp.toneK = apvts.getRawParameterValue ("drtone")->load(); dp.volK = apvts.getRawParameterValue ("drvol")->load(); dp.mix = apvts.getRawParameterValue ("drmix")->load();
    drive.process (out, n, dp);
```

Add `Source/DriveStage.h` to `target_sources` in `CMakeLists.txt`.

- [ ] **Step 5: Run and commit.** `plugin\build.bat`; all `ok` (including the baselines). If "drive on stays within a level band" fails high, the makeup is wrong: it must equal the web's `driveMakeupDb`. Commit: `git add -A plugin; git commit -m "Plugin: parallel drive stage (soft, tube, wavefold) with 4x oversampling"`.

---

### Task 4: Delay stage with Tone and Stereo

**Files:** Create `plugin/Source/DelayStage.h`; modify `PluginProcessor.h/.cpp`, `CMakeLists.txt`, `smoke.cpp`.

Web reference: `buildDelay` / `applyDelay` (non-fat, non-sync): ping-pong pair or one mono line; each repeat passes a lowpass (Q 1, cutoff `dToneHz`) then the feedback gain; the ping-pong outputs are panned `-wid` / `+wid`; mix is an equal-power crossfade `cos`/`sin`. The plugin has no delay today, so this task adds it whole. Fat and tempo sync are not ported.

- [ ] **Step 1: Failing checks**

```cpp
    {   // delay
        auto dry = make(), wetp = make();
        for (auto* p : { dry.get(), wetp.get() }) { setParam (*p, "envmod", 0.0f); setParam (*p, "cutoff", 3000.0f); }
        setParam (*wetp, "dmix", 0.6f); setParam (*wetp, "dtime", 0.4f);   // ~ 90 ms
        auto a = render (*dry, 1.0, { { 0, true, 45, 90 }, { (int) (0.1 * sr), false, 45, 0 } }), b = render (*wetp, 1.0, { { 0, true, 45, 90 }, { (int) (0.1 * sr), false, 45, 0 } });
        check (rms (a, (int) (0.2 * sr), (int) (0.5 * sr)) < 0.001 && rms (b, (int) (0.2 * sr), (int) (0.5 * sr)) > 0.003, "the delay leaves echoes after the note", rms (b, (int) (0.2 * sr), (int) (0.5 * sr)));
        check (finite (b), "delay output is finite");

        auto open = make(), dark = make();
        for (auto* p : { open.get(), dark.get() }) { setParam (*p, "envmod", 0.0f); setParam (*p, "cutoff", 6000.0f); setParam (*p, "dmix", 1.0f); setParam (*p, "dtime", 0.3f); setParam (*p, "dfb", 0.8f); }
        setParam (*dark, "dtone", 0.0f);
        auto c = render (*open, 1.6, { { 0, true, 45, 90 }, { (int) (0.1 * sr), false, 45, 0 } }), d = render (*dark, 1.6, { { 0, true, 45, 90 }, { (int) (0.1 * sr), false, 45, 0 } });
        const int s0 = (int) (0.6 * sr), s1 = (int) (1.5 * sr);
        check (brightness (d, s0, s1) < brightness (c, s0, s1) * 0.7, "delay Tone darkens the repeats", brightness (d, s0, s1) / brightness (c, s0, s1));
    }
```

(Tone 0 = 400 Hz lowpass in the loop; the first echo is unfiltered by design, so the window starts after it.)

Add a stereo check that reads both channels: change `render` in the test to also keep the right channel — add a second function instead, to leave the rest alone:

```cpp
// Same as render(), but returns the left and right channels.
std::pair<std::vector<float>, std::vector<float>> renderStereo (AcidBassProcessor& p, double seconds, const std::vector<Note>& notes)
{
    std::vector<float> L, R;
    const int total = (int) (seconds * sr);
    for (int start = 0; start < total; start += block)
    {
        juce::AudioBuffer<float> buf (2, block);
        juce::MidiBuffer midi;
        for (const auto& n : notes)
            if (n.at >= start && n.at < start + block)
                midi.addEvent (n.on ? juce::MidiMessage::noteOn (1, n.note, (juce::uint8) n.vel) : juce::MidiMessage::noteOff (1, n.note), n.at - start);
        p.processBlock (buf, midi);
        L.insert (L.end(), buf.getReadPointer (0), buf.getReadPointer (0) + block);
        R.insert (R.end(), buf.getReadPointer (1), buf.getReadPointer (1) + block);
    }
    return { L, R };
}
double corr (const std::vector<float>& a, const std::vector<float>& b, int x, int y)
{
    double ab = 0, aa = 0, bb = 0;
    for (int i = x; i < y; ++i) { ab += (double) a[(size_t) i] * b[(size_t) i]; aa += (double) a[(size_t) i] * a[(size_t) i]; bb += (double) b[(size_t) i] * b[(size_t) i]; }
    return ab / std::sqrt (aa * bb + 1e-20);
}
```

(place both in the anonymous namespace after `finite`), and in the delay block:

```cpp
        auto wide = make(), narrow = make();
        for (auto* p : { wide.get(), narrow.get() }) { setParam (*p, "envmod", 0.0f); setParam (*p, "cutoff", 3000.0f); setParam (*p, "dmix", 1.0f); setParam (*p, "dtime", 0.3f); setParam (*p, "dfb", 0.7f); }
        setParam (*narrow, "dwid", 0.0f);
        auto [wl, wr] = renderStereo (*wide, 1.5, { { 0, true, 45, 90 }, { (int) (0.1 * sr), false, 45, 0 } });
        auto [nl, nr] = renderStereo (*narrow, 1.5, { { 0, true, 45, 90 }, { (int) (0.1 * sr), false, 45, 0 } });
        check (corr (wl, wr, (int) (0.1 * sr), (int) (1.4 * sr)) < 0.5, "full stereo ping-pong decorrelates the channels", corr (wl, wr, (int) (0.1 * sr), (int) (1.4 * sr)));
        check (corr (nl, nr, (int) (0.1 * sr), (int) (1.4 * sr)) > 0.95, "stereo 0 collapses the echoes to the centre", corr (nl, nr, (int) (0.1 * sr), (int) (1.4 * sr)));
```

Run: fails (no `dmix`).

- [ ] **Step 2: Parameters**

```cpp
    knob ("dtime", "Delay Time", 0.5f); knob ("dfb", "Delay Feedback", 0.45f); knob ("dmix", "Delay Mix", 0.0f);
    knob ("dtone", "Delay Tone", 1.0f); knob ("dwid", "Delay Stereo", 1.0f);
    l.add (std::make_unique<juce::AudioParameterBool> (juce::ParameterID { "dpp", 1 }, "Delay Ping-Pong", true));
```

- [ ] **Step 3: `plugin/Source/DelayStage.h`**

```cpp
// DelayStage.h — mono in, stereo out: dry + a wet bus fed by a ping-pong pair or one mono line; every repeat goes through a
// lowpass (Tone) and the feedback gain. C++ twin of buildDelay/applyDelay in index.html (without Fat and tempo Sync).
// Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see plugin/LICENSE)
#pragma once
#include <juce_dsp/juce_dsp.h>
#include <algorithm>
#include <cmath>
#include "Maps.h"

struct DelayParams { float timeK = 0.5f, fbK = 0.45f, mix = 0.0f, toneK = 1.0f, wid = 1.0f; bool pingPong = true; };

class DelayStage
{
public:
    void prepare (double sr)
    {
        sampleRate = sr;
        const juce::dsp::ProcessSpec spec { sr, 512u, 1u };
        for (auto* d : { &dL, &dR, &dM }) { d->prepare (spec); d->setMaximumDelayInSamples ((int) std::ceil (1.1 * sr)); }
        for (auto* f : { &lpL, &lpR, &lpM }) { f->prepare (spec); f->setType (juce::dsp::StateVariableTPTFilterType::lowpass); f->setResonance (1.0f); }
        time.reset (sr, 0.03); time.setCurrentAndTargetValue ((float) (acidmaps::delaySec (0.5) * sr));
        reset();
    }
    void reset() { for (auto* d : { &dL, &dR, &dM }) d->reset(); for (auto* f : { &lpL, &lpR, &lpM }) f->reset(); }

    // in: mono samples; outL/outR receive the stereo result.
    void process (const float* in, float* outL, float* outR, int n, const DelayParams& p)
    {
        const float fb = (float) acidmaps::delayFb (p.fbK);
        const float tone = std::min ((float) acidmaps::dToneHz (p.toneK), 0.45f * (float) sampleRate);
        for (auto* f : { &lpL, &lpR, &lpM }) f->setCutoffFrequency (tone);
        time.setTargetValue ((float) (acidmaps::delaySec (p.timeK) * sampleRate));
        const float dryG = std::cos (p.mix * 1.5707963f), wetG = std::sin (p.mix * 1.5707963f);
        // StereoPanner law: pan -wid / +wid, equal power
        const float xl = (1.0f - p.wid) * 0.5f * 1.5707963f, xr = (1.0f + p.wid) * 0.5f * 1.5707963f;
        const float lL = std::cos (xl), lR = std::sin (xl), rL = std::cos (xr), rR = std::sin (xr);
        for (int i = 0; i < n; ++i)
        {
            const float x = in[i], d = time.getNextValue();
            const float yL = dL.popSample (0, d), yR = dR.popSample (0, d), yM = dM.popSample (0, d);   // updateReadPointer true: one tap per line, the read head advances with the write head
            dL.pushSample (0, (p.pingPong ? x : 0.0f) + lpL.processSample (0, yR) * fb);
            dR.pushSample (0, lpR.processSample (0, yL) * fb);
            dM.pushSample (0, (p.pingPong ? 0.0f : x) + lpM.processSample (0, yM) * fb);
            const float wl = yL * lL + yR * rL + yM, wr = yL * lR + yR * rR + yM;
            outL[i] = x * dryG + wl * wetG;
            outR[i] = x * dryG + wr * wetG;
        }
    }

private:
    double sampleRate = 44100.0;
    juce::dsp::DelayLine<float, juce::dsp::DelayLineInterpolationTypes::Linear> dL { 48000 * 2 }, dR { 48000 * 2 }, dM { 48000 * 2 };
    juce::dsp::StateVariableTPTFilter<float> lpL, lpR, lpM;
    juce::SmoothedValue<float> time { 1.0f };
};
```

In the JUCE `DelayLine`, `pushSample` moves only the write pointer and `popSample (ch, delay)` moves the read pointer only when `updateReadPointer` is true (its default). Use the plain `popSample (ch, delay)` for a single-tap delay line, as above. Passing `false` (multi-tap) leaves the read head fixed while the write head moves, so the echoes drift and vanish. This was measured: with `false` the wet RMS was 4e-37 (no echoes); with the default it is audible. Pop first, then push, in the same sample.

- [ ] **Step 4: Wire it in.** `PluginProcessor.h`: `#include "DelayStage.h"`, members `DelayStage delay; std::vector<float> dlyL, dlyR;`. In `prepareToPlay`: `delay.prepare (sampleRate);`. In `processBlock`, after the volume/tanh loop, replace the final channel copy with:

```cpp
    if ((int) dlyL.size() < n) { dlyL.resize ((size_t) n); dlyR.resize ((size_t) n); }   // ponytail: allocates only if the host sends a bigger block than before
    DelayParams dly;
    dly.timeK = apvts.getRawParameterValue ("dtime")->load(); dly.fbK = apvts.getRawParameterValue ("dfb")->load(); dly.mix = apvts.getRawParameterValue ("dmix")->load();
    dly.toneK = apvts.getRawParameterValue ("dtone")->load(); dly.wid = apvts.getRawParameterValue ("dwid")->load(); dly.pingPong = apvts.getRawParameterValue ("dpp")->load() > 0.5f;
    delay.process (out, dlyL.data(), dlyR.data(), n, dly);
    buffer.copyFrom (0, 0, dlyL.data(), n);
    if (buffer.getNumChannels() > 1) buffer.copyFrom (1, 0, dlyR.data(), n);
```

Note: `out` is `buffer.getWritePointer (0)`, which `delay.process` reads from while `buffer.copyFrom` writes after, so there is no overlap. `getTailLengthSeconds()` should now return `8.0` (reverb comes next); change it in `PluginProcessor.h`. Add `Source/DelayStage.h` to `target_sources`.

- [ ] **Step 5: Run and commit.** `plugin\build.bat`; all `ok` including baselines (mix 0 -> `dryG = 1`, `wetG = 0`: untouched sound). Commit: `git add -A plugin; git commit -m "Plugin: stereo ping-pong / mono delay with Tone and Stereo width"`.

---

### Task 5: Reverb stage

**Files:** Create `plugin/Source/ReverbStage.h`; modify `PluginProcessor.h/.cpp`, `CMakeLists.txt`, `smoke.cpp`.

Web reference: `buildReverb` / `applyReverb` / `loadIR`: dry + wet bus (pre-delay -> convolver (generated stereo IR, seed 1) -> low cut -> high cut -> width matrix); dry = `on ? rvdry : 1`, wet = `on ? rvwet : 0`. The IR rebuilds when Size, Decay or Hi damp move (key = those three knob values rounded to 1/50, rebuilt at most 4 times a second).

- [ ] **Step 1: Failing checks**

```cpp
    {   // reverb
        auto warm = [] (AcidBassProcessor& p) {   // run blocks until the (background-loaded) impulse response is installed
            juce::AudioBuffer<float> b (2, block); juce::MidiBuffer m;
            for (int i = 0; i < 200 && ! p.reverbReady(); ++i) { b.clear(); p.processBlock (b, m); juce::Thread::sleep (10); }
        };
        auto setup = [&] (bool on, float wet) {
            auto p = make();
            setParam (*p, "envmod", 0.0f); setParam (*p, "cutoff", 3000.0f);
            setParam (*p, "rvon", on ? 1.0f : 0.0f); setParam (*p, "rvwet", wet);
            p->refreshReverbIR(); warm (*p);
            return p;
        };
        const std::vector<Note> one = { { (int) (0.05 * sr), true, 45, 90 }, { (int) (0.15 * sr), false, 45, 0 } };
        const int t0 = (int) (0.35 * sr), t1 = (int) (0.65 * sr);
        auto dry = setup (false, 1.0f), off = setup (true, 0.0f), wet = setup (true, 1.0f);
        auto a = render (*dry, 1.0, one), b = render (*off, 1.0, one), c = render (*wet, 1.0, one);
        check (rms (a, t0, t1) < 0.001, "no tail without the reverb", rms (a, t0, t1));
        check (rms (b, t0, t1) < 0.001, "no tail with wet at 0", rms (b, t0, t1));
        check (rms (c, t0, t1) > 0.003 && finite (c), "a tail with wet raised", rms (c, t0, t1));

        auto longP = setup (true, 1.0f), shortP = setup (true, 1.0f);
        setParam (*longP, "rvdec", 0.9f); setParam (*shortP, "rvdec", 0.1f);
        longP->refreshReverbIR(); shortP->refreshReverbIR(); warm (*longP); warm (*shortP);
        auto d = render (*longP, 3.0, one), e = render (*shortP, 3.0, one);
        check (rms (d, (int) (2.0 * sr), (int) (2.8 * sr)) > 5.0 * rms (e, (int) (2.0 * sr), (int) (2.8 * sr)) + 1e-9, "a longer decay rings longer", rms (d, (int) (2.0 * sr), (int) (2.8 * sr)));

        auto wideP = setup (true, 1.0f), monoP = setup (true, 1.0f);
        setParam (*monoP, "rvwid", 0.0f);
        auto [wl, wr] = renderStereo (*wideP, 1.0, one);
        auto [ml, mr] = renderStereo (*monoP, 1.0, one);
        check (corr (ml, mr, t0, t1) > 0.99, "width 0 makes the tail mono", corr (ml, mr, t0, t1));
        check (corr (wl, wr, t0, t1) < 0.5, "full width keeps the tail stereo", corr (wl, wr, t0, t1));
    }
```

(`renderStereo` and `corr` come from Task 4.) Run: fails (no `rvon`, `reverbReady`).

- [ ] **Step 2: Parameters**

```cpp
    l.add (std::make_unique<juce::AudioParameterBool> (juce::ParameterID { "rvon", 1 }, "Reverb On", false));
    knob ("rvpre", "Reverb Pre-delay", 0.0f); knob ("rvsize", "Reverb Size", 0.5f); knob ("rvdec", "Reverb Decay", 0.5f); knob ("rvdamp", "Reverb Hi Damp", 0.5f);
    knob ("rvlow", "Reverb Low Cut", 0.0f); knob ("rvhigh", "Reverb Hi Cut", 1.0f); knob ("rvwid", "Reverb Width", 1.0f); knob ("rvdry", "Reverb Dry", 1.0f); knob ("rvwet", "Reverb Wet", 0.0f);
```

- [ ] **Step 3: `plugin/Source/ReverbStage.h`**

```cpp
// ReverbStage.h — stereo in/out: dry + wet (pre-delay -> convolution with the generated IR -> low cut -> high cut -> width).
// C++ twin of buildReverb/applyReverb in index.html; the IR is Maps.h reverbIR (same recipe and seed as the web app).
// loadIR() may be called while audio runs: juce::dsp::Convolution loads on its own thread and crossfades in.
// Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see plugin/LICENSE)
#pragma once
#include <juce_dsp/juce_dsp.h>
#include <algorithm>
#include <vector>
#include "Maps.h"

struct ReverbParams { bool on = false; float preK = 0, lowK = 0, highK = 1, wid = 1, dry = 1, wet = 0; };

class ReverbStage
{
public:
    void prepare (double sr, int maxBlock)
    {
        sampleRate = sr;
        const juce::dsp::ProcessSpec spec { sr, (juce::uint32) maxBlock, 2u };
        conv.prepare (spec);
        pre.prepare (spec); pre.setMaximumDelayInSamples ((int) std::ceil (0.25 * sr));
        for (auto* f : { &loL, &loR }) { f->prepare ({ sr, (juce::uint32) maxBlock, 1u }); f->setType (juce::dsp::StateVariableTPTFilterType::highpass); f->setResonance (0.7071f); }
        for (auto* f : { &hiL, &hiR }) { f->prepare ({ sr, (juce::uint32) maxBlock, 1u }); f->setType (juce::dsp::StateVariableTPTFilterType::lowpass); f->setResonance (0.7071f); }
        wetL.assign ((size_t) maxBlock, 0.0f); wetR.assign ((size_t) maxBlock, 0.0f);
        reset();
    }
    void reset() { conv.reset(); pre.reset(); for (auto* f : { &loL, &loR, &hiL, &hiR }) f->reset(); }

    void loadIR (float size, float decay, float damp)
    {
        auto ir = acidmaps::reverbIR (sampleRate, 1, size, decay, damp);
        juce::AudioBuffer<float> buf (2, (int) ir.L.size());
        buf.copyFrom (0, 0, ir.L.data(), (int) ir.L.size()); buf.copyFrom (1, 0, ir.R.data(), (int) ir.R.size());
        conv.loadImpulseResponse (std::move (buf), sampleRate, juce::dsp::Convolution::Stereo::yes, juce::dsp::Convolution::Trim::no, juce::dsp::Convolution::Normalise::yes);
    }
    bool ready() const { return conv.getCurrentIRSize() > 0; }

    void process (float* L, float* R, int n, const ReverbParams& p)
    {
        if (! p.on) return;   // off = untouched, like the web graph (dry 1, wet 0)
        if ((int) wetL.size() < n) { wetL.resize ((size_t) n); wetR.resize ((size_t) n); }   // ponytail: allocates only for a bigger block than before
        const float maxHz = 0.45f * (float) sampleRate;
        const float lo = std::min ((float) acidmaps::rvLowHz (p.lowK), maxHz), hi = std::min ((float) acidmaps::rvHighHz (p.highK), maxHz);
        for (auto* f : { &loL, &loR }) f->setCutoffFrequency (lo);
        for (auto* f : { &hiL, &hiR }) f->setCutoffFrequency (hi);
        const float preS = (float) (acidmaps::rvPreSec (p.preK) * sampleRate);
        for (int i = 0; i < n; ++i)
        {
            pre.pushSample (0, L[i]); pre.pushSample (1, R[i]);
            wetL[(size_t) i] = pre.popSample (0, preS); wetR[(size_t) i] = pre.popSample (1, preS);
        }
        if (ready())
        {
            float* ch[2] = { wetL.data(), wetR.data() };
            juce::dsp::AudioBlock<float> blk (ch, 2, (size_t) n);
            conv.process (juce::dsp::ProcessContextReplacing<float> (blk));
        }
        else { std::fill (wetL.begin(), wetL.begin() + n, 0.0f); std::fill (wetR.begin(), wetR.begin() + n, 0.0f); }
        const float same = (1.0f + p.wid) * 0.5f, cross = (1.0f - p.wid) * 0.5f;
        for (int i = 0; i < n; ++i)
        {
            const float l = hiL.processSample (0, loL.processSample (0, wetL[(size_t) i])), r = hiR.processSample (0, loR.processSample (0, wetR[(size_t) i]));
            const float ml = l * same + r * cross, mr = r * same + l * cross;
            L[i] = L[i] * p.dry + ml * p.wet;
            R[i] = R[i] * p.dry + mr * p.wet;
        }
    }

private:
    double sampleRate = 44100.0;
    juce::dsp::Convolution conv;
    juce::dsp::DelayLine<float, juce::dsp::DelayLineInterpolationTypes::Linear> pre { 48000 };
    juce::dsp::StateVariableTPTFilter<float> loL, loR, hiL, hiR;
    std::vector<float> wetL, wetR;
};
```

Note: `pre.popSample` uses the default `updateReadPointer = true`, same as `DelayStage` (see the Task 4 note). Do not pass `false` here: it leaves the pre-delay read head fixed and the pre-delay drifts.

- [ ] **Step 4: Processor.** `PluginProcessor.h`: `#include "ReverbStage.h"`, inherit `private juce::Timer` (`class AcidBassProcessor final : public juce::AudioProcessor, private juce::Timer`), members `ReverbStage reverb; int irKey = -1;`, public methods `bool reverbReady() const { return reverb.ready(); }` and `void refreshReverbIR();`, private `void timerCallback() override { refreshReverbIR(); }`. In `.cpp`:

```cpp
void AcidBassProcessor::refreshReverbIR()
{
    auto v = [this] (const char* id) { return apvts.getRawParameterValue (id)->load(); };
    const int key = (int) std::lround (v ("rvsize") * 50) * 10000 + (int) std::lround (v ("rvdec") * 50) * 100 + (int) std::lround (v ("rvdamp") * 50);   // the knobs, rounded to 1/50, as in the web page
    if (key == irKey || getSampleRate() <= 0.0) return;
    irKey = key;
    reverb.loadIR (v ("rvsize"), v ("rvdec"), v ("rvdamp"));
}
```

In the constructor body add `startTimerHz (4);` (so the IR rebuilds at most 4 times a second, like the web page); in the destructor-less class that means adding `~AcidBassProcessor() override { stopTimer(); }` to the header. In `prepareToPlay`: `reverb.prepare (sampleRate, samplesPerBlock); irKey = -1; refreshReverbIR();`. In `processBlock`, after the delay copy:

```cpp
    ReverbParams rp;
    rp.on = apvts.getRawParameterValue ("rvon")->load() > 0.5f;
    rp.preK = apvts.getRawParameterValue ("rvpre")->load(); rp.lowK = apvts.getRawParameterValue ("rvlow")->load(); rp.highK = apvts.getRawParameterValue ("rvhigh")->load();
    rp.wid = apvts.getRawParameterValue ("rvwid")->load(); rp.dry = apvts.getRawParameterValue ("rvdry")->load(); rp.wet = apvts.getRawParameterValue ("rvwet")->load();
    if (buffer.getNumChannels() > 1) reverb.process (buffer.getWritePointer (0), buffer.getWritePointer (1), n, rp);
```

`prepareToPlay` gets `samplesPerBlock` as its second argument: change the signature line to name it (`int samplesPerBlock`). Add `Source/ReverbStage.h` to `target_sources`.

- [ ] **Step 5: Run and commit.** `plugin\build.bat`; all `ok`. A check that fails because the IR did not arrive in time (tail 0 with wet 1) is a test-harness problem, not a pass: increase the `warm` loop count, never lower a threshold. Commit: `git add -A plugin; git commit -m "Plugin: reverb with the generated stereo IR, pre-delay, cuts, width, dry and wet"`.

---

### Task 6: State, README, build, install, verify in FL

**Files:** Modify `plugin/README.md`, `plugin/Tests/smoke.cpp`; docs memory.

- [ ] **Step 1: State round-trip covers the new knobs.** Add to the existing state test block in `smoke.cpp`:

```cpp
        setParam (*p, "drdrive", 0.8f); setParam (*p, "rvwet", 0.4f); setParam (*p, "dtone", 0.2f); setParam (*p, "dron", 1.0f);
```
before `getStateInformation`, and after restoring into `q` check `drdrive` is 0.8 and `dron` is 1 (`check (std::abs (q->apvts.getRawParameterValue ("drdrive")->load() - 0.8f) < 1e-3f, "saved state restores the drive knob")`, and the same for `dron`).

- [ ] **Step 2: README.** In `plugin/README.md` add a "What it has" list: the original eight controls; Tweaks (HP, Key Follow, Min Decay, Pulse Width, LFO Rate, LFO to PW); Drive (on, type, drive, HP, tone, volume, mix); Delay (time, feedback, mix, tone, stereo, ping-pong); Reverb (on, pre-delay, size, decay, hi damp, low cut, hi cut, width, dry, wet). State plainly: all knobs are 0..1 and automatable, named like the web app; the window is still the host's generic list; Delay Fat and tempo Sync, presets, and the full filter/amp envelopes are not in the plugin yet.

- [ ] **Step 3: Final build and tests.** `plugin\build.bat` — expect `100% tests passed` and every smoke line `ok`. Run `bun test` in the repo root too (59+ tests; the web side must be untouched).

- [ ] **Step 4: Commit** `git add -A; git commit -m "Plugin: state test for the new knobs; README lists what the plugin has"`.

- [ ] **Step 5: Install for the user to test in FL (the controller does this, not you).** Report the VST3 path `plugin\build\MyLilAcidBassline_artefacts\Release\VST3\My lil acid bassline.vst3` and stop.

- [ ] **Step 6: Merge decision is the controller's.** Do not push or merge.

---

## Self-review notes

- Spec coverage: Tweaks (Task 2), Drive with golden values (Tasks 1, 3), Reverb with the same recipe (Tasks 1, 5), Delay tone and stereo (Task 4, with the delay itself since the plugin had none), parameter names match the web knobs, state saved by the existing APVTS state, smoke checks per feature.
- Known risks, each with its stated fallback in the task text: JUCE `DelayLine` pop/push order; the async impulse-response load in the headless test (the `warm` helper); oversampler latency not compensated (documented).
- Type names used across tasks: `acidmaps::*` (Task 1), `DriveParams`/`DriveStage` (3), `DelayParams`/`DelayStage` (4), `ReverbParams`/`ReverbStage` with `loadIR`/`ready`/`process` (5), `renderStereo` and `corr` defined in Task 4 and reused in Task 5, `knob` lambda defined in Task 2 and reused in Tasks 3 to 5.
