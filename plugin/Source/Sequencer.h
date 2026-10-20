// Sequencer.h — the web app's step pattern and its event rules, plus an engine that turns a host's tempo and position into note events.
// No JUCE audio code in here (only juce::var for JSON), so the smoke test can drive it without a host.
// Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see plugin/LICENSE)
#pragma once
#include <juce_core/juce_core.h>
#include <algorithm>
#include <cmath>
#include <vector>

namespace acidseq
{
constexpr int maxSteps = 32;
enum class Gate : int { Note = 0, Rest = 1, Tie = 2 };
struct Step { Gate gate = Gate::Rest; int note = 0, oct = 0; bool accent = false, slide = false; };
struct Pattern { int len = 16; Step steps[maxSteps]; };

inline int midiOf (const Step& s) { return 36 + s.note + 12 * s.oct; }

// acidbass.js stepEvent(): what one step does, given its neighbours (patterns wrap).
struct Event { bool off = true, trig = false, glide = false, hold = false, accent = false; int midi = 0; float len = 0.55f; };

inline Event stepEvent (const Pattern& p, int i)
{
    const int L = std::max (1, p.len);
    auto at = [&] (int j) -> const Step& { return p.steps[((j % L) + L) % L]; };
    const Step& s = at (i); const Step& prev = at (i - 1); const Step& next = at (i + 1);
    Event e;
    if (s.gate == Gate::Rest) return e;
    e.hold = (s.slide && next.gate == Gate::Note) || next.gate == Gate::Tie;
    if (s.gate == Gate::Tie)
    {
        for (int b = 1; b <= L; ++b)
        {
            const Step& q = at (i - b);
            if (q.gate == Gate::Note) { e.off = false; e.midi = midiOf (q); e.len = 0.95f; return e; }
            if (q.gate == Gate::Rest) break;
        }
        e.hold = false; return e;   // nothing but ties: no pitch, treated as a rest
    }
    const bool legato = prev.slide && prev.gate == Gate::Note;
    e.off = false; e.trig = ! legato; e.glide = legato; e.midi = midiOf (s); e.accent = s.accent; e.len = 0.55f;
    return e;
}

inline Pattern fromJson (const juce::String& text)
{
    Pattern p;
    const auto v = juce::JSON::parse (text);
    auto num = [] (const juce::var& x, int lo, int hi, int d) { return x.isDouble() || x.isInt() || x.isInt64() ? juce::jlimit (lo, hi, (int) std::lround ((double) x)) : d; };
    p.len = num (v["len"], 1, maxSteps, 16);
    if (auto* a = v["steps"].getArray())
        for (int i = 0; i < maxSteps && i < a->size(); ++i)
        {
            const auto& s = (*a)[i]; Step& o = p.steps[i];
            const auto g = s["gate"].toString();
            o.gate = g == "note" ? Gate::Note : g == "tie" ? Gate::Tie : Gate::Rest;
            o.note = num (s["note"], 0, 12, 0); o.oct = num (s["oct"], -1, 1, 0);
            o.accent = s["accent"].isBool() && (bool) s["accent"]; o.slide = s["slide"].isBool() && (bool) s["slide"];
        }
    return p;
}

// The same text JSON.stringify(cleanPattern(...)) gives in the page: keys in this order, no spaces.
inline juce::String toJson (const Pattern& p)
{
    juce::String t = "{\"len\":" + juce::String (p.len) + ",\"steps\":[";
    for (int i = 0; i < maxSteps; ++i)
    {
        const Step& s = p.steps[i];
        t << (i ? "," : "") << "{\"gate\":\"" << (s.gate == Gate::Note ? "note" : s.gate == Gate::Tie ? "tie" : "rest")
          << "\",\"note\":" << s.note << ",\"oct\":" << s.oct << ",\"accent\":" << (s.accent ? "true" : "false") << ",\"slide\":" << (s.slide ? "true" : "false") << "}";
    }
    return t + "]}";
}

struct Settings { bool on = false; float swing = 0.0f; float gateFrac = 0.55f; };
struct Out { bool on; int sample; int note; float velocity; };

class Engine
{
public:
    int currentStep() const { return stepNow; }   // -1 when silent

    // One block. ppq0 is the song position in quarter notes at the block's first sample. Events come out in time order.
    void process (const Pattern& pat, const Settings& s, bool playing, double ppq0, double bpm, int n, double sr, std::vector<Out>& out)
    {
        out.clear();
        if (! s.on || ! playing || bpm <= 0.0 || sr <= 0.0) { release (0, out); haveEnd = false; stepNow = -1; return; }
        const double perSample = bpm / 60.0 / sr, ppq1 = ppq0 + n * perSample;
        if (! haveEnd || std::abs (ppq0 - lastEnd) > 0.05)   // start, or the host jumped (loop, locate): let go and re-sync
        {
            release (0, out);
            nextK = (long long) std::ceil (ppq0 * 4.0 - 1.0e-6);
        }
        haveEnd = true; lastEnd = ppq1;
        auto timeOf = [&] (long long k) { return k * 0.25 + ((k & 1) ? (double) s.swing * 0.25 * 0.33 : 0.0); };
        auto sampleOf = [&] (double t) { return juce::jlimit (0, n - 1, (int) ((t - ppq0) / perSample)); };
        for (;;)
        {
            const double tStep = timeOf (nextK), tOff = pendingOff ? offAt : 1.0e300;
            if (tOff < ppq1 && tOff <= tStep) { release (sampleOf (tOff), out); continue; }
            if (tStep >= ppq1) break;
            const int len = std::max (1, pat.len), idx = (int) (((nextK % len) + len) % len);
            const Event e = stepEvent (pat, idx);
            const int at = sampleOf (tStep);
            if (! e.off)
            {
                stepNow = idx;
                pendingOff = false;   // a step that sounds cancels a gate-off still waiting; a rest leaves it be, as in the page
                if (e.trig || ! sounding) { release (at, out); start (e, at, out); }
                else if (e.glide) { const int old = cur; start (e, at, out); if (old != e.midi) out.push_back ({ false, at, old, 0.0f }); }   // new note first, then let the old one go: the voice slides (a slide to the same pitch must not release it)
                if (! e.hold) { pendingOff = true; offAt = tStep + 0.25 * (e.len < 0.9f ? s.gateFrac : e.len); }
            }
            ++nextK;
        }
    }

private:
    void start (const Event& e, int at, std::vector<Out>& out) { out.push_back ({ true, at, e.midi, e.accent ? 1.0f : 0.7f }); cur = e.midi; sounding = true; }
    void release (int at, std::vector<Out>& out)
    {
        if (sounding) out.push_back ({ false, at, cur, 0.0f });
        sounding = false; pendingOff = false;
    }

    long long nextK = 0; double lastEnd = 0.0, offAt = 0.0; bool haveEnd = false, pendingOff = false, sounding = false; int cur = 0, stepNow = -1;
};
}
