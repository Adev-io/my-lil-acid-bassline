# Plugin Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the web app's own panels inside the VST3 window (roadmap F2), with every knob moving the real plugin parameter and following FL's automation.

**Architecture:** The plugin editor is one JUCE `WebBrowserComponent` (WebView2) that serves `index.html`, `acidbass.js` and a new `ui-bridge.js` from embedded binary data. The page stays a face only: in the plugin it never opens an audio context. `ui-bridge.js` polls the page's state at 30 Hz and sends changed values to C++ as events; C++ (`ParamBridge`) polls the processor's parameters at 30 Hz and sends changed values to the page. Values travel by parameter id in plugin units (Hz, cents, 0..1, choice index). Nothing changes when `index.html` runs in a browser or Electron, because `window.__JUCE__` does not exist there.

**Tech Stack:** C++20, JUCE 9.0.4 (`juce_gui_extra` WebBrowserComponent, WebView2 linked statically), CMake + Ninja, plain JS, `node:test`.

**Scope (phase 1 of the UI):** the sound panels only: the main knobs, wave, Tweaks, Drive, Reverb, Delay and the filter decay. Not shown, because the plugin has no parameter or no job for them yet: the step grid, keyboard, pattern/song/export, MIDI in, Automate, tempo, the other envelope knobs, gate, delay Fat and Sync (roadmap F11). MIDI comes from FL's piano roll.

**Known risks, checked in the tasks below:** WebView2 inside FL's plugin window may misbehave (Task 1 is the go/no-go gate, tried in the standalone app and then in FL); the host needs the WebView2 runtime (Windows 11 has it; 155.0.4283.62 is installed on this machine); wheel and keyboard knob moves have no begin/end gesture, so FL may record them less cleanly than a drag.

**Branch:** work on `feat/plugin-web-ui`, cut from `main` (which holds the unpushed plugin port).

---

## File structure

| File | Job |
|---|---|
| `plugin/CMakeLists.txt` (modify) | Turn the web browser on for the plugin target, link WebView2 statically, embed the page files. |
| `plugin/Source/ParamBridge.h` (create) | Header-only: poll parameter changes by id, set a parameter by id, hold gestures. No web code, so the headless test can use it. |
| `plugin/Source/Editor.h`, `Editor.cpp` (create) | `AcidEditor`: the web view, the resource provider, the three event listeners, the 30 Hz push. |
| `plugin/Source/PluginProcessor.cpp` (modify) | `createEditor()` returns `AcidEditor` when the web browser is compiled in, else the generic editor (the headless test). |
| `plugin/ui/juce-frontend.js` (create, a copy) | JUCE's own JS side of the bridge, copied from the JUCE source. Stays under `plugin/` because it is AGPL/JUCE-licensed and the web page is MIT. |
| `ui-bridge.js` (create, repo root) | Page side: id mapping, polling, hiding the sequencer parts, key blocking. Does nothing without `window.__JUCE__`. |
| `index.html` (modify) | One `<script src="ui-bridge.js">` at the end. |
| `ui-bridge.test.mjs` (create, repo root) | Node test: the mapping round-trips, the plugin ranges are pinned, and every web knob has a real plugin parameter. |
| `plugin/Tests/smoke.cpp` (modify) | A `ParamBridge` check block. |
| `plugin/README.md`, roadmap (modify) | Document the editor; flip F2 when verified. |

---

### Task 1: Web view shell, go/no-go gate

Show the unchanged page in a plugin window. No bridge yet. If this does not work in FL, stop and fall back to a native editor.

**Files:**
- Create: `plugin/ui/juce-frontend.js`, `plugin/Source/Editor.h`, `plugin/Source/Editor.cpp`
- Modify: `plugin/CMakeLists.txt`, `plugin/Source/PluginProcessor.cpp:111-114`

- [ ] **Step 1: Branch**

```powershell
cd C:\Users\Arikl\Desktop\_Projects\my-lil-acid-bassline
git checkout -b feat/plugin-web-ui
```

Expected: `Switched to a new branch 'feat/plugin-web-ui'`.

- [ ] **Step 2: Install the WebView2 SDK package where JUCE looks for it**

