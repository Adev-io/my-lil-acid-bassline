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

// Window size: the page's 790:970 shape, as big as the primary display allows once FL's own window chrome is taken off.
constexpr int kW = 790, kH = 970, kMinW = 400, kChrome = 140;
juce::Rectangle<int> fitToDisplay()
{
    int h = kH;
    if (const auto* d = juce::Desktop::getInstance().getDisplays().getPrimaryDisplay())
        h = juce::jlimit (juce::roundToInt (kMinW * (double) kH / kW), kH, d->userBounds.getHeight() - kChrome);
    return { juce::roundToInt (h * (double) kW / kH), h };
}

// The .mid the page sends as base64 goes to a file named after the slot ("07 Funk 07.mid"); returns the file or a nonexistent one.
juce::File writeMidi (const juce::File& dir, const juce::var& v)
{
    juce::MemoryOutputStream bytes;
    if (! juce::Base64::convertFromBase64 (bytes, v["b64"].toString()) || bytes.getDataSize() < 22) return {};
    auto name = juce::File::createLegalFileName (v["name"].toString()).trim();
    if (name.isEmpty()) name = "pattern";
    const auto f = dir.getChildFile (name.substring (0, 60) + ".mid");
    return dir.createDirectory().wasOk() && f.replaceWithData (bytes.getData(), bytes.getDataSize()) ? f : juce::File();
}
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
               .withEventListener ("pattern", [this] (const juce::var& v) { proc.setPatternSlot ((int) v["slot"], v["json"].toString(), (bool) v["base"]); lastBankRev = proc.bankRev(); })
               .withEventListener ("dragmidi", [this] (const juce::var& v) { dragMidi (v); })
               .withEventListener ("savemidi", [this] (const juce::var& v) { saveMidi (v); })
               .withEventListener ("gesture", [this] (const juce::var& v) { bridge.gesture (v["id"].toString(), (bool) v["on"]); }))
{
    addAndMakeVisible (web);
    web.goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
    setResizeLimits (kMinW, juce::roundToInt (kMinW * (double) kH / kW), kW, kH);
    setResizable (true, true);
    getConstrainer()->setFixedAspectRatio ((double) kW / kH);
    const auto size = fitToDisplay();
    setSize (size.getWidth(), size.getHeight());
    startTimerHz (30);
}

AcidEditor::~AcidEditor() { stopTimer(); bridge.endAllGestures(); }

void AcidEditor::dragMidi (const juce::var& v)
{
    const auto f = writeMidi (juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile ("MyLilAcidBassline-midi"), v);
    if (f == juce::File()) return;
    // Started from the message loop, not inside the WebView callback: the OS drag runs its own loop until the mouse is released.
    juce::MessageManager::callAsync ([safe = juce::Component::SafePointer<AcidEditor> (this), path = f.getFullPathName()]
    {
        if (safe != nullptr) juce::DragAndDropContainer::performExternalDragDropOfFiles ({ path }, false, safe.getComponent(), nullptr);
    });
}

void AcidEditor::saveMidi (const juce::var& v)
{
    const auto dir = juce::File::getSpecialLocation (juce::File::userDocumentsDirectory).getChildFile ("A_Development").getChildFile ("MyLilAcidBassline").getChildFile ("midi");
    const auto f = writeMidi (dir, v);
    auto* o = new juce::DynamicObject();
    o->setProperty ("text", f == juce::File() ? juce::String ("Could not save the MIDI file") : "Saved " + f.getFullPathName());
    web.emitEventIfBrowserIsVisible ("msg", juce::var (o));
}

void AcidEditor::pushChanges (bool all)
{
    if (const int rev = proc.bankRev(); all || rev != lastBankRev)
    {
        lastBankRev = rev;
        const auto bank = juce::JSON::parse (proc.getBankJson());
        auto* o = new juce::DynamicObject();
        o->setProperty ("cur", bank["cur"]);
        o->setProperty ("overrides", bank["overrides"]);
        web.emitEventIfBrowserIsVisible ("bank", juce::var (o));
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
