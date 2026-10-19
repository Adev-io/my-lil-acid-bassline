// Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see plugin/LICENSE)
#include "PluginProcessor.h"
#if JUCE_WEB_BROWSER
#include "Editor.h"
#endif

AcidBassProcessor::AcidBassProcessor()
    : AudioProcessor (BusesProperties().withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      apvts (*this, nullptr, "STATE", createLayout())
{
    apvts.state.setProperty ("pattern", acidseq::toJson (pattern), nullptr);   // a fresh state carries the (empty) pattern
    startTimerHz (4);   // the IR rebuilds at most 4 times a second, like the web page
}

void AcidBassProcessor::refreshReverbIR()
{
    auto v = [this] (const char* id) { return apvts.getRawParameterValue (id)->load(); };
    const int key = (int) std::lround (v ("rvsize") * 50) * 10000 + (int) std::lround (v ("rvdec") * 50) * 100 + (int) std::lround (v ("rvdamp") * 50);   // the knobs, rounded to 1/50, as in the web page
    if (key == irKey || getSampleRate() <= 0.0) return;
    irKey = key;
    reverb.loadIR (v ("rvsize"), v ("rvdec"), v ("rvdamp"));
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
    knob ("fatk", "Filter Attack", 0.0f); knob ("fsus", "Filter Sustain", 0.0f); knob ("frel", "Filter Release", 0.68f); knob ("aatk", "Amp Attack", 0.0f);
    knob ("adec", "Amp Decay", 0.5f); knob ("asus", "Amp Sustain", 1.0f); knob ("arel", "Amp Release", 0.03f);
    l.add (std::make_unique<juce::AudioParameterBool> (juce::ParameterID { "dron", 1 }, "Drive On", false));
    l.add (std::make_unique<juce::AudioParameterChoice> (juce::ParameterID { "drtype", 1 }, "Drive Type", juce::StringArray { "Soft", "Tube", "Wavefold" }, 0));
    knob ("drdrive", "Drive", 0.0f); knob ("drhp", "Drive HP", 0.0f); knob ("drtone", "Drive Tone", 1.0f); knob ("drvol", "Drive Volume", 0.5f); knob ("drmix", "Drive Mix", 1.0f);
    knob ("dtime", "Delay Time", 0.5f); knob ("dfb", "Delay Feedback", 0.45f); knob ("dmix", "Delay Mix", 0.0f);
    knob ("dtone", "Delay Tone", 1.0f); knob ("dwid", "Delay Stereo", 1.0f);
    l.add (std::make_unique<juce::AudioParameterBool> (juce::ParameterID { "dpp", 1 }, "Delay Ping-Pong", true));
    l.add (std::make_unique<juce::AudioParameterBool> (juce::ParameterID { "rvon", 1 }, "Reverb On", false));
    knob ("rvpre", "Reverb Pre-delay", 0.0f); knob ("rvsize", "Reverb Size", 0.5f); knob ("rvdec", "Reverb Decay", 0.5f); knob ("rvdamp", "Reverb Hi Damp", 0.5f);
    knob ("rvlow", "Reverb Low Cut", 0.0f); knob ("rvhigh", "Reverb Hi Cut", 1.0f); knob ("rvwid", "Reverb Width", 1.0f); knob ("rvdry", "Reverb Dry", 1.0f); knob ("rvwet", "Reverb Wet", 0.0f);
    l.add (std::make_unique<juce::AudioParameterBool> (juce::ParameterID { "seqon", 1 }, "Sequencer On", false));
    knob ("swing", "Swing", 0.0f); knob ("gate", "Gate Length", 0.5f);
    return l;
}

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

AcidParams AcidBassProcessor::currentParams() const
{
    auto v = [this] (const char* id) { return apvts.getRawParameterValue (id)->load(); };
    AcidParams p;
    p.tuneCents = v ("tuning"); p.cutoffHz = v ("cutoff"); p.res = v ("res"); p.envmod = v ("envmod");
    p.decaySec = v ("decay"); p.accent = v ("accent"); p.volume = v ("volume"); p.square = v ("wave") > 0.5f;
    p.hpHz = (float) acidmaps::hpHz (v ("hp")); p.keyFollow = v ("kfol"); p.minDecSec = (float) acidmaps::minDecSec (v ("mind"));
    p.pw = (float) acidmaps::pwFrac (v ("pw")); p.lfoHz = (float) acidmaps::lfoHz (v ("lfor")); p.lfoPw = v ("lfopw");
    p.fAtkSec = (float) acidmaps::atkSec (v ("fatk")); p.fSus = v ("fsus"); p.fRelSec = (float) acidmaps::relSec (v ("frel"));
    p.aAtkSec = (float) acidmaps::atkSec (v ("aatk")); p.aDecSec = (float) acidmaps::envDecSec (v ("adec")); p.aSus = v ("asus"); p.aRelSec = (float) acidmaps::relSec (v ("arel"));
    return p;
}

void AcidBassProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    voice.prepare (sampleRate);
    drive.prepare (sampleRate);
    delay.prepare (sampleRate);
    reverb.prepare (sampleRate, samplesPerBlock); irKey = -1; refreshReverbIR();
    seqOut.reserve (256); merged.ensureSize (4096);
}

void AcidBassProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    const int n = buffer.getNumSamples();
    buffer.clear();
    const auto p = currentParams();
    float* out = buffer.getWritePointer (0);

    bool playing = false; double bpm = 120.0, ppq = 0.0;
    if (auto* ph = getPlayHead())
        if (auto hp = ph->getPosition())
        {
            playing = hp->getIsPlaying() && hp->getPpqPosition().hasValue();
            bpm = hp->getBpm().orFallback (120.0); ppq = hp->getPpqPosition().orFallback (0.0);
        }
    { const juce::SpinLock::ScopedTryLockType l (patternLock); if (l.isLocked()) audioPattern = pattern; }
    acidseq::Settings ss;
    ss.on = apvts.getRawParameterValue ("seqon")->load() > 0.5f;
    ss.swing = apvts.getRawParameterValue ("swing")->load();
    ss.gateFrac = (float) acidmaps::gateFrac (apvts.getRawParameterValue ("gate")->load());
    seqEngine.process (audioPattern, ss, playing, ppq, bpm, n, getSampleRate(), seqOut);
    seqStepNow.store (seqEngine.currentStep());
    // ponytail: merged and seqOut allocate only on the first big block (prepareToPlay reserves room; they grow only if a host sends more events than that)
    merged.clear(); merged.addEvents (midi, 0, n, 0);
    for (const auto& e : seqOut)
        merged.addEvent (e.on ? juce::MidiMessage::noteOn (1, e.note, e.velocity) : juce::MidiMessage::noteOff (1, e.note), e.sample);

    int pos = 0;
    for (const auto meta : merged)
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
    if ((int) dlyL.size() < n) { dlyL.resize ((size_t) n); dlyR.resize ((size_t) n); }   // ponytail: allocates only if the host sends a bigger block than before
    DelayParams dly;
    dly.timeK = apvts.getRawParameterValue ("dtime")->load(); dly.fbK = apvts.getRawParameterValue ("dfb")->load(); dly.mix = apvts.getRawParameterValue ("dmix")->load();
    dly.toneK = apvts.getRawParameterValue ("dtone")->load(); dly.wid = apvts.getRawParameterValue ("dwid")->load(); dly.pingPong = apvts.getRawParameterValue ("dpp")->load() > 0.5f;
    delay.process (out, dlyL.data(), dlyR.data(), n, dly);
    buffer.copyFrom (0, 0, dlyL.data(), n);
    if (buffer.getNumChannels() > 1) buffer.copyFrom (1, 0, dlyR.data(), n);

    ReverbParams rp;
    rp.on = apvts.getRawParameterValue ("rvon")->load() > 0.5f;
    rp.preK = apvts.getRawParameterValue ("rvpre")->load(); rp.lowK = apvts.getRawParameterValue ("rvlow")->load(); rp.highK = apvts.getRawParameterValue ("rvhigh")->load();
    rp.wid = apvts.getRawParameterValue ("rvwid")->load(); rp.dry = apvts.getRawParameterValue ("rvdry")->load(); rp.wet = apvts.getRawParameterValue ("rvwet")->load();
    if (buffer.getNumChannels() > 1) reverb.process (buffer.getWritePointer (0), buffer.getWritePointer (1), n, rp);
}

juce::AudioProcessorEditor* AcidBassProcessor::createEditor()
{
#if JUCE_WEB_BROWSER
    return new AcidEditor (*this);
#else
    return new juce::GenericAudioProcessorEditor (*this);   // the headless test build has no web view
#endif
}

void AcidBassProcessor::getStateInformation (juce::MemoryBlock& dest)
{
    if (auto xml = apvts.copyState().createXml()) copyXmlToBinary (*xml, dest);
}

void AcidBassProcessor::setStateInformation (const void* data, int size)
{
    if (auto xml = getXmlFromBinary (data, size))
        if (xml->hasTagName (apvts.state.getType())) {
            apvts.replaceState (juce::ValueTree::fromXml (*xml));
            setPatternJson (apvts.state.getProperty ("pattern", acidseq::toJson (acidseq::Pattern{})).toString());
        }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new AcidBassProcessor(); }