JUCE's `FindWebView2.cmake` globs `%USERPROFILE%\AppData\Local\PackageManagement\NuGet\Packages\*Microsoft.Web.WebView2*`. This is a user-level folder outside the repo.

```powershell
$v = '1.0.3485.44'
$p = "$env:USERPROFILE\AppData\Local\PackageManagement\NuGet\Packages\Microsoft.Web.WebView2.$v"
New-Item -ItemType Directory -Force $p | Out-Null
Invoke-WebRequest "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$v" -OutFile "$env:TEMP\wv2.zip"
Expand-Archive "$env:TEMP\wv2.zip" $p -Force
Test-Path "$p\build\native\include\WebView2.h", "$p\build\native\x64\WebView2LoaderStatic.lib"
```

Expected: `True` and `True`. If the download is blocked, stop and ask the user.

- [ ] **Step 3: Copy JUCE's JS side into the plugin**

```powershell
New-Item -ItemType Directory -Force plugin\ui | Out-Null
Copy-Item plugin\build\_deps\juce-src\modules\juce_gui_extra\native\typescript\webview-interop\dist\index.js plugin\ui\juce-frontend.js
(Get-Item plugin\ui\juce-frontend.js).Length
```

Expected: `20353`.

- [ ] **Step 4: CMake**

In `plugin/CMakeLists.txt`, add `NEEDS_WEBVIEW2 TRUE` to `juce_add_plugin` (after `COPY_PLUGIN_AFTER_BUILD FALSE`), embed the page files, and switch the plugin target's web flags. Replace the lines from `juce_add_plugin(` through the first `target_link_libraries(MyLilAcidBassline ...)` with:

```cmake
juce_add_plugin(MyLilAcidBassline
    COMPANY_NAME "A_Development"
    PLUGIN_MANUFACTURER_CODE Adev
    PLUGIN_CODE Ab2x
    FORMATS VST3 Standalone
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    NEEDS_WEBVIEW2 TRUE
    PRODUCT_NAME "My lil acid bassline"
    VST3_CATEGORIES Instrument Synth
    COPY_PLUGIN_AFTER_BUILD FALSE)

# The window is the web page itself: the same index.html, acidbass.js and ui-bridge.js the web version ships.
juce_add_binary_data(AcidUi HEADER_NAME "AcidUiData.h" NAMESPACE AcidUi SOURCES
    ../index.html ../acidbass.js ../ui-bridge.js ui/juce-frontend.js)

target_sources(MyLilAcidBassline PRIVATE Source/PluginProcessor.cpp Source/PluginProcessor.h Source/AcidVoice.h Source/Maps.h Source/DriveStage.h Source/DelayStage.h Source/ReverbStage.h
    Source/ParamBridge.h Source/Editor.h Source/Editor.cpp)
target_include_directories(MyLilAcidBassline PUBLIC Source)
target_compile_definitions(MyLilAcidBassline PUBLIC JUCE_WEB_BROWSER=1 JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0)
target_link_libraries(MyLilAcidBassline PRIVATE AcidUi juce::juce_audio_utils juce::juce_dsp
    PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)
```

The test target below it stays as it is (`JUCE_WEB_BROWSER=0`, no `Editor.cpp`).

`../ui-bridge.js` does not exist yet, so create a placeholder now: `Set-Content ui-bridge.js "// filled in by Task 3"`.

- [ ] **Step 5: Editor header**

Create `plugin/Source/Editor.h`:

```cpp
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

    ParamBridge bridge;
    juce::WebBrowserComponent web;
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AcidEditor)
};
```

`ParamBridge.h` is created in Task 2; until then create it as an empty-class stub so this compiles:

```cpp
// ParamBridge.h — stub, replaced in Task 2.
#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
class ParamBridge { public: explicit ParamBridge (juce::AudioProcessor&) {} void endAllGestures() {} };
```

- [ ] **Step 6: Editor source (shell only)**

Create `plugin/Source/Editor.cpp`:

