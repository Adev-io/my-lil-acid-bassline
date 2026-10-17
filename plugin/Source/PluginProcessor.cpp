// Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see plugin/LICENSE)
#include "PluginProcessor.h"

AcidBassProcessor::AcidBassProcessor()
    : AudioProcessor (BusesProperties().withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      apvts (*this, nullptr, "STATE", createLayout())
{
}

juce::AudioProcessorValueTreeState::ParameterLayout AcidBassProcessor::createLayout()
{
    using F = juce::AudioParameterFloat;
    using R = juce::NormalisableRange<float>;
    juce::AudioProcessorValueTreeState::ParameterLayout l;
    l.add (std::make_unique<F> (juce::ParameterID { "tuning", 1 }, "Tuning", R (-100.0f, 100.0f, 0.1f), 0.0f));
    l.add (std::make_unique<F> (juce::ParameterID { "cutoff", 1 }, "Cutoff", R (60.0f, 8000.0f, 0.0f, 0.35f), 460.0f));
    l.add (std::make_unique<F> (juce::ParameterID { "res", 1 }, "Resonance", R (0.0f, 1.0f), 0.5f));
    l.add (std::make_unique<F> (juce::ParameterID { "envmod", 1 }, "Env Mod", R (0.0f, 1.0f), 0.6f));
    l.add (std::make_unique<F> (juce::ParameterID { "decay", 1 }, "Decay", R (0.03f, 2.5f, 0.0f, 0.4f), 0.5f));
    l.add (std::make_unique<F> (juce::ParameterID { "accent", 1 }, "Accent", R (0.0f, 1.0f), 0.6f));
    l.add (std::make_unique<F> (juce::ParameterID { "volume", 1 }, "Volume", R (0.0f, 1.0f), 0.7f));
    l.add (std::make_unique<juce::AudioParameterChoice> (juce::ParameterID { "wave", 1 }, "Waveform", juce::StringArray { "Saw", "Square" }, 0));
    return l;
}

AcidParams AcidBassProcessor::currentParams() const
{
    auto v = [this] (const char* id) { return apvts.getRawParameterValue (id)->load(); };
    AcidParams p;
    p.tuneCents = v ("tuning"); p.cutoffHz = v ("cutoff"); p.res = v ("res"); p.envmod = v ("envmod");
    p.decaySec = v ("decay"); p.accent = v ("accent"); p.volume = v ("volume"); p.square = v ("wave") > 0.5f;
    return p;
}

void AcidBassProcessor::prepareToPlay (double sampleRate, int)
{
    voice.prepare (sampleRate);
}

void AcidBassProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    const int n = buffer.getNumSamples();
    buffer.clear();
    const auto p = currentParams();
    float* out = buffer.getWritePointer (0);

    int pos = 0;
    for (const auto meta : midi)
    {
        const int at = juce::jlimit (pos, n, meta.samplePosition);
        if (at > pos) voice.render (out + pos, at - pos, p);
        pos = at;
        const auto m = meta.getMessage();
        if (m.isNoteOn()) voice.noteOn (m.getNoteNumber(), m.getFloatVelocity(), p);
        else if (m.isNoteOff()) voice.noteOff (m.getNoteNumber(), p);
        else if (m.isAllNotesOff() || m.isAllSoundOff()) voice.allOff();
    }
    if (pos < n) voice.render (out + pos, n - pos, p);

    for (int ch = 1; ch < buffer.getNumChannels(); ++ch) buffer.copyFrom (ch, 0, out, n);
}

juce::AudioProcessorEditor* AcidBassProcessor::createEditor()
{
    return new juce::GenericAudioProcessorEditor (*this);   // phase 1: the host-style list of knobs; the real panel comes later
}

void AcidBassProcessor::getStateInformation (juce::MemoryBlock& dest)
{
    if (auto xml = apvts.copyState().createXml()) copyXmlToBinary (*xml, dest);
}

void AcidBassProcessor::setStateInformation (const void* data, int size)
{
    if (auto xml = getXmlFromBinary (data, size))
        if (xml->hasTagName (apvts.state.getType())) apvts.replaceState (juce::ValueTree::fromXml (*xml));
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new AcidBassProcessor(); }
