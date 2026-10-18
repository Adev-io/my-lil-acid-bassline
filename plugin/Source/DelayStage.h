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
