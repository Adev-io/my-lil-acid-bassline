// Editor.h — the plugin window: the web page in a WebView2, talking to the processor through ParamBridge.
// Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see plugin/LICENSE)
#pragma once
#include "PluginProcessor.h"
#include "ParamBridge.h"
#include <juce_gui_extra/juce_gui_extra.h>
#include <optional>

class AcidEditor final : public juce::AudioProcessorEditor, private juce::Timer
{
public:
    explicit AcidEditor (AcidBassProcessor&);
    ~AcidEditor() override;
    void resized() override { web.setBounds (getLocalBounds()); }

private:
    std::optional<juce::WebBrowserComponent::Resource> resource (const juce::String& url);
    void pushChanges (bool all);
    void timerCallback() override { pushChanges (false); }

    AcidBassProcessor& proc;
    juce::String lastPattern;
    int lastStep = -2;
    ParamBridge bridge;
    juce::WebBrowserComponent web;
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AcidEditor)
};