```cpp
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
    : AudioProcessorEditor (&p), bridge (p),
      web (juce::WebBrowserComponent::Options {}
               .withBackend (juce::WebBrowserComponent::Options::Backend::webview2)
               .withWinWebView2Options (juce::WebBrowserComponent::Options::WinWebView2 {}
                   .withUserDataFolder (juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile ("MyLilAcidBassline-webview")))
               .withNativeIntegrationEnabled()
               .withResourceProvider ([this] (const auto& url) { return resource (url); }))
{
    addAndMakeVisible (web);
    web.goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
    setResizable (true, true);
    setSize (820, 720);
}

AcidEditor::~AcidEditor() { stopTimer(); bridge.endAllGestures(); }

void AcidEditor::pushChanges (bool) {}   // Task 4
```

- [ ] **Step 7: `createEditor`**

In `plugin/Source/PluginProcessor.cpp`, add after `#include "PluginProcessor.h"`:

```cpp
#if JUCE_WEB_BROWSER
#include "Editor.h"
#endif
```

and replace the body of `createEditor()`:

```cpp
juce::AudioProcessorEditor* AcidBassProcessor::createEditor()
{
#if JUCE_WEB_BROWSER
    return new AcidEditor (*this);
#else
    return new juce::GenericAudioProcessorEditor (*this);   // the headless test build has no web view
#endif
}
```

- [ ] **Step 8: Build and run the headless test**

```powershell
cmd /c plugin\build.bat
```

Expected: build succeeds, `ctest` passes, and the smoke output ends with `0 failure(s)`. The existing 59 checks must still pass. If the link fails on `WebView2LoaderStatic.lib`, re-check Step 2; if `AcidUiData.h` is missing, check the `juce_add_binary_data` block.

- [ ] **Step 9: Look at it in the standalone app**

```powershell
Start-Process "plugin\build\MyLilAcidBassline_artefacts\Release\Standalone\My lil acid bassline.exe"
```

Expected: a window titled "My lil acid bassline" showing the synth page (silver case, knobs). Take a screenshot into `C:\Users\Arikl\Desktop\screenshots`. If the window is blank white, wait 3 s (WebView2 starts late) and look again. Close the app.

- [ ] **Step 10: Commit and gate**

```powershell
git add plugin/CMakeLists.txt plugin/Source plugin/ui ui-bridge.js
git commit -m "Plugin: window is the web page in a WebView2 (shell only, no bridge yet)"
```

**Gate (ask the user):** install the VST3 (`install-vst3.ps1` from the session scratchpad, elevated, with FL closed), open FL, add the plugin, and check that the window shows the page and does not crash FL on close and reopen. If it fails, record the symptom in the roadmap under F2 and stop; the fallback is the native JUCE editor.

---

### Task 2: `ParamBridge` (TDD, headless)

**Files:**
- Modify: `plugin/Source/ParamBridge.h` (replace the stub)
- Test: `plugin/Tests/smoke.cpp`

- [ ] **Step 1: Write the failing test**

In `plugin/Tests/smoke.cpp` add `#include "ParamBridge.h"` and `#include <cmath>` beside the other includes, and insert before the final `std::printf ("%d failure(s)\n", failures);`:

```cpp
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
```

- [ ] **Step 2: Run to see it fail**

```powershell
cmd /c plugin\build.bat
```

Expected: compile error, `class ParamBridge has no member named 'changes'` (the stub).

- [ ] **Step 3: Implement**

Replace `plugin/Source/ParamBridge.h`:

```cpp
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
```

- [ ] **Step 4: Run to see it pass**

```powershell
cmd /c plugin\build.bat
```

Expected: every new line starts `ok`, the last line is `0 failure(s)`, and the total is the old 59 plus 11 new checks.

- [ ] **Step 5: Commit**

```powershell
git add plugin/Source/ParamBridge.h plugin/Tests/smoke.cpp
git commit -m "Plugin: ParamBridge reads and sets parameters by id, with no echo and held gestures"
```

---

### Task 3: Page side, `ui-bridge.js` (TDD, node)

**Files:**
- Create: `ui-bridge.js` (replace the placeholder), `ui-bridge.test.mjs`
- Modify: `index.html` (one line before `</body>`)

- [ ] **Step 1: Write the failing test**

Create `ui-bridge.test.mjs` in the repo root:

