// smoke.cpp — drives AcidBassProcessor with MIDI and checks the audio that comes out.
// Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see ../LICENSE)
#include "PluginProcessor.h"
#include <cstdio>
#include <vector>

namespace
{
constexpr double sr = 44100.0;
constexpr int block = 512;
int failures = 0;

void check (bool ok, const char* what, double got = 0.0)
{
    std::printf ("%s  %s  (%g)\n", ok ? "ok  " : "FAIL", what, got);
    if (! ok) ++failures;
}

void setParam (AcidBassProcessor& p, const char* id, float value)
{
    auto* prm = p.apvts.getParameter (id);
    prm->setValueNotifyingHost (prm->convertTo0to1 (value));
}

struct Note { int at; bool on; int note; int vel; };   // sample position within the render

// Renders `seconds` of audio, feeding the MIDI events at their sample positions.
std::vector<float> render (AcidBassProcessor& p, double seconds, const std::vector<Note>& notes)
{
    std::vector<float> out;
    const int total = (int) (seconds * sr);
    for (int start = 0; start < total; start += block)
    {
        juce::AudioBuffer<float> buf (2, block);
        juce::MidiBuffer midi;
        for (const auto& n : notes)
            if (n.at >= start && n.at < start + block)
                midi.addEvent (n.on ? juce::MidiMessage::noteOn (1, n.note, (juce::uint8) n.vel)
                                    : juce::MidiMessage::noteOff (1, n.note), n.at - start);
        p.processBlock (buf, midi);
        out.insert (out.end(), buf.getReadPointer (0), buf.getReadPointer (0) + block);
    }
    return out;
}

double rms (const std::vector<float>& v, int a, int b)
{
    double s = 0; for (int i = a; i < b; ++i) s += (double) v[(size_t) i] * v[(size_t) i];
    return std::sqrt (s / (b - a));
}
// First-difference energy over energy: a cheap brightness measure.
double brightness (const std::vector<float>& v, int a, int b)
{
    double e = 0, q = 0;
    for (int i = a + 1; i < b; ++i) { e += (double) v[(size_t) i] * v[(size_t) i]; q += std::pow ((double) v[(size_t) i] - v[(size_t) i - 1], 2.0); }
    return q / (e > 0 ? e : 1.0);
}
// Frequency from rising zero crossings.
double hz (const std::vector<float>& v, int a, int b)
{
    int c = 0; for (int i = a + 1; i < b; ++i) if (v[(size_t) i - 1] < 0 && v[(size_t) i] >= 0) ++c;
    return c / ((b - a) / sr);
}
bool finite (const std::vector<float>& v) { for (float x : v) if (! std::isfinite (x) || std::abs (x) > 4.0f) return false; return true; }

std::unique_ptr<AcidBassProcessor> make()
{
    auto p = std::make_unique<AcidBassProcessor>();
    p->setPlayConfigDetails (0, 2, sr, block);
    p->prepareToPlay (sr, block);
    return p;
}
}

int main()
{
    juce::ScopedJuceInitialiser_GUI init;

    {   // sound on, sound off
        auto p = make();
        setParam (*p, "envmod", 0.0f); setParam (*p, "cutoff", 4000.0f);
        auto a = render (*p, 0.8, { { 0, true, 57, 90 }, { (int) (0.4 * sr), false, 57, 0 } });
        check (finite (a), "output is finite and bounded");
        check (rms (a, 4000, 16000) > 0.03, "a held note makes sound", rms (a, 4000, 16000));
        check (rms (a, (int) (0.55 * sr), (int) (0.8 * sr)) < 0.002, "silent after release", rms (a, (int) (0.55 * sr), (int) (0.8 * sr)));
        const double f = hz (a, 4000, 16000);
        check (std::abs (f - 220.0) < 8.0, "A3 plays at 220 Hz", f);
    }
    {   // the cutoff knob changes the tone
        auto lo = make(), hi = make();
        for (auto* p : { lo.get(), hi.get() }) setParam (*p, "envmod", 0.0f);
        setParam (*lo, "cutoff", 120.0f); setParam (*hi, "cutoff", 6000.0f);
        auto a = render (*lo, 0.4, { { 0, true, 45, 90 } }), b = render (*hi, 0.4, { { 0, true, 45, 90 } });
        const double ba = brightness (a, 6000, 16000), bb = brightness (b, 6000, 16000);
        check (bb > ba * 3.0, "opening the cutoff brightens the note", bb / ba);
    }
    {   // the filter envelope sweeps: bright at the start, dark by the end
        auto p = make();
        setParam (*p, "cutoff", 150.0f); setParam (*p, "envmod", 1.0f); setParam (*p, "decay", 0.2f);
        auto a = render (*p, 0.8, { { 0, true, 45, 90 } });
        const double early = brightness (a, 200, 2400), late = brightness (a, (int) (0.6 * sr), (int) (0.75 * sr));
        check (early > late * 3.0, "the envelope closes the filter over the decay", early / late);
    }
    {   // accent: velocity 110+ hits harder
        auto soft = make(), loud = make();
        for (auto* p : { soft.get(), loud.get() }) { setParam (*p, "accent", 1.0f); setParam (*p, "envmod", 0.0f); setParam (*p, "cutoff", 3000.0f); }
        auto a = render (*soft, 0.3, { { 0, true, 45, 70 } }), b = render (*loud, 0.3, { { 0, true, 45, 120 } });
        check (rms (b, 3000, 10000) > rms (a, 3000, 10000) * 1.3, "an accented note is louder", rms (b, 3000, 10000) / rms (a, 3000, 10000));
    }
    {   // slide: a note struck while another is held glides, with no new attack
        auto p = make();
        setParam (*p, "envmod", 0.0f); setParam (*p, "cutoff", 4000.0f);
        auto a = render (*p, 0.8, { { 0, true, 45, 90 }, { (int) (0.3 * sr), true, 52, 90 } });
        const double before = hz (a, 4000, 12000), after = hz (a, (int) (0.6 * sr), (int) (0.78 * sr));
        check (std::abs (before - 110.0) < 6.0, "first note is A2 (110 Hz)", before);
        check (std::abs (after - 164.8) < 8.0, "the overlapping note glides to E3 (164.8 Hz)", after);
        const double dip = rms (a, (int) (0.30 * sr), (int) (0.32 * sr)) / rms (a, (int) (0.2 * sr), (int) (0.28 * sr));
        check (dip > 0.6, "no re-attack on a slide (level holds)", dip);
    }
    {   // state round-trips, and bad state is ignored
        auto p = make();
        setParam (*p, "res", 0.9f);
        juce::MemoryBlock mb; p->getStateInformation (mb);
        auto q = make();
        q->setStateInformation (mb.getData(), (int) mb.getSize());
        check (std::abs (q->apvts.getRawParameterValue ("res")->load() - 0.9f) < 1e-3f, "saved state restores a knob", q->apvts.getRawParameterValue ("res")->load());
        const char junk[] = "not xml";
        q->setStateInformation (junk, (int) sizeof (junk));
        check (std::abs (q->apvts.getRawParameterValue ("res")->load() - 0.9f) < 1e-3f, "junk state is ignored");
    }
    std::printf ("%d failure(s)\n", failures);
    return failures == 0 ? 0 : 1;
}
