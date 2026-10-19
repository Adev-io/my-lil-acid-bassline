// Author: Ari Klopfer / A_Development · AGPL-3.0-or-later (links JUCE, see plugin/LICENSE)
#include "Editor.h"
#include "AcidUiData.h"

namespace
{
struct Asset { const char* url; const char* name; const char* mime; };
constexpr Asset assets[] = {
    { "/",                  "index_html",        "text/html" },
    { "/index.html",        "index_html",        "text/html" },
    { "/acidbass.js",       "acidbass_js",       "text/javascript" },
    { "/factory.js",       "factory_js",        "text/javascript" },
    { "/ui-bridge.js",      "uibridge_js",       "text/javascript" },
    { "/juce-frontend.js",  "jucefrontend_js",   "text/javascript" },
};
}

std::optional<juce::WebBrowserComponent::Resource> AcidEditor::resource (const juce::String& url)
{
    for (const auto& a : assets)
        if (url == a.url)
        {
            int size = 0;
            const auto* data = AcidUi::getNamedResource (a.name, size);
            if (data == nullptr) return std::nullopt;
            return juce::WebBrowserComponent::Resource { std::vector<std::byte> ((const std::byte*) data, (const std::byte*) data + size), juce::String (a.mime) };
        }
    return std::nullopt;
}

AcidEditor::AcidEditor (AcidBassProcessor& p)
    : AudioProcessorEditor (&p), proc (p), bridge (p),
      web (juce::WebBrowserComponent::Options {}
               .withBackend (juce::WebBrowserComponent::Options::Backend::webview2)
               .withWinWebView2Options (juce::WebBrowserComponent::Options::WinWebView2 {}
                   .withUserDataFolder (juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile ("MyLilAcidBassline-webview")))
               .withNativeIntegrationEnabled()
               .withResourceProvider ([this] (const auto& url) { return resource (url); })
               .withEventListener ("ready",   [this] (const juce::var&) { pushChanges (true); })
               .withEventListener ("set",     [this] (const juce::var& v) { bridge.setReal (v["id"].toString(), (float) (double) v["v"]); })
               .withEventListener ("pattern", [this] (const juce::var& v) { proc.setPatternJson (v["json"].toString()); lastPattern = proc.getPatternJson(); })
               .withEventListener ("gesture", [this] (const juce::var& v) { bridge.gesture (v["id"].toString(), (bool) v["on"]); }))
{
    addAndMakeVisible (web);
    web.goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
    setResizeLimits (410, 480, 1100, 1100);
    setResizable (true, true);
    setSize (790, 910);
    startTimerHz (30);
}

AcidEditor::~AcidEditor() { stopTimer(); bridge.endAllGestures(); }

void AcidEditor::pushChanges (bool all)
{
    if (const auto pj = proc.getPatternJson(); all || pj != lastPattern)
    {
        lastPattern = pj;
        auto* o = new juce::DynamicObject();
        o->setProperty ("json", pj);
        web.emitEventIfBrowserIsVisible ("pattern", juce::var (o));
    }
    if (const int st = proc.seqStep(); all || st != lastStep)
    {
        lastStep = st;
        auto* o = new juce::DynamicObject();
        o->setProperty ("i", st);
        web.emitEventIfBrowserIsVisible ("step", juce::var (o));
    }
    const auto changed = bridge.changes (all);
    if (changed.empty()) return;
    auto* o = new juce::DynamicObject();
    for (const auto& [id, v] : changed) o->setProperty (juce::Identifier (id), (double) v);
    web.emitEventIfBrowserIsVisible ("params", juce::var (o));
}
