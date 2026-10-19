// ParamBridge.h — moves parameter values between the plugin and a UI by id, in plugin units (Hz, cents, 0..1, choice index).
// No web code in here, so the headless test can drive it. Poll changes() from a timer on the message thread.
// Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see plugin/LICENSE)
#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include <cmath>
#include <set>
#include <utility>
#include <vector>

class ParamBridge
{
public:
    explicit ParamBridge (juce::AudioProcessor& p)
    {
        for (auto* prm : p.getParameters())
            if (auto* r = dynamic_cast<juce::RangedAudioParameter*> (prm))
            {
                params.push_back (r);
                sent.push_back (std::nanf (""));
            }
    }

    // Values that moved since the last call, or everything when `all` is true or on the very first call.
    std::vector<std::pair<juce::String, float>> changes (bool all = false)
    {
        std::vector<std::pair<juce::String, float>> out;
        for (size_t i = 0; i < params.size(); ++i)
        {
            const float v = real (*params[i]);
            if (all || std::isnan (sent[i]) || std::abs (v - sent[i]) > 1e-6f)
            {
                sent[i] = v;
                out.emplace_back (params[i]->getParameterID(), v);
            }
        }
        return out;
    }

    // The UI moved a control. False for an unknown id. What it sets is not reported back by changes().
    bool setReal (const juce::String& id, float v)
    {
        const int i = indexOf (id);
        if (i < 0) return false;
        auto& r = *params[(size_t) i];
        r.setValueNotifyingHost (r.convertTo0to1 (v));
        sent[(size_t) i] = real (r);
        return true;
    }

    // Held while a knob is dragged, so the host records one move instead of a stream of jumps.
    void gesture (const juce::String& id, bool on)
    {
        const int i = indexOf (id);
        if (i < 0) return;
        if (on && active.insert (i).second) params[(size_t) i]->beginChangeGesture();
        else if (! on && active.erase (i) > 0) params[(size_t) i]->endChangeGesture();
    }

    void endAllGestures()
    {
        for (int i : active) params[(size_t) i]->endChangeGesture();
        active.clear();
    }

private:
    static float real (const juce::RangedAudioParameter& r) { return r.convertFrom0to1 (r.getValue()); }
    int indexOf (const juce::String& id) const
    {
        for (size_t i = 0; i < params.size(); ++i)
            if (params[i]->getParameterID() == id) return (int) i;
        return -1;
    }

    std::vector<juce::RangedAudioParameter*> params;
    std::vector<float> sent;
    std::set<int> active;
};
