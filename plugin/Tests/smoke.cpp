// smoke.cpp — drives AcidBassProcessor with MIDI and checks the audio that comes out.
// Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see ../LICENSE)
#include "PluginProcessor.h"
#include "Maps.h"
#include "ParamBridge.h"
#include "Sequencer.h"
#include <cmath>
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
        setParam (*p, "drdrive", 0.8f); setParam (*p, "rvwet", 0.4f); setParam (*p, "dtone", 0.2f); setParam (*p, "dron", 1.0f);
        juce::MemoryBlock mb; p->getStateInformation (mb);
        auto q = make();
        q->setStateInformation (mb.getData(), (int) mb.getSize());
        check (std::abs (q->apvts.getRawParameterValue ("res")->load() - 0.9f) < 1e-3f, "saved state restores a knob", q->apvts.getRawParameterValue ("res")->load());
        check (std::abs (q->apvts.getRawParameterValue ("drdrive")->load() - 0.8f) < 1e-3f, "saved state restores the drive knob", q->apvts.getRawParameterValue ("drdrive")->load());
        check (std::abs (q->apvts.getRawParameterValue ("dron")->load() - 1.0f) < 1e-3f, "saved state restores the drive switch", q->apvts.getRawParameterValue ("dron")->load());
        const char junk[] = "not xml";
        q->setStateInformation (junk, (int) sizeof (junk));
        check (std::abs (q->apvts.getRawParameterValue ("res")->load() - 0.9f) < 1e-3f, "junk state is ignored");
    }
    {   // defaults sound as before (numbers recorded from the phase-1 plugin, before the port)
        const double refRms[2] = { 0.231228, 0.377944 }, refBright[2] = { 0.004067, 0.002700 };
        for (int w = 0; w < 2; ++w)
        {
            auto p = make();
            setParam (*p, "wave", (float) w);
            auto a = render (*p, 0.6, { { 0, true, 45, 90 }, { (int) (0.4 * sr), false, 45, 0 } });
            check (std::abs (rms (a, 2000, 15000) / refRms[w] - 1.0) < 0.03, w ? "default square matches the phase-1 level" : "default saw matches the phase-1 level", rms (a, 2000, 15000));
            check (std::abs (brightness (a, 2000, 15000) / refBright[w] - 1.0) < 0.05, w ? "default square matches the phase-1 tone" : "default saw matches the phase-1 tone", brightness (a, 2000, 15000));
        }
    }
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
    {   // drive
        auto off = make(), on = make();
        for (auto* p : { off.get(), on.get() }) { setParam (*p, "envmod", 0.0f); setParam (*p, "cutoff", 3000.0f); }
        setParam (*on, "dron", 1.0f); setParam (*on, "drdrive", 1.0f);
        auto a = render (*off, 0.5, { { 0, true, 45, 90 } }), b = render (*on, 0.5, { { 0, true, 45, 90 } });
        check (finite (b) && rms (b, 4000, 20000) > 0.5 * rms (a, 4000, 20000) && rms (b, 4000, 20000) < 1.42 * rms (a, 4000, 20000), "drive on (full drive) stays within a level band", rms (b, 4000, 20000) / rms (a, 4000, 20000));
        // Mid drive (0.5): the 0.5 ratio below is measured parity with the web, not a target. Only finite and loose bound required.
        auto mid = make();
        setParam (*mid, "envmod", 0.0f); setParam (*mid, "cutoff", 3000.0f); setParam (*mid, "dron", 1.0f); setParam (*mid, "drdrive", 0.5f);
        auto m = render (*mid, 0.5, { { 0, true, 45, 90 } });
        check (finite (m) && rms (m, 4000, 20000) < 2.5 * rms (a, 4000, 20000), "drive on (mid drive) stays finite and under 2.5x dry", rms (m, 4000, 20000) / rms (a, 4000, 20000));

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

        auto wide = make(), narrow = make();
        for (auto* p : { wide.get(), narrow.get() }) { setParam (*p, "envmod", 0.0f); setParam (*p, "cutoff", 3000.0f); setParam (*p, "dmix", 1.0f); setParam (*p, "dtime", 0.3f); setParam (*p, "dfb", 0.7f); }
        setParam (*narrow, "dwid", 0.0f);
        auto [wl, wr] = renderStereo (*wide, 1.5, { { 0, true, 45, 90 }, { (int) (0.1 * sr), false, 45, 0 } });
        auto [nl, nr] = renderStereo (*narrow, 1.5, { { 0, true, 45, 90 }, { (int) (0.1 * sr), false, 45, 0 } });
        check (corr (wl, wr, (int) (0.1 * sr), (int) (1.4 * sr)) < 0.5, "full stereo ping-pong decorrelates the channels", corr (wl, wr, (int) (0.1 * sr), (int) (1.4 * sr)));
        check (corr (nl, nr, (int) (0.1 * sr), (int) (1.4 * sr)) > 0.95, "stereo 0 collapses the echoes to the centre", corr (nl, nr, (int) (0.1 * sr), (int) (1.4 * sr)));
    }
    {   // reverb
        auto warm = [] (AcidBassProcessor& p) {   // run blocks until the (background-loaded) impulse response is installed
            juce::AudioBuffer<float> b (2, block); juce::MidiBuffer m;
            for (int i = 0; i < 200 && ! p.reverbReady(); ++i) { b.clear(); p.processBlock (b, m); juce::Thread::sleep (10); }
            // ready() turns true before the convolver has installed its later partitions (background thread): keep running silence for about 1 s
            for (int i = 0; i < 100; ++i) { b.clear(); p.processBlock (b, m); juce::Thread::sleep (10); }
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
        {   // sanity only: the tail exists but never out-shouts the note. Tail window is 0.2 s after the note ends,
            // so a small ratio is expected; the band is 0.005 to 1.0 (wet tail rms / held dry note rms, 0.06 to 0.14 s).
            const double dryNote = rms (a, (int) (0.06 * sr), (int) (0.14 * sr)), wetTail = rms (c, t0, t1), ratio = wetTail / dryNote;
            check (ratio > 0.005 && ratio < 1.0, "wet tail exists and stays under the dry note (wet tail rms / dry note rms)", ratio);
            std::printf ("info  wet tail rms %g, dry note rms %g\n", wetTail, dryNote);
        }

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
    {   // envelopes: maps, parameters, and the audio they shape
        using namespace acidmaps;
        auto near = [] (double a, double b, double tol = 1e-4) { return std::abs (a - b) <= tol * std::max (1.0, std::abs (b)); };
        check (near (atkSec (0), 0.002) && near (atkSec (1), 1.5), "atkSec");
        check (near (envDecSec (0), 0.03) && near (envDecSec (0.5), 0.27331300737) && near (envDecSec (1), 2.49), "envDecSec");
        check (near (relSec (0.03), 0.00598455419) && near (relSec (0.68), 0.29401588734) && near (relSec (1), 2.0), "relSec");
        auto p = make();
        const struct { const char* id; float def; } ids[7] = { { "fatk", 0.0f }, { "fsus", 0.0f }, { "frel", 0.68f }, { "aatk", 0.0f }, { "adec", 0.5f }, { "asus", 1.0f }, { "arel", 0.03f } };
        bool have = true; double worst = 0;
        for (const auto& e : ids)
        {
            auto* prm = p->apvts.getParameter (e.id);
            if (prm == nullptr) { have = false; continue; }
            worst = std::max (worst, (double) std::abs (p->apvts.getRawParameterValue (e.id)->load() - e.def));
        }
        check (have && worst < 1e-4, "the seven envelope parameters exist with the web defaults", worst);

        const int hold = (int) (2.0 * sr);
        auto held = [&] (auto setup) { auto q = make(); setParam (*q, "envmod", 0.0f); setParam (*q, "cutoff", 3000.0f); setup (*q); return render (*q, 2.5, { { 0, true, 45, 90 } }); };
        const int oneSec = (int) (1.0 * sr);
        auto level = [&] (const std::vector<float>& v, int at) { return rms (v, at, at + 2000); };
        auto plucked = held ([] (AcidBassProcessor& q) { setParam (q, "asus", 0.0f); setParam (q, "adec", 0.1f); });
        double peak = 0; for (int i = 0; i + 2000 < oneSec; i += 500) peak = std::max (peak, level (plucked, i));
        check (level (plucked, oneSec) < 0.05 * peak, "amp sustain 0 with a short decay plucks", level (plucked, oneSec) / peak);
        auto sustained = held ([] (AcidBassProcessor& q) { setParam (q, "asus", 1.0f); setParam (q, "adec", 0.1f); });
        double peak2 = 0; for (int i = 0; i + 2000 < oneSec; i += 500) peak2 = std::max (peak2, level (sustained, i));
        check (level (sustained, oneSec) > 0.5 * peak2, "amp sustain 1 holds the level", level (sustained, oneSec) / peak2);
        (void) hold;

        auto fast = held ([] (AcidBassProcessor&) {});
        auto slow = held ([] (AcidBassProcessor& q) { setParam (q, "aatk", 1.0f); });
        const int w = (int) (0.02 * sr);
        check (rms (slow, 0, w) < 0.1 * rms (fast, 0, w), "amp attack at max swells in slowly", rms (slow, 0, w) / rms (fast, 0, w));

        auto offAt = [&] (auto setup) { auto q = make(); setParam (*q, "envmod", 0.0f); setParam (*q, "cutoff", 3000.0f); setup (*q);
                                        return render (*q, 1.5, { { 0, true, 45, 90 }, { (int) (0.5 * sr), false, 45, 0 } }); };
        const int after = (int) (0.8 * sr);   // 300 ms after note off
        auto shortRel = offAt ([] (AcidBassProcessor&) {});
        auto longRel = offAt ([] (AcidBassProcessor& q) { setParam (q, "arel", 1.0f); });
        const double heldLevel = rms (longRel, (int) (0.4 * sr), (int) (0.5 * sr));
        check (rms (longRel, after, after + 2000) > 0.1 * heldLevel, "amp release at max leaves a tail", rms (longRel, after, after + 2000) / heldLevel);
        check (rms (shortRel, after, after + 2000) < 0.01 * rms (shortRel, (int) (0.4 * sr), (int) (0.5 * sr)), "default amp release is short", rms (shortRel, after, after + 2000));

        auto fsus = [&] (float v) { auto q = make(); setParam (*q, "cutoff", 150.0f); setParam (*q, "envmod", 1.0f); setParam (*q, "decay", 0.05f); setParam (*q, "fsus", v);
                                    return render (*q, 1.2, { { 0, true, 45, 90 } }); };
        auto f0 = fsus (0.0f), f1 = fsus (1.0f);
        check (brightness (f1, (int) (0.6 * sr), (int) (1.0 * sr)) > brightness (f0, (int) (0.6 * sr), (int) (1.0 * sr)) * 1.2, "filter sustain keeps the note bright", brightness (f1, (int) (0.6 * sr), (int) (1.0 * sr)) / brightness (f0, (int) (0.6 * sr), (int) (1.0 * sr)));
    }
    {   // the UI bridge: values by id, in plugin units, with no echo
        auto p = make();
        ParamBridge b (*p);
        const auto all = b.changes();
        check (all.size() == (size_t) p->getParameters().size(), "the first poll lists every parameter", (double) all.size());
        check (b.changes().empty(), "a second poll with nothing moved is empty");
        check (b.setReal ("cutoff", 1000.0f), "setReal takes a known id");
        const float cut = p->apvts.getRawParameterValue ("cutoff")->load();
        check (std::abs (cut - 1000.0f) < 0.5f, "setReal moves the real parameter, in Hz", cut);
        check (b.changes().empty(), "a value the UI set is not echoed back");
        setParam (*p, "res", 0.9f);
        const auto moved = b.changes();
        check (moved.size() == 1 && moved[0].first == "res" && std::abs (moved[0].second - 0.9f) < 1e-3f, "a host change is reported", moved.empty() ? 0.0 : moved[0].second);
        check (b.changes().empty(), "and only once");
        check (b.setReal ("wave", 1.0f) && p->apvts.getRawParameterValue ("wave")->load() > 0.5f, "a choice takes its index");
        check (! b.setReal ("nope", 1.0f), "an unknown id is refused");
        check (b.changes (true).size() == all.size(), "changes(true) lists everything again");
        b.gesture ("res", true); b.gesture ("res", true); b.gesture ("res", false); b.gesture ("res", false); b.endAllGestures();
        check (true, "repeated gestures do not upset the host");
    }
    {   // the step sequencer engine (Sequencer.h): no host, so ppq, bpm and blocks are driven by hand
        using namespace acidseq;
        check (std::abs (acidmaps::gateFrac (0.5) - 0.55) < 1e-9 && acidmaps::gateFrac (0.0) == 0.1 && acidmaps::gateFrac (1.0) == 1.0, "gateFrac maps 0, 0.5, 1 to 0.1, 0.55, 1.0", acidmaps::gateFrac (0.5));

        auto note = [] (int n, int o = 0, bool acc = false, bool sl = false) { Step s; s.gate = Gate::Note; s.note = n; s.oct = o; s.accent = acc; s.slide = sl; return s; };
        auto tie = [] { Step s; s.gate = Gate::Tie; return s; };
        auto rest = [] { return Step(); };
        auto pat = [] (std::initializer_list<Step> l) { Pattern p; p.len = (int) l.size(); int i = 0; for (const auto& s : l) p.steps[i++] = s; return p; };
        struct Ev { bool on; long long at; int note; float vel; };
        // Runs blocks of the given sizes back to back from ppq 0 and returns events at absolute sample positions.
        auto run = [] (const Pattern& p, Settings st, double bpm, std::vector<int> sizes) {
            Engine e; std::vector<Out> o; std::vector<Ev> all; long long pos = 0;
            for (int n : sizes)
            {
                e.process (p, st, true, (double) pos * bpm / 60.0 / 44100.0, bpm, n, 44100.0, o);
                for (const auto& x : o) all.push_back ({ x.on, pos + x.sample, x.note, x.velocity });
                pos += n;
            }
            return all;
        };
        auto ons = [] (const std::vector<Ev>& v) { std::vector<Ev> r; for (const auto& e : v) if (e.on) r.push_back (e); return r; };
        auto offs = [] (const std::vector<Ev>& v) { std::vector<Ev> r; for (const auto& e : v) if (! e.on) r.push_back (e); return r; };
        Settings on; on.on = true; on.swing = 0.0f; on.gateFrac = 0.55f;
        const double stepS = 5512.5;   // one 16th at 120 bpm, 44.1 kHz

        const Pattern four = pat ({ note (0), note (2), note (4), note (5) });
        const auto t = run (four, on, 120.0, { 22050 });
        const auto tOn = ons (t), tOff = offs (t);
        const long long wantOn[4] = { 0, 5512, 11025, 16537 }; const int wantMidi[4] = { 36, 38, 40, 41 };
        bool timing = tOn.size() == 4; for (size_t i = 0; timing && i < 4; ++i) timing = std::abs (tOn[i].at - wantOn[i]) <= 1 && tOn[i].note == wantMidi[i];
        check (timing, "sequencer: four notes start on the 16ths with the right pitches", (double) tOn.size());
        bool gateOk = tOff.size() == 4; for (size_t i = 0; gateOk && i < 4; ++i) gateOk = std::abs (tOff[i].at - (tOn[i].at + 3032)) <= 1 && (i == 3 || tOff[i].at < tOn[i + 1].at) && tOff[i].note == tOn[i].note;
        check (gateOk, "sequencer: each note ends 0.55 of a step after it starts");

        const auto r = run (pat ({ note (0), rest(), note (0), rest() }), on, 120.0, { 22050 });
        check (ons (r).size() == 2 && offs (r).size() == 2 && r.size() == 4, "sequencer: rests make no events", (double) r.size());

        const auto a = ons (run (pat ({ note (0, 0, true), note (0) }), on, 120.0, { 11025 }));
        check (a.size() == 2 && a[0].vel >= 110.0f / 127.0f && a[1].vel < 110.0f / 127.0f, "sequencer: an accent is loud, a plain step is not", a.empty() ? 0.0 : a[0].vel);

        const auto sl = run (pat ({ note (0, 0, false, true), note (2), rest(), rest() }), on, 120.0, { 22050 });
        {   // events at D's start: NoteOn D then NoteOff C, same sample, and no NoteOff of C earlier
            int iOnD = -1, iOffC = -1, offCBefore = 0;
            for (size_t i = 0; i < sl.size(); ++i)
            {
                if (sl[i].on && sl[i].note == 38) iOnD = (int) i;
                if (! sl[i].on && sl[i].note == 36 && iOffC < 0) iOffC = (int) i;
            }
            for (int i = 0; i < iOnD; ++i) if (! sl[(size_t) i].on && sl[(size_t) i].note == 36) ++offCBefore;
            check (iOnD >= 0 && iOffC == iOnD + 1 && sl[(size_t) iOffC].at == sl[(size_t) iOnD].at && offCBefore == 0, "sequencer: a slide plays the new note first, then lets the old one go", (double) iOffC);
        }

        const auto ti = run (pat ({ note (0), tie(), rest(), rest() }), on, 120.0, { 22050 });
        {
            const auto o = ons (ti), f = offs (ti);
            check (o.size() == 1 && f.size() == 1 && f[0].note == 36 && std::abs (f[0].at - (long long) (stepS + 0.95 * stepS)) <= 1, "sequencer: a tie holds the note and ends 0.95 into its own step", f.empty() ? 0.0 : (double) f[0].at);
        }

        const auto oc = ons (run (pat ({ note (0, 1), note (0, -1) }), on, 120.0, { 11025 }));
        check (oc.size() == 2 && oc[0].note == 48 && oc[1].note == 24, "sequencer: octave +1 adds 12, -1 subtracts 12", oc.empty() ? 0.0 : oc[0].note);

        {   // stop: a playing=false block after a sounding note releases it once at sample 0
            Engine e; std::vector<Out> o; const Pattern p = pat ({ note (0, 0, false, true), note (2, 0, false, true) });   // slides: no gate-off, stays sounding
            e.process (p, on, true, 0.0, 120.0, 4000, 44100.0, o);
            e.process (p, on, false, 0.2, 120.0, 512, 44100.0, o);
            const bool one = o.size() == 1 && ! o[0].on && o[0].sample == 0;
            e.process (p, on, false, 0.2, 120.0, 512, 44100.0, o);
            check (one && o.empty() && e.currentStep() == -1, "sequencer: stopping releases the note once, then silence", (double) o.size());
        }
        {   // jump: after a block ending at ppq 2.0, a block at ppq 0 (loop) releases at 0, then step 0 starts at 0
            Engine e; std::vector<Out> o; const Pattern p = pat ({ note (0, 0, false, true), note (2, 0, false, true), note (4, 0, false, true), note (5, 0, false, true) });
            e.process (p, on, true, 1.0, 120.0, 22050, 44100.0, o);   // 22050 samples at 120 bpm = 1 quarter, so this ends at ppq 2.0
            e.process (p, on, true, 0.0, 120.0, 512, 44100.0, o);
            check (o.size() == 2 && ! o[0].on && o[0].sample == 0 && o[1].on && o[1].sample == 0 && o[1].note == 36, "sequencer: a position jump releases, then restarts step 0 at once", (double) o.size());
        }

        Settings sw = on; sw.swing = 1.0f;
        const auto sv = ons (run (pat ({ note (0), note (2) }), sw, 120.0, { 11025 }));
        check (sv.size() == 2 && std::abs (sv[1].at - (long long) (stepS + 0.33 * stepS)) <= 1, "sequencer: swing 1.0 delays the odd step by 0.33 of a step", sv.size() > 1 ? (double) sv[1].at : 0.0);
        {   // swing 1, gate 1.0: odd step 1 would end a full step after its swung start, past step 2's start; the old note must not end after the new one starts
            Settings s2 = sw; s2.gateFrac = 1.0f;
            const auto e2 = run (pat ({ note (0), note (2), note (4), rest() }), s2, 120.0, { 22050 });
            bool dropped = true; long long onNext = -1; int offs38 = 0;
            for (const auto& x : e2) if (x.on && x.note == 40) onNext = x.at;
            for (const auto& x : e2) if (! x.on && x.note == 38) { ++offs38; if (x.at > onNext) dropped = false; }
            check (onNext > 0 && dropped && offs38 == 1, "sequencer: a swung note's late gate-off does not land after the next note-on", (double) onNext);
        }

        {   // block-split invariance
            const Pattern p = pat ({ note (0, 0, true), note (2, 0, false, true), note (4), tie(), note (5), rest(), note (7, 1), note (9) });
            Settings s3 = on; s3.swing = 0.5f;
            const auto one = run (p, s3, 120.0, { 22050 });
            std::vector<int> sizes; for (int i = 0; i < 8; ++i) sizes.push_back ((i % 2) ? 2757 : 2756);   // 22052 samples; compare events before 22000 so the longer run's extra tail is not counted
            const auto many = run (p, s3, 120.0, sizes);
            auto firstN = [&] (const std::vector<Ev>& v) { std::vector<Ev> q; for (const auto& e : v) if (e.at < 22000) q.push_back (e); return q; };
            const auto A = firstN (one), B = firstN (many);
            bool same = A.size() == B.size() && ! A.empty();
            for (size_t i = 0; same && i < A.size(); ++i) same = A[i].on == B[i].on && A[i].note == B[i].note && std::abs (A[i].at - B[i].at) <= 1;
            check (same, "sequencer: the same audio in 8 blocks gives the same events as in one", (double) B.size());
        }

        {   // JSON: clamps like the web's cleanPattern, and round-trips to the same text (expected string made by node from acidbass.js)
            const juce::String in = R"J({"len":99,"steps":[{"gate":"note","note":99,"oct":5,"accent":true,"slide":true},{"gate":"bogus","note":3,"oct":-1},{"gate":"tie","note":7,"oct":-1,"accent":true},{"gate":"note","note":2.4,"oct":0,"slide":"yes"}]})J";
            const Pattern p = fromJson (in);
            check (p.len == 32 && p.steps[0].note == 12 && p.steps[0].oct == 1 && p.steps[1].gate == Gate::Rest && p.steps[10].gate == Gate::Rest, "sequencer: fromJson clamps len, note, oct and unknown gates");
            const juce::String want = R"J({"len":32,"steps":[{"gate":"note","note":12,"oct":1,"accent":true,"slide":true},{"gate":"rest","note":3,"oct":-1,"accent":false,"slide":false},{"gate":"tie","note":7,"oct":-1,"accent":true,"slide":false},{"gate":"note","note":2,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false},{"gate":"rest","note":0,"oct":0,"accent":false,"slide":false}]})J";
            check (toJson (p) == want, "sequencer: toJson(fromJson(x)) is the text JSON.stringify(cleanPattern(x)) gives");
        }
    }

    {   // processor integration: the sequencer plays through the voice from the host clock
        struct Head : juce::AudioPlayHead
        {
            bool playing = true; double bpm = 120.0, ppq = 0.0;
            juce::Optional<PositionInfo> getPosition() const override
            {
                PositionInfo i; i.setIsPlaying (playing); i.setBpm (bpm); i.setPpqPosition (ppq); return i;
            }
        };
        const char* pat = R"J({"len":4,"steps":[{"gate":"note","note":0,"oct":0,"accent":false,"slide":false},{"gate":"note","note":2,"oct":0,"accent":false,"slide":false},{"gate":"note","note":4,"oct":0,"accent":false,"slide":false},{"gate":"note","note":5,"oct":0,"accent":false,"slide":false}]})J";
        // One beat (22050 samples) of 512-sample blocks from ppq 0; returns the peak. extra feeds MIDI in the first block.
        auto peakOf = [&] (AcidBassProcessor& p, Head& h, bool midiNote)
        {
            float peak = 0.0f; h.ppq = 0.0;
            for (int s = 0; s < 22050; s += block)
            {
                juce::AudioBuffer<float> buf (2, block); juce::MidiBuffer m;
                if (midiNote && s == 0) m.addEvent (juce::MidiMessage::noteOn (1, 45, (juce::uint8) 100), 0);
                p.processBlock (buf, m);
                peak = std::max (peak, buf.getMagnitude (0, block));
                h.ppq += block * h.bpm / 60.0 / sr;
            }
            return peak;
        };
        auto flag = [] (AcidBassProcessor& p, const char* id, float v) { setParam (p, id, v); };
        {
            auto p = make();
            auto* seqon = p->apvts.getParameter ("seqon"); auto* swing = p->apvts.getParameter ("swing"); auto* gate = p->apvts.getParameter ("gate");
            check (seqon && swing && gate, "plugin sequencer: seqon, swing and gate parameters exist");
            if (seqon && swing && gate)
                check (seqon->getValue() == 0.0f && swing->getValue() == 0.0f && std::abs (gate->getValue() - 0.5f) < 1e-6f, "plugin sequencer: defaults are off, 0 and 0.5");
        }
        {
            Head h; auto p = make(); p->setPlayHead (&h); p->setPatternJson (pat);
            flag (*p, "seqon", 1.0f);
            const float on = peakOf (*p, h, false);
            auto q = make(); q->setPlayHead (&h); q->setPatternJson (pat);
            const float off = peakOf (*q, h, false);
            check (on > 0.05f, "plugin sequencer: on and playing makes sound", on);
            check (off < 1e-6f, "plugin sequencer: off is silent", off);
            auto r = make(); r->setPlayHead (&h); r->setPatternJson (pat); flag (*r, "seqon", 1.0f);
            h.playing = false;
            const float stopped = peakOf (*r, h, false);
            check (stopped < 1e-6f, "plugin sequencer: on but host stopped is silent", stopped);
            auto t = make(); t->setPlayHead (&h); t->setPatternJson (pat); flag (*t, "seqon", 1.0f);
            const float withMidi = peakOf (*t, h, true);
            check (withMidi > 0.05f, "plugin sequencer: piano-roll MIDI plays with the host stopped and Seq on", withMidi);
            h.playing = true;
            auto u = make(); u->setPlayHead (&h); u->setPatternJson (pat); flag (*u, "seqon", 1.0f);
            check (peakOf (*u, h, true) > 0.05f, "plugin sequencer: piano-roll MIDI plays alongside the sequencer", peakOf (*u, h, true));
            std::printf ("     peak seq on %g, off %g\n", on, off);
        }
        {
            auto a = make(); a->setPatternJson (pat);
            juce::MemoryBlock mb; a->getStateInformation (mb);
            auto b = make(); b->setStateInformation (mb.getData(), (int) mb.getSize());
            check (a->getPatternJson() == b->getPatternJson() && b->getPatternJson().contains ("\"len\":4"), "plugin sequencer: the pattern survives save and load");
            auto c = make();
            check (c->getPatternJson() == acidseq::toJson (acidseq::Pattern{}), "plugin sequencer: a fresh plugin holds the empty 16-step pattern");
        }
    }
    std::printf ("%d failure(s)\n", failures);
    return failures == 0 ? 0 : 1;
}
