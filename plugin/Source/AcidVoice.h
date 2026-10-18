// AcidVoice.h — the mono acid voice: PolyBLEP saw/square into two cascaded 12 dB lowpasses (24 dB/oct, resonance on the
// second), a decaying filter envelope, an accent, and a legato glide. It is the C++ twin of the web page's `play()` in
// index.html (the web app) and uses the same constants, so the two sound alike.
// Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see plugin/LICENSE)
#pragma once
#include <juce_dsp/juce_dsp.h>
#include "Maps.h"
#include <algorithm>
#include <cmath>
#include <vector>

struct AcidParams
{
    float cutoffHz = 460.0f;   // resting cutoff
    float res = 0.5f;          // 0..1
    float envmod = 0.6f;       // 0..1, depth of the filter envelope (up to 4.5 octaves)
    float decaySec = 0.5f;     // filter decay
    float accent = 0.6f;       // 0..1, how hard an accented note hits
    float volume = 0.7f;       // 0..1
    float tuneCents = 0.0f;    // +-100
    bool square = false;       // false = saw
    float hpHz = 20.0f;        // input high-pass (20 = off)
    float keyFollow = 0.0f;    // 0..1, how far the cutoff follows the note (C3 neutral)
    float minDecSec = 0.03f;   // floor for the filter decay
    float pw = 0.5f;           // pulse width fraction (square only)
    float lfoHz = 1.0f;        // LFO rate
    float lfoPw = 0.0f;        // 0..1, LFO depth on the pulse width
};

class AcidVoice
{
public:
    void prepare (double sr)
    {
        sampleRate = sr;
        const juce::dsp::ProcessSpec spec { sr, 512u, 1u };
        for (auto* f : { &f1, &f2, &hp }) { f->prepare (spec); f->setType (juce::dsp::StateVariableTPTFilterType::lowpass); }
        hp.setType (juce::dsp::StateVariableTPTFilterType::highpass); hp.setResonance (0.7071f);
        f1.setResonance (0.5f);
        glideCoef = 1.0f - std::exp (-1.0f / (0.02f * (float) sr));   // ~60 ms to settle
        atkCoef   = 1.0f - std::exp (-1.0f / (0.001f * (float) sr));
        relCoef   = 1.0f - std::exp (-1.0f / (0.002f * (float) sr));
        reset();
    }

    void reset()
    {
        held.clear(); gate = false; phase = 0.0; freq = targetFreq = 110.0; ampEnv = 0.0f; filtEnv = 0.0f; sweep = 0.0f;
        f1.reset(); f2.reset(); hp.reset(); lfoPhase = 0.0; keyMulNow = 1.0f;
    }

    bool active() const { return gate || ampEnv > 1.0e-4f; }

    // A note that arrives while another is held glides to the new pitch without restarting the envelope (the 303 slide).
    void noteOn (int note, float velocity01, const AcidParams& p)
    {
        const bool legato = ! held.empty();
        held.erase (std::remove (held.begin(), held.end(), note), held.end());
        held.push_back (note);
        targetFreq = freqOf (note, p.tuneCents);
        accented = velocity01 >= 110.0f / 127.0f;
        if (legato) return;
        keyMulNow = (float) acidmaps::keyMul (p.keyFollow, note);
        freq = targetFreq;
        sweep = accented ? std::min (1.0f, sweep + 0.35f) : sweep * 0.5f;
        filtEnv = 1.0f;
        gate = true;
    }

    void noteOff (int note, const AcidParams& p)
    {
        held.erase (std::remove (held.begin(), held.end(), note), held.end());
        if (held.empty()) gate = false;
        else targetFreq = freqOf (held.back(), p.tuneCents);   // back to the note still held, gliding
    }

    void allOff() { held.clear(); gate = false; }

    void render (float* out, int n, const AcidParams& p)
    {
        const float decSec = std::max (accented ? std::min (p.decaySec, 0.2f) : p.decaySec, p.minDecSec);
        const float decCoef = std::exp (-1.0f / (std::max (decSec, 0.005f) / 3.0f * (float) sampleRate));
        const float acc = accented ? p.accent : 0.0f;
        const float oct = p.envmod * 4.5f + acc * 1.6f + sweep * p.accent * 0.8f;
        const float level = 0.45f * (1.0f + acc * 0.9f) / (1.0f + p.res * 0.6f);   // resonance eats level, as on the hardware
        const float q = 0.7f + std::pow (p.res, 1.6f) * 24.0f;
        f2.setResonance (q);
        const float maxHz = 0.45f * (float) sampleRate;
        hp.setCutoffFrequency (std::min (p.hpHz, 0.45f * (float) sampleRate));
        const double lfoInc = p.lfoHz / sampleRate;

        for (int i = 0; i < n; ++i)
        {
            if ((i & 7) == 0)   // the filter coefficients move every 8 samples: plenty for a sweep, cheap enough to run live
            {
                const float hz = std::min (p.cutoffHz * keyMulNow * std::pow (2.0f, oct * filtEnv), maxHz);
                f1.setCutoffFrequency (hz); f2.setCutoffFrequency (hz);
            }
            freq += (targetFreq - freq) * (double) glideCoef;
            const double dt = freq / sampleRate;
            phase += dt; if (phase >= 1.0) phase -= 1.0;
            float s = sawBlep (phase, dt);
            if (p.square)
            {   // the web's pulse: the saw minus a copy of itself shifted by the width (zero-mean, narrow = skewed)
                lfoPhase += lfoInc; if (lfoPhase >= 1.0) lfoPhase -= 1.0;
                const double w = (double) p.pw + 0.4 * (double) p.lfoPw * std::sin (6.283185307179586 * lfoPhase);
                double shifted = phase - w; shifted -= std::floor (shifted);
                s -= sawBlep (shifted, dt);
            }
            s = f2.processSample (0, f1.processSample (0, hp.processSample (0, s)));
            ampEnv += ((gate ? level : 0.0f) - ampEnv) * (gate ? atkCoef : relCoef);
            filtEnv *= decCoef;
            out[i] = s * ampEnv;   // volume and the soft clip are applied by the processor, after the drive stage
        }
    }

private:
    static float polyBlep (double t, double dt)
    {
        if (t < dt)       { t /= dt;           return (float) (t + t - t * t - 1.0); }
        if (t > 1.0 - dt) { t = (t - 1.0) / dt; return (float) (t * t + t + t + 1.0); }
        return 0.0f;
    }
    static float sawBlep (double t, double dt) { return (float) (2.0 * t - 1.0) - polyBlep (t, dt); }
    static double freqOf (int note, float cents) { return 440.0 * std::pow (2.0, (note - 69 + cents / 100.0) / 12.0); }

    juce::dsp::StateVariableTPTFilter<float> f1, f2, hp;
    std::vector<int> held;
    double sampleRate = 44100.0, phase = 0.0, freq = 110.0, targetFreq = 110.0, lfoPhase = 0.0;
    float glideCoef = 0.0f, atkCoef = 0.0f, relCoef = 0.0f, ampEnv = 0.0f, filtEnv = 0.0f, sweep = 0.0f, keyMulNow = 1.0f;
    bool gate = false, accented = false;
};
