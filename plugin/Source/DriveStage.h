// DriveStage.h — the parallel drive: dry untouched; wet = HP -> pre-gain -> 4x oversampled shaper -> tone -> DC block -> volume.
// C++ twin of buildDrive/applyDrive in index.html. Mono. The oversampler's few samples of latency are not compensated (the web graph is the same).
// Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see plugin/LICENSE)
#pragma once
#include <juce_dsp/juce_dsp.h>
#include <algorithm>
#include <array>
#include <memory>
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
