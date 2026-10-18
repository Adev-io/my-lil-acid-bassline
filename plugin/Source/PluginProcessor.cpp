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
    auto knob = [&l] (const char* id, const char* name, float def) { l.add (std::make_unique<F> (juce::ParameterID { id, 1 }, name, R (0.0f, 1.0f), def)); };
    knob ("hp", "HP", 0.0f); knob ("kfol", "Key Follow", 0.0f); knob ("mind", "Min Decay", 0.0f);
    knob ("pw", "Pulse Width", 0.5f); knob ("lfor", "LFO Rate", 0.6157f); knob ("lfopw", "LFO to PW", 0.0f);
    l.add (std::make_unique<juce::AudioParameterBool> (juce::ParameterID { "dron", 1 }, "Drive On", false));
    l.add (std::make_unique<juce::AudioParameterChoice> (juce::ParameterID { "drtype", 1 }, "Drive Type", juce::StringArray { "Soft", "Tube", "Wavefold" }, 0));
    knob ("drdrive", "Drive", 0.0f); knob ("drhp", "Drive HP", 0.0f); knob ("drtone", "Drive Tone", 1.0f); knob ("drvol", "Drive Volume", 0.5f); knob ("drmix", "Drive Mix", 1.0f);
    return l;
}

AcidParams AcidBassProcessor::currentParams() const
{
    auto v = [this] (const char* id) { return apvts.getRawParameterValue (id)->load(); };
    AcidParams p;
    p.tuneCents = v ("tuning"); p.cutoffHz = v ("cutoff"); p.res = v ("res"); p.envmod = v ("envmod");
    p.decaySec = v ("decay"); p.accent = v ("accent"); p.volume = v ("volume"); p.square = v ("wave") > 0.5f;
    p.hpHz = (float) acidmaps::hpHz (v ("hp")); p.keyFollow = v ("kfol"); p.minDecSec = (float) acidmaps::minDecSec (v ("mind"));
    p.pw = (float) acidmaps::pwFrac (v ("pw")); p.lfoHz = (float) acidmaps::lfoHz (v ("lfor")); p.lfoPw = v ("lfopw");
    return p;
}

void AcidBassProcessor::prepareToPlay (double sampleRate, int)
{
    voice.prepare (sampleRate);
    drive.prepare (sampleRate);
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

    DriveParams dp;
    dp.on = apvts.getRawParameterValue ("dron")->load() > 0.5f;
    dp.type = (acidmaps::DriveType) juce::jlimit (0, 2, (int) apvts.getRawParameterValue ("drtype")->load());
    dp.hpK = apvts.getRawParameterValue ("drhp")->load(); dp.driveK = apvts.getRawParameterValue ("drdrive")->load();
    dp.toneK = apvts.getRawParameterValue ("drtone")->load(); dp.volK = apvts.getRawParameterValue ("drvol")->load(); dp.mix = apvts.getRawParameterValue ("drmix")->load();
    drive.process (out, n, dp);

    for (int i = 0; i < n; ++i) out[i] = std::tanh (1.6f * out[i] * p.volume);   // master volume, then the soft clip standing in for the output stage (as on the web page)
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
