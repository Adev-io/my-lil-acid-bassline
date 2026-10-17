// PluginProcessor.h — Acid Bass 2 as a VST3 instrument. Phase 1: the voice, eight parameters, a generic editor.
// Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see plugin/LICENSE)
#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include "AcidVoice.h"

class AcidBassProcessor final : public juce::AudioProcessor
{
public:
    AcidBassProcessor();

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout& l) const override
    {
        return l.getMainOutputChannelSet() == juce::AudioChannelSet::stereo() && l.getMainInputChannelSet().isDisabled();
    }
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "Acid Bass 2"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 0.05; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock&) override;
    void setStateInformation (const void*, int) override;

    // IDs match the web page's knob names where there is one (cutoff, res, envmod, accent, volume, tuning).
    juce::AudioProcessorValueTreeState apvts;

private:
    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();
    AcidParams currentParams() const;

    AcidVoice voice;
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AcidBassProcessor)
};
