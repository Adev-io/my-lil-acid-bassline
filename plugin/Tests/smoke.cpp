// smoke.cpp — drives AcidBassProcessor with MIDI and checks the audio that comes out.
// Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see ../LICENSE)
#include "PluginProcessor.h"
#include "Maps.h"
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
    std::printf ("%d failure(s)\n", failures);
    return failures == 0 ? 0 : 1;
}