```js
// ui-bridge.test.mjs — the id mapping between the web knobs and the plugin's parameters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const sb = { TextEncoder }; sb.window = sb;
const ctx = vm.createContext(sb);
vm.runInContext(read('./acidbass.js'), ctx);
vm.runInContext(read('./ui-bridge.js'), ctx);   // no window.__JUCE__, so only the mapping is set up
const M = sb.PluginMap;

test('mapping is exported without a plugin around', () => {
  assert.ok(M && typeof M.idOf === 'function' && Array.isArray(M.NONE));
});

test('three knobs use the plugin real units and round-trip', () => {
  for (const k of ['tuning', 'cutoff', 'fdec'])
    for (const v of [0, 0.25, 0.5, 0.9, 1]) assert.ok(Math.abs(M.fromPlugin(k, M.toPlugin(k, v)) - v) < 1e-9, `${k} ${v}`);
  assert.equal(M.idOf('fdec'), 'decay');
  assert.equal(M.idOf('hp'), 'hp');
});

test('the real-unit ends sit inside the plugin ranges (cutoff 60..8000, tuning -100..100, decay 0.03..2.5)', () => {
  assert.ok(M.toPlugin('cutoff', 0) >= 60 && M.toPlugin('cutoff', 1) <= 8000);
  assert.ok(Math.abs(M.toPlugin('tuning', 0) + 100) < 1e-9 && Math.abs(M.toPlugin('tuning', 1) - 100) < 1e-9);
  assert.ok(M.toPlugin('fdec', 0) >= 0.03 - 1e-9 && M.toPlugin('fdec', 1) <= 2.5);
});

test('a host value past the web knob range clamps instead of leaving 0..1', () => {
  assert.equal(M.fromPlugin('cutoff', 8000), 1);
  assert.equal(M.fromPlugin('cutoff', 10), 0);
});

test('0..1 knobs pass through untouched', () => {
  assert.equal(M.toPlugin('res', 0.3), 0.3);
  assert.equal(M.fromPlugin('drmix', 0.7), 0.7);
});

test('every web knob either has a real plugin parameter or is listed as NONE, and NONE names real knobs', () => {
  const html = read('./index.html'), cpp = read('./plugin/Source/PluginProcessor.cpp');
  const body = html.slice(html.indexOf('const KNOBDEF = ['), html.indexOf('const knobUI'));
  const keys = [...body.matchAll(/^\s*\['(\w+)', '/gm)].map((m) => m[1]);
  assert.ok(keys.length > 30, 'found the knob table');
  for (const k of keys) {
    if (M.NONE.includes(k)) continue;
    assert.ok(new RegExp(`["']${M.idOf(k)}["']`).test(cpp), `no plugin parameter "${M.idOf(k)}" for the web knob "${k}"`);
  }
  for (const k of M.NONE) assert.ok(keys.includes(k), `NONE lists "${k}" but the page has no such knob`);
});

