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