test('the switches the bridge carries exist in the plugin', () => {
  const cpp = read('./plugin/Source/PluginProcessor.cpp');
  for (const id of ['wave', 'dron', 'drtype', 'rvon', 'dpp']) assert.ok(new RegExp(`["']${id}["']`).test(cpp), id);
});
```

- [ ] **Step 2: Run to see it fail**

```powershell
node --test ui-bridge.test.mjs
```

Expected: FAIL, `M` is undefined (the placeholder file defines nothing).

- [ ] **Step 3: Write `ui-bridge.js`**

Replace the placeholder with:

```js
// ui-bridge.js — inside the VST3 this page is only the face: the plugin makes the sound, and this file carries values
// both ways by parameter id. In a browser or Electron there is no window.__JUCE__ and the file does nothing.
// Author: Ari Klopfer / A_Development · MIT
'use strict';
(function () {
  const T = window.TB303;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  // Web knobs whose plugin parameter is in real units. Every other knob is 0..1 on both sides.
  const REAL = {
    tuning: { id: 'tuning', to: (v) => T.tuneCents(v), from: (c) => c / 200 + 0.5 },
    cutoff: { id: 'cutoff', to: (v) => T.cutoffHz(v), from: (hz) => Math.log2(Math.max(hz, 60) / 60) / 6.5 },
    fdec: { id: 'decay', to: (v) => T.decSec(v), from: (s) => Math.log(Math.max(s, 0.03) / 0.03) / Math.log(83) },
  };
  // Web knobs the plugin has no parameter for yet (envelope, gate, tempo); the page hides them inside the plugin.
  const NONE = ['tempo', 'fatk', 'fsus', 'frel', 'aatk', 'adec', 'asus', 'arel', 'gate'];
  const idOf = (key) => (REAL[key] ? REAL[key].id : key);
  const toPlugin = (key, v) => (REAL[key] ? REAL[key].to(v) : v);
  const fromPlugin = (key, x) => clamp01(REAL[key] ? REAL[key].from(x) : x);
  window.PluginMap = { NONE, idOf, toPlugin, fromPlugin };

  if (!window.__JUCE__) return;   // not inside the plugin

  // ---- hide what the plugin has no job for, and keep the page silent ----
  document.body.classList.add('plug');
  const st = document.createElement('style');
  st.textContent = '.plug .seq,.plug #midiBtn,.plug #midiIn,.plug #midiMsg,.plug #autoBtn,.plug #dFat,.plug #dSync,.plug .envc,'
    + '.plug .sect:has(#keys),.plug #steps,.plug #steps+div,.plug .sect:has(#gBank),.plug .sect:has(#run),.plug .sect:has(#song),'
    + '.plug div:has(>#io),.plug .grp:has(#swing),.plug .grp:has(#sync),.plug .grp:has(#dMs),.plug .eg:has(#envG),.plug .eg:has(#envA),.plug .kw.nop{display:none!important}';
  document.head.append(st);
  window.ensureAudio = () => {};   // the plugin makes the sound; the page never opens an audio context
  // The typing keys play notes in the web page; here they would throw (no audio context) and FL owns the keyboard anyway.
  for (const type of ['keydown', 'keyup'])
    addEventListener(type, (e) => { if (!(e.target.classList && e.target.classList.contains('knob'))) e.stopImmediatePropagation(); }, true);

  const keys = Object.keys(knobUI).filter((k) => !NONE.includes(k));
  const byId = {}; for (const k of keys) byId[idOf(k)] = k;
  for (const k of NONE) if (knobUI[k]) knobUI[k].el.parentElement.classList.add('nop');
  const DRIVE = ['soft', 'tube', 'wavefold'];
  // Controls that are not 0..1 knobs: plugin id -> [read from the page state, write into it].
  const SW = {
    wave: [() => (S.wave === 'square' ? 1 : 0), (x) => setWave(x > 0.5 ? 'square' : 'saw')],
    dron: [() => (S.drive.on ? 1 : 0), (x) => { S.drive.on = x > 0.5; paintDrive(); }],
    drtype: [() => Math.max(0, DRIVE.indexOf(S.drive.type)), (x) => { S.drive.type = DRIVE[Math.round(x)] || 'soft'; paintDrive(); }],
    rvon: [() => (S.reverb.on ? 1 : 0), (x) => { S.reverb.on = x > 0.5; paintReverb(); }],
    dpp: [() => (S.delay.pp ? 1 : 0), (x) => { S.delay.pp = x > 0.5; paintDelay(); }],
  };
  const read = (id) => (SW[id] ? SW[id][0]() : toPlugin(byId[id], S.knobs[byId[id]]));
  const ids = [...Object.keys(byId), ...Object.keys(SW)];

  import('./juce-frontend.js').then(() => {
    const backend = window.__JUCE__.backend, last = {}, active = new Set();
    const poll = () => {
      for (const id of ids) {
        const v = read(id);
        if (Math.abs(v - last[id]) > 1e-6) { last[id] = v; backend.emitEvent('set', { id, v }); }
      }
    };
    backend.addEventListener('params', (m) => {
      for (const [id, x] of Object.entries(m)) {
        if (SW[id]) SW[id][1](x);
        else if (byId[id]) { S.knobs[byId[id]] = fromPlugin(byId[id], x); paintKnob(byId[id]); }
        else continue;
        last[id] = read(id);   // what the page now holds, so the poll does not send it straight back
      }
    });
    // Drags: tell the host where a move starts and ends so it records one gesture.
    document.addEventListener('pointerdown', (e) => {
      const k = keys.find((key) => knobUI[key].el === e.target);
      if (k) { active.add(idOf(k)); backend.emitEvent('gesture', { id: idOf(k), on: true }); }
    }, true);
    const release = () => { poll(); for (const id of active) backend.emitEvent('gesture', { id, on: false }); active.clear(); };
    document.addEventListener('pointerup', release, true); document.addEventListener('pointercancel', release, true);

    S.delay.fat = false; S.delay.sync = false; paintDelay();   // phase 2 in the plugin
    for (const id of ids) last[id] = read(id);   // nothing is sent until the host has told the page its values
    setInterval(poll, 30);
    for (const b of ['envBtn', 'twBtn', 'drBtn', 'rvBtn', 'fxBtn']) $(b).click();   // show the sound panels
    backend.emitEvent('ready', {});
  });
})();
```

- [ ] **Step 4: Run to see it pass**

```powershell
node --test ui-bridge.test.mjs
```

Expected: all 7 tests pass. If "no plugin parameter" fails for a knob, the id is not in `PluginProcessor.cpp`; either the key is missing from `NONE` or `REAL`, so fix the table (not the test).

- [ ] **Step 5: Load it from the page**

In `index.html`, change the last line from `</script></body></html>` to:

```html
</script>
<script src="ui-bridge.js"></script></body></html>
```

- [ ] **Step 6: Check nothing else broke**

```powershell
node --test
bun test
```

Expected: both green; 61 tests from before plus the 7 new ones (68 in total in each runner, as long as bun picks up `ui-bridge.test.mjs`; if bun reports a different total, report the number rather than fixing it).

- [ ] **Step 7: Check the web page still works without the plugin**

Open `index.html` in the browser (Playwright, headless Edge), read the console, and confirm there are no errors and `window.PluginMap` exists but `document.body.classList.contains('plug')` is false. Save any screenshot to `C:\Users\Arikl\Desktop\screenshots`.

- [ ] **Step 8: Commit**

```powershell
git add ui-bridge.js ui-bridge.test.mjs index.html
git commit -m "Web page: ui-bridge.js carries knob values to and from the plugin by parameter id (inert outside the plugin)"
```

---

### Task 4: Wire the events in the editor

**Files:**
- Modify: `plugin/Source/Editor.cpp`

- [ ] **Step 1: Add the listeners and the push**

In `AcidEditor::AcidEditor`, extend the options chain with three listeners after `.withResourceProvider(...)`:

```cpp
               .withEventListener ("ready",   [this] (const juce::var&) { pushChanges (true); })
               .withEventListener ("set",     [this] (const juce::var& v) { bridge.setReal (v["id"].toString(), (float) (double) v["v"]); })
               .withEventListener ("gesture", [this] (const juce::var& v) { bridge.gesture (v["id"].toString(), (bool) v["on"]); }))
```

(the closing `)` of the `web (...)` initialiser moves to the end of the last line), and add `startTimerHz (30);` after `setSize (820, 720);`.

Replace the `pushChanges` stub:

```cpp
void AcidEditor::pushChanges (bool all)
{
    const auto changed = bridge.changes (all);
    if (changed.empty()) return;
    auto* o = new juce::DynamicObject();
    for (const auto& [id, v] : changed) o->setProperty (juce::Identifier (id), (double) v);
    web.emitEventIfBrowserIsVisible ("params", juce::var (o));
}
```

- [ ] **Step 2: Build and run every test**

```powershell
cmd /c plugin\build.bat
```

Expected: build succeeds, smoke ends with `0 failure(s)`.

- [ ] **Step 3: Try it in the standalone app**

Start `plugin\build\MyLilAcidBassline_artefacts\Release\Standalone\My lil acid bassline.exe`. Expected, and report each as pass or fail:
1. The page shows the main knobs, Wave, and the Envelope, Tweaks, Drive, Reverb and Delay panels already open, with no step grid, keyboard, song, MIDI or Automate.
2. Dragging Cutoff changes the readout (Hz) and the sound of a MIDI note played from the standalone app's own keyboard or a connected controller.
3. Clicking Square, Drive On or Reverb On changes the sound, and the button state stays lit.
4. No script errors: open the window with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` and read the console through Playwright's `connectOverCDP` if anything looks wrong.

Screenshot into `C:\Users\Arikl\Desktop\screenshots`.

- [ ] **Step 4: Commit**

```powershell
git add plugin/Source/Editor.cpp
git commit -m "Plugin: editor sends page changes to the parameters and host changes to the page"
```

---

### Task 5: Install, check in FL, document, close out

**Files:**
- Modify: `plugin/README.md`, `C:\Users\Arikl\.claude\artifact-roadmaps\acid-bass-roadmap\{manifest.json,report.html}`

- [ ] **Step 1: Install**

With FL closed, run the elevated install script from the session scratchpad (`install-vst3.ps1`), then confirm the installed file's hash equals the built one:

```powershell
(Get-FileHash "C:\Program Files\Common Files\VST3\My lil acid bassline.vst3\Contents\x86_64-win\My lil acid bassline.vst3").Hash
(Get-FileHash "plugin\build\MyLilAcidBassline_artefacts\Release\VST3\My lil acid bassline.vst3\Contents\x86_64-win\My lil acid bassline.vst3").Hash
```

Expected: the two hashes are equal.

- [ ] **Step 2: The user checks in FL**

Ask the user to open FL, rescan with "Rescan previously verified plugins" if the old window still shows, add the plugin and report:
1. The window shows the panels (not the slider list).
2. Dragging a knob moves it and changes the sound while a pattern plays.
3. In FL, right-click a knob's parameter (Browse parameters, link to a controller or automation clip), move it from FL, and the knob in the window follows.
4. Close and reopen the window three times; save the project, reload it, and the knobs show the saved values.
5. Two instances open together both work.

Do not mark F2 done until the user reports these.

- [ ] **Step 3: README**

In `plugin/README.md` replace the sentence "The window is still the host's generic knob list, not the web page's panel." and the "window is also still the generic list" fragment with:

```
The window is the web page's own panels inside a WebView2 (the same `index.html`), so it looks like the web version: main knobs, wave, Tweaks, Drive, Reverb, Delay and the filter decay. It needs the Microsoft WebView2 runtime, which Windows 11 includes. The step grid, keyboard, song, export, MIDI in, Automate, tempo and the other envelope knobs are not in the plugin window; notes come from FL's piano roll.
```

- [ ] **Step 4: Commit, then update the roadmap**

```powershell
git add plugin/README.md
git commit -m "Plugin README: the window is the web page"
```

Update the roadmap manifest and report only for what the user confirmed (F2 `done` with the evidence, or `in-progress` with the failing check named), republish to `https://claude.ai/artifact/N6UArogdMH4uUXNtNQTPzB`, and recopy the Desktop mirror.

- [ ] **Step 5: Merge**

Once the user confirms, merge `feat/plugin-web-ui` into `main` locally and ask before pushing.

---

## Self-review

- **Spec coverage:** the goal (real UI in the plugin, knobs both ways, host automation follows) is covered by Tasks 1, 3 and 4; the gate in Task 1 covers the main risk; F11 gaps are explicitly out of scope; roadmap F2 is closed only on user confirmation.
- **Placeholders:** none; every code step carries its code. `ui-bridge.js` is a one-line placeholder only between Task 1 Step 4 and Task 3 Step 3, on purpose, so the binary-data target can find the file.
- **Names:** `ParamBridge::{changes, setReal, gesture, endAllGestures}` are the same in the stub, the header, the tests and `Editor.cpp`. Event names `ready`, `set`, `gesture` (page to plugin) and `params` (plugin to page) match on both sides. Parameter ids come from `PluginProcessor.cpp`; `ui-bridge.test.mjs` fails if a web knob has no parameter. `PluginMap` has the same members in the test and in `ui-bridge.js`.
- **Assumption to verify in Task 4:** the web `fdec` knob is the plugin's `decay`. Both use `0.03 * 83^v` seconds at the ends (0.03 to 2.49), and the range check in the node test pins that; whether it is the same envelope stage is confirmed by ear in Task 4 Step 3 (turning Decay shortens the note's filter sweep).
