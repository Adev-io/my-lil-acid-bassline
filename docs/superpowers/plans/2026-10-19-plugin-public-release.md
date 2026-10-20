# Plugin Public Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Ralph-ready: one checkbox per task, each with files, a done-when condition and a verify command.

**Goal:** A user downloads `My-lil-acid-bass-v1.0.0-windows-x64.zip` from GitHub Releases, built and tested by CI from a `v1.0.0` tag on `main`, and the README tells them how to install it.

**Architecture:** One GitHub Actions workflow builds the JUCE plugin on `windows-latest` with the same cmake/ninja/ctest steps as `plugin/build.bat`; on a `v*` tag it also zips the VST3 bundle and standalone exe and creates the release. Everything else is markdown: README refresh, issue templates, contributing, listing text. The branch merges to `main` with the workflow on it so the first push to main proves CI before the tag.

**Tech Stack:** GitHub Actions (`actions/checkout@v4`, `ilammy/msvc-dev-cmd@v1`, `actions/cache@v4`, `softprops/action-gh-release@v2`), CMake 3.22+, Ninja, MSVC, JUCE 9.0.4 via FetchContent, pwsh `Compress-Archive`.

Spec: `docs/superpowers/specs/2026-10-19-plugin-public-release-design.md`. Repo: `C:\Users\Arikl\Desktop\_Projects\my-lil-acid-bassline`, branch `feat/plugin-sequencer`. Commits use `git -c user.email=a_development@users.noreply.github.com -c user.name=A_Development commit`. Never add AI attribution. Prose in commit messages, normal English.

**Risky tasks (need per-number approval before an unattended run):** 7 (push + PR + merge to main, public), 8 (tag + public release), 9 (installs into Program Files). Tasks 1–6 only touch files on the branch.

---

### Task 1: Workflow file

**Files:**
- Create: `.github/workflows/plugin.yml`

- [ ] **Task 1: Create `.github/workflows/plugin.yml` with exactly this content**

```yaml
name: plugin

on:
  push:
    branches: [main]
    tags: ['v*']
    paths:
      - 'plugin/**'
      - 'index.html'
      - 'acidbass.js'
      - 'factory.js'
      - 'ui-bridge.js'
      - '.github/workflows/plugin.yml'
  pull_request:
    paths:
      - 'plugin/**'
      - 'index.html'
      - 'acidbass.js'
      - 'factory.js'
      - 'ui-bridge.js'
      - '.github/workflows/plugin.yml'

permissions:
  contents: write

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: ilammy/msvc-dev-cmd@v1

      - name: Cache JUCE and WebView2 downloads
        uses: actions/cache@v4
        with:
          path: plugin/build/_deps
          key: deps-${{ hashFiles('plugin/CMakeLists.txt') }}

      - name: Configure
        run: cmake -S plugin -B plugin/build -G Ninja -DCMAKE_BUILD_TYPE=Release

      - name: Build
        run: cmake --build plugin/build

      - name: Smoke test
        run: ctest --test-dir plugin/build --output-on-failure

      - name: Tag matches CMake version
        if: startsWith(github.ref, 'refs/tags/v')
        shell: bash
        run: grep -q "VERSION ${GITHUB_REF_NAME#v})" plugin/CMakeLists.txt

      - name: Package
        if: startsWith(github.ref, 'refs/tags/v')
        shell: pwsh
        run: |
          $rel = "plugin/build/MyLilAcidBassline_artefacts/Release"
          New-Item -ItemType Directory -Force pkg | Out-Null
          Copy-Item -Recurse "$rel/VST3/My lil acid bass.vst3" pkg/
          Copy-Item "$rel/Standalone/My lil acid bass.exe" pkg/
          Copy-Item plugin/LICENSE pkg/LICENSE-plugin.txt
          Copy-Item LICENSE pkg/LICENSE-web.txt
          Copy-Item plugin/INSTALL.txt pkg/INSTALL.txt
          Compress-Archive -Path pkg/* -DestinationPath "My-lil-acid-bass-${env:GITHUB_REF_NAME}-windows-x64.zip"

      - name: Release
        if: startsWith(github.ref, 'refs/tags/v')
        uses: softprops/action-gh-release@v2
        with:
          files: My-lil-acid-bass-*.zip
          generate_release_notes: true
```

Note: `on.push.paths` with a tag push: GitHub applies path filters to tag pushes too, and a tag push has no diff, so the filter is ignored and the job runs. Keep tags in the same `push` block.

- **Done when:** file exists, parses as YAML, has one job `build` with 9 steps, three steps guarded by `startsWith(github.ref, 'refs/tags/v')`.
- **Verify:**
  ```powershell
  cd C:\Users\Arikl\Desktop\_Projects\my-lil-acid-bassline
  python -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/plugin.yml')); s=d['jobs']['build']['steps']; print(len(s), sum(1 for x in s if 'if' in x))"
  ```
  Expected: `9 3`. If `yaml` module missing: `pip install pyyaml` first.
- **Commit:** `git add .github/workflows/plugin.yml && git -c user.email=a_development@users.noreply.github.com -c user.name=A_Development commit -m "CI: build and smoke-test the plugin on Windows, release a zip on v* tags"`

---

### Task 2: INSTALL.txt and version 1.0.0

**Files:**
- Create: `plugin/INSTALL.txt`
- Modify: `plugin/CMakeLists.txt:4` (`project(MyLilAcidBassline VERSION 0.1.0)` → `1.0.0`)

- [ ] **Task 2: Add `plugin/INSTALL.txt`, bump the CMake project version to 1.0.0, rebuild locally**

`plugin/INSTALL.txt` content (exact):

```
My lil acid bass - install (Windows 10/11, 64-bit)

VST3 (FL Studio, Ableton, Reaper, Bitwig, ...):
1. Copy the whole folder "My lil acid bass.vst3" to C:\Program Files\Common Files\VST3\  (needs admin).
2. FL Studio: Options > Manage plugins > Find installed plugins. Add "My lil acid bass" as an instrument.
   Other hosts: rescan plugins.
3. Play it from the piano roll. Knobs are host parameters: right-click one to automate it.

Standalone: run "My lil acid bass.exe" from anywhere. It needs a MIDI keyboard or the on-screen keys.

The window uses WebView2, which ships with Windows 11. Windows 10 without it: install the Evergreen runtime
from Microsoft (search "WebView2 runtime").

The files are not code-signed. If SmartScreen warns, choose More info > Run anyway.

Source and licence (AGPL-3.0-or-later): https://github.com/Adev-io/my-lil-acid-bassline
```

CMake edit, line 4: `project(MyLilAcidBassline VERSION 1.0.0)`.

Rebuild (from PowerShell, absolute path, the relative form fails):
```powershell
cmd /c "\"C:\Users\Arikl\Desktop\_Projects\my-lil-acid-bassline\plugin\build.bat\" < nul"
```

- **Done when:** INSTALL.txt exists with the text above; CMake line 4 reads `VERSION 1.0.0`; build.bat exits 0 and ctest reports `100% tests passed`; the built VST3's `moduleinfo.json` says version `1.0.0`.
- **Verify:**
  ```powershell
  cd C:\Users\Arikl\Desktop\_Projects\my-lil-acid-bassline
  Select-String -Path plugin/CMakeLists.txt -Pattern 'VERSION 1\.0\.0\)' | Measure-Object | % Count
  Select-String -Path 'plugin/build/MyLilAcidBassline_artefacts/Release/VST3/My lil acid bass.vst3/Contents/Resources/moduleinfo.json' -Pattern '"Version": "1\.0\.0' | Measure-Object | % Count
  Test-Path plugin/INSTALL.txt
  ```
  Expected: `1`, `1`, `True`.
- **Commit:** `git add plugin/INSTALL.txt plugin/CMakeLists.txt && git -c user.email=a_development@users.noreply.github.com -c user.name=A_Development commit -m "Plugin 1.0.0: version bump and the install sheet that ships in the release zip"`

---

### Task 3: plugin/README.md refresh

**Files:**
- Modify: `plugin/README.md` (whole file replaced)

Facts verified in code 2026-10-19 (`plugin/Source/PluginProcessor.cpp` parameter list, `Sequencer.h`, `Editor.cpp`): in the plugin = voice (8 params), tweaks (HP, Key Follow, Min Decay, PW, LFO Rate, LFO>PW), filter + amp ADSR, drive (on, type, drive, HP, tone, volume, mix), delay (time, feedback, mix, tone, stereo, ping-pong), reverb (on, pre-delay, size, decay, hi damp, low cut, hi cut, width, dry, wet), sequencer (on, swing, gate length, 32 steps on the host clock), 128-slot pattern bank with factory patterns and Restore, MIDI drag and Save MIDI, web page as the window. Not in the plugin: delay Fat, tempo Sync.

- [ ] **Task 3: Replace `plugin/README.md` with this content**

```markdown
# My lil acid bass: VST3 and standalone

**by A_Development**

The web version's sound as a real plugin: a monophonic acid bass instrument with its own 32-step sequencer, for FL Studio and any other VST3 host, plus a standalone app. Every knob is a host parameter you can automate. The window is the web page's panel.

## Download

Windows 10/11, 64-bit: **[latest release](https://github.com/Adev-io/my-lil-acid-bassline/releases/latest)**. The zip holds the VST3 bundle, the standalone exe, the licences and an install sheet.

## Install in FL Studio

1. Copy the whole folder `My lil acid bass.vst3` to `C:\Program Files\Common Files\VST3\` (needs admin).
2. **Options > Manage plugins**, then **Find installed plugins**. Add **My lil acid bass** as an instrument.
3. Play it from the piano roll, or turn the sequencer on and press play in FL. To automate a knob, right-click it in the plugin panel.

The files are not code-signed: if SmartScreen warns, choose **More info > Run anyway**. The window uses WebView2 (ships with Windows 11; Windows 10 may need the Evergreen runtime from Microsoft).

## What it has

| | |
|---|---|
| Voice | PolyBLEP saw or square into a 24 dB resonant lowpass, soft-clipped output. Tuning, Cutoff, Resonance, Env Mod, Decay, Accent, Volume, Waveform |
| Tweaks | HP, Key Follow, Min Decay, Pulse Width, LFO Rate, LFO to PW |
| Envelopes | Filter attack, decay (the Decay knob), sustain, release; amp attack, decay, sustain, release |
| Drive | On, type (soft, tube, wavefold), drive, HP, tone, volume, mix. 4x oversampled |
| Delay | Time, feedback, mix, tone, stereo, ping-pong |
| Reverb | On, pre-delay, size, decay, hi damp, low cut, hi cut, width, dry, wet |
| Sequencer | 32 steps on the host clock: note, octave, accent, slide, rest, tie. Swing and gate length. Starts and stops with the host transport |
| Patterns | 128 slots. The web version's factory patterns fill them; your edits are kept per slot, with Restore to get the factory one back |
| MIDI | Notes play the voice; velocity 110 or more is an accent; overlapping notes slide. Drag the current pattern out as MIDI, or Save MIDI to `Documents\A_Development\MyLilAcidBassline\midi` |
| Host | All knobs 0..1 and automatable, named like the web app's. State saves with the project. Pattern edits also save to `Documents\A_Development\MyLilAcidBassline\bank.json` |

Not in the plugin: the delay's Fat mode and tempo Sync (the web version has them).

## Build from source

Needs CMake, Ninja, and Visual Studio (or the free Build Tools) with the "Desktop development with C++" workload.

```
plugin\build.bat
```

It fetches JUCE 9.0.4, builds the VST3 and the standalone, and runs a headless smoke test that plays MIDI through the real processor and checks the audio (pitch, release, cutoff, envelope, accent, slide, saved state). Output: `plugin\build\MyLilAcidBassline_artefacts\Release\VST3\My lil acid bass.vst3` and `...\Standalone\My lil acid bass.exe`.

CI (`.github/workflows/plugin.yml`) runs the same steps on every push to `main`; a `vX.Y.Z` tag that matches the version in `CMakeLists.txt` also publishes the release zip.

## Roadmap

1. Voice, parameters, MIDI, slide, accent, state: done.
2. Envelopes, gate length, sequencer, pattern bank, web panel window: done.
3. Windows release on GitHub: done.
4. Delay Fat and tempo Sync.
5. macOS (AU + VST3, notarised) and Linux builds; Windows code signing.

## Known differences

- The plugin's reverb tail is about 0.45x the web page's tail level for a similar note (rms 0.0051 vs 0.0114). Likely cause: `Normalise::yes` on the impulse response versus WebAudio's normalisation. Not tuned yet.

## License

This folder is **AGPL-3.0-or-later** (see [LICENSE](LICENSE)), because it links the [JUCE](https://juce.com) framework under JUCE's open-source AGPLv3 option. In practice: you can use, change and share it freely, but anyone you give the plugin to must be able to get its source under the same license. Selling it as closed source would need a commercial JUCE licence instead.

The plugin binary embeds the MIT web files (`index.html`, `acidbass.js`, `factory.js`, `ui-bridge.js`) as its window. MIT code inside an AGPL binary is permitted; the combined work is AGPL-3.0-or-later. The rest of this repository stays MIT.
```

- **Done when:** file contains the strings `releases/latest`, `128 slots`, `Not in the plugin: the delay's Fat mode and tempo Sync` and does not contain `in progress` or `phase 2`.
- **Verify:**
  ```powershell
  cd C:\Users\Arikl\Desktop\_Projects\my-lil-acid-bassline
  (Select-String plugin/README.md -Pattern 'releases/latest','128 slots','Fat mode and tempo Sync' | Measure-Object).Count
  (Select-String plugin/README.md -Pattern 'in progress','phase 2' | Measure-Object).Count
  ```
  Expected: `3` then `0`.
- **Commit:** `git add plugin/README.md && git -c user.email=a_development@users.noreply.github.com -c user.name=A_Development commit -m "Plugin README: download and install first, feature table matches the code, roadmap updated"`

---

### Task 4: Root README refresh and screenshot

**Files:**
- Modify: `README.md` (title block, new Download section, "FL Studio plugin" section, License section)
- Create: `docs/screenshots/plugin-fl.png`

- [ ] **Task 4: Root README: plugin download section, screenshot, licence sentence**

Screenshot first. FL Studio open with My lil acid bass window visible (the plugin is installed from the earlier session). Capture the plugin window region to `C:\Users\Arikl\Desktop\screenshots\plugin-fl.png` (Win+Shift+S then save, or any capture tool with that explicit path), then:
```powershell
New-Item -ItemType Directory -Force C:\Users\Arikl\Desktop\_Projects\my-lil-acid-bassline\docs\screenshots | Out-Null
Copy-Item C:\Users\Arikl\Desktop\screenshots\plugin-fl.png C:\Users\Arikl\Desktop\_Projects\my-lil-acid-bassline\docs\screenshots\plugin-fl.png
```
If FL cannot be opened unattended, use the standalone `plugin\build\MyLilAcidBassline_artefacts\Release\Standalone\My lil acid bass.exe` window instead; same file name.

Edits to `README.md`:

1. Replace the paragraph starting `A 303-style acid bass synth and 32-step sequencer that runs in your browser, with a native VST3 for FL Studio in progress.` with:
```markdown
A 303-style acid bass synth and 32-step sequencer that runs in your browser (one page, no install, no build, no dependencies), and **My lil acid bass**, the same synth as a VST3 and standalone for FL Studio and other hosts.
```
2. Insert directly before the `## Use it` heading:
```markdown
## Download the plugin

![My lil acid bass in FL Studio](docs/screenshots/plugin-fl.png)

**[Latest release](https://github.com/Adev-io/my-lil-acid-bassline/releases/latest)**, Windows 10/11 64-bit. Unzip, then:

1. Copy the whole folder `My lil acid bass.vst3` to `C:\Program Files\Common Files\VST3\` (needs admin).
2. FL Studio: **Options > Manage plugins > Find installed plugins**. Add **My lil acid bass** as an instrument. Other hosts: rescan.
3. Play it from the piano roll, or turn its sequencer on and press play.

Not code-signed: if SmartScreen warns, **More info > Run anyway**. The window needs WebView2 (built into Windows 11). Details, build-from-source and licence: [plugin/README.md](plugin/README.md).
```
3. Replace the whole `## FL Studio plugin` section body (the one paragraph under that heading) with:
```markdown
[`plugin/`](plugin/) is the native version, built on JUCE: the voice, tweaks, drive, delay, reverb and envelopes, the 32-step sequencer on the host clock, a 128-slot pattern bank, MIDI drag-out, and the web page as its window. Download above; see [plugin/README.md](plugin/README.md) for the feature table and how to build it.
```
4. In `## License`, after the AGPL paragraph, add:
```markdown
The plugin binary embeds the MIT web files (`index.html`, `acidbass.js`, `factory.js`, `ui-bridge.js`) as its window. MIT code inside an AGPL binary is permitted; the combined work is AGPL-3.0-or-later.
```

- **Done when:** README has a `## Download the plugin` heading before `## Use it`, references `docs/screenshots/plugin-fl.png`, the PNG exists and is larger than 20 KB, and the strings `in progress` and `phase 2` are gone.
- **Verify:**
  ```powershell
  cd C:\Users\Arikl\Desktop\_Projects\my-lil-acid-bassline
  $t = Get-Content README.md -Raw
  ($t.IndexOf('## Download the plugin') -gt 0) -and ($t.IndexOf('## Download the plugin') -lt $t.IndexOf('## Use it'))
  (Get-Item docs/screenshots/plugin-fl.png).Length -gt 20000
  (Select-String README.md -Pattern 'in progress','phase 2' | Measure-Object).Count
  ```
  Expected: `True`, `True`, `0`.
- **Commit:** `git add README.md docs/screenshots/plugin-fl.png && git -c user.email=a_development@users.noreply.github.com -c user.name=A_Development commit -m "README: plugin download and install at the top, screenshot, licence note on the embedded web files"`

---

### Task 5: Contributor hygiene

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug.md`, `.github/ISSUE_TEMPLATE/feature.md`, `CONTRIBUTING.md`

- [ ] **Task 5: Issue templates and CONTRIBUTING.md**

`.github/ISSUE_TEMPLATE/bug.md`:
```markdown
---
name: Bug
about: Something is wrong in the web app or the plugin
labels: bug
---

**Where:** web app / plugin VST3 / plugin standalone
**Host and OS:** (e.g. FL Studio 2024, Windows 11)
**Plugin version:** (release zip name, or `git log -1` if built from source)

**Steps:**
1.

**Expected:**

**Actual:**
```

`.github/ISSUE_TEMPLATE/feature.md`:
```markdown
---
name: Feature
about: Something the synth or sequencer should do
labels: enhancement
---

**What:**

**Why (what you are trying to make):**
```

`CONTRIBUTING.md`:
```markdown
# Contributing

- Web app: `bun test` (or `node --test`) must pass. `acidbass.js` is the pure half and is where the tests live.
- Plugin: `plugin\build.bat` builds and runs the smoke test; it must pass. CI runs the same on every PR.
- Open a pull request against `main`. Small, described changes merge fastest.
- Licences: `plugin/` is AGPL-3.0-or-later, everything else MIT. By contributing you agree your change is under the licence of the folder it lands in. No CLA.
- Keep the clean-room rule: no code or assets copied from other plugins.
```

- **Done when:** all three files exist, each issue template has a `name:` front-matter line.
- **Verify:**
  ```powershell
  cd C:\Users\Arikl\Desktop\_Projects\my-lil-acid-bassline
  (Select-String .github/ISSUE_TEMPLATE/*.md -Pattern '^name:' | Measure-Object).Count; Test-Path CONTRIBUTING.md
  ```
  Expected: `2`, `True`.
- **Commit:** `git add .github/ISSUE_TEMPLATE CONTRIBUTING.md && git -c user.email=a_development@users.noreply.github.com -c user.name=A_Development commit -m "Issue templates and a short contributing guide"`

---

### Task 6: Listing text

**Files:**
- Create: `docs/listing.md`

- [ ] **Task 6: Write `docs/listing.md` with the copy for KVR, Reddit, the FL forum and BPB**

```markdown
# Listing copy for My lil acid bass

Paste as-is. Links: release https://github.com/Adev-io/my-lil-acid-bassline/releases/latest · source https://github.com/Adev-io/my-lil-acid-bassline · web version https://adev-io.github.io/my-lil-acid-bassline/

## 60 words

My lil acid bass is a free, open-source 303-style bass synth with a built-in 32-step sequencer, as a VST3 and standalone for Windows. Saw or square into a resonant 24 dB lowpass, accent, slide, drive, delay, reverb, filter and amp ADSR, 128 pattern slots, MIDI drag-out. Every knob automatable. AGPL-3.0, built on JUCE. Also runs in your browser.

## 200 words

My lil acid bass is a free, open-source acid bass instrument for Windows (VST3 and standalone) by A_Development. It started as a one-page web synth and keeps that panel as its plugin window.

The voice is a 303-style monosynth: saw or square (with pulse width and an LFO on it) into a resonant 24 dB lowpass, a filter envelope with Env Mod, Accent that boosts level and shortens the decay, and Slide that glides pitch without retriggering. Both the filter and the amp have full ADSR. Tweaks include a high-pass, key follow and a decay floor.

After the voice: a drive stage (soft, tube or wavefold, 4x oversampled), a stereo delay with ping-pong, and a generated stereo room reverb.

The 32-step sequencer runs on the host clock with per-step note, octave, accent, slide, rest and tie, plus swing and gate length. 128 pattern slots come filled with factory patterns; your edits are kept per slot. Drag the current pattern out as a MIDI clip.

Every knob is a host parameter you can automate. The plugin is AGPL-3.0-or-later and built on JUCE 9; the source, the web version and the build script are on GitHub.

## Feature bullets

- 303-style voice: saw/square, 24 dB resonant lowpass, accent, slide
- Filter and amp ADSR, high-pass, key follow, pulse width LFO
- Drive (soft, tube, wavefold), stereo ping-pong delay, stereo reverb
- 32-step sequencer on the host clock, swing, gate length
- 128 pattern slots with factory patterns, MIDI drag-out
- All knobs automatable; state saves with the project
- Free, AGPL-3.0, source on GitHub; web version in any browser

## System requirements

Windows 10/11 64-bit, a VST3 host (FL Studio, Ableton Live, Reaper, Bitwig, Cubase, ...) or none for the standalone. WebView2 runtime (included in Windows 11).

## Where to post

- KVR Audio: developer account, Products > Add product, category Instrument / Synth, price Free, licence Open source.
- Reddit: r/FL_Studio, r/edmproduction (follow the self-promotion rules: one post, link to GitHub, answer comments).
- Image-Line forum: Looptalk, "free plugin" thread.
- Bedroom Producers Blog: tip form on the site.
- VCV Rack version: separate project, submits to the VCV Library on its own.
```

- **Done when:** file exists, contains the headings `## 60 words`, `## 200 words`, `## Where to post`.
- **Verify:**
  ```powershell
  (Select-String C:\Users\Arikl\Desktop\_Projects\my-lil-acid-bassline\docs\listing.md -Pattern '^## (60 words|200 words|Where to post)' | Measure-Object).Count
  ```
  Expected: `3`.
- **Commit:** `git add docs/listing.md && git -c user.email=a_development@users.noreply.github.com -c user.name=A_Development commit -m "Listing copy for KVR, Reddit, the FL forum and BPB"`

---

### Task 7: Push, PR, CI green, merge to main (RISKY: public)

**Files:** none edited.

- [ ] **Task 7: Push the branch, open the PR, wait for the `plugin` workflow to pass, merge with a merge commit**

```powershell
cd C:\Users\Arikl\Desktop\_Projects\my-lil-acid-bassline
git push -u origin feat/plugin-sequencer
gh pr create --base main --head feat/plugin-sequencer --title "Plugin 1.0.0: sequencer, pattern bank, MIDI drag, release pipeline" --body "Brings the plugin sequencer branch to main with the GitHub Actions workflow that builds, smoke-tests and (on a v* tag) releases the Windows zip. README refreshed for users."
gh run watch --exit-status   # follow the CI run; exits non-zero on failure
```
If the Configure step fails on WebView2 (NuGet download), add `-DJUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=0` to the Configure step in `.github/workflows/plugin.yml`, commit, push, re-watch. Log the change under the task.

Then:
```powershell
gh pr merge --merge --delete-branch=false
git checkout main && git pull
```

- **Done when:** `gh run list --workflow plugin --limit 1` shows `completed success` on the PR run; `main` contains commit `06ba8df` (the spec) and the workflow file.
- **Verify:**
  ```powershell
  cd C:\Users\Arikl\Desktop\_Projects\my-lil-acid-bassline
  gh run list --workflow plugin --limit 1 --json status,conclusion -q '.[0] | .status + " " + .conclusion'
  git branch --contains 06ba8df | Select-String ' main$|^\* main' | Measure-Object | % Count
  ```
  Expected: `completed success`, `1`.
- **Commit:** none (merge commit created by GitHub).

---

### Task 8: Tag v1.0.0, release (RISKY: public)

**Files:** none edited.

- [ ] **Task 8: Tag `v1.0.0` on main, push the tag, watch the release job, confirm the zip is attached**

```powershell
cd C:\Users\Arikl\Desktop\_Projects\my-lil-acid-bassline
git checkout main && git pull
git tag -a v1.0.0 -m "My lil acid bass 1.0.0: first public Windows release"
git push origin v1.0.0
gh run watch --exit-status
gh release view v1.0.0 --json assets -q '.assets[].name'
```

- **Done when:** the release `v1.0.0` exists with exactly one asset named `My-lil-acid-bass-v1.0.0-windows-x64.zip`.
- **Verify:**
  ```powershell
  gh release view v1.0.0 -R Adev-io/my-lil-acid-bassline --json assets -q '.assets[].name'
  ```
  Expected: `My-lil-acid-bass-v1.0.0-windows-x64.zip`.
- **Commit:** none.

---

### Task 9: Install the released zip and play it (RISKY: writes Program Files)

**Files:** none in repo. Screenshot `C:\Users\Arikl\Desktop\screenshots\plugin-release-fl.png`.

- [ ] **Task 9: Download the release zip, replace the installed VST3 with it, FL rescan, play a note, screenshot**

```powershell
$d = "C:\Users\Arikl\AppData\Local\Temp\acidbass-release"; Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue; New-Item -ItemType Directory $d | Out-Null
gh release download v1.0.0 -R Adev-io/my-lil-acid-bassline -D $d
Expand-Archive "$d\My-lil-acid-bass-v1.0.0-windows-x64.zip" "$d\x"
Get-ChildItem -Recurse "$d\x" | Select-Object FullName
# admin: replace the installed bundle
Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile","-Command","Remove-Item -Recurse -Force 'C:\Program Files\Common Files\VST3\My lil acid bass.vst3'; Copy-Item -Recurse '$d\x\My lil acid bass.vst3' 'C:\Program Files\Common Files\VST3\'" -Wait
```
Then in FL Studio: Options > Manage plugins > Find installed plugins; add My lil acid bass; play a note; screenshot the window to `C:\Users\Arikl\Desktop\screenshots\plugin-release-fl.png`. Also run `"$d\x\My lil acid bass.exe"` once to confirm the standalone opens.

- **Done when:** the installed VST3 binary hash equals the zip's; FL shows the plugin version 1.0.0 in its wrapper (or `moduleinfo.json` in the installed bundle says 1.0.0); the screenshot exists.
- **Verify:**
  ```powershell
  (Get-FileHash 'C:\Program Files\Common Files\VST3\My lil acid bass.vst3\Contents\x86_64-win\My lil acid bass.vst3').Hash -eq (Get-FileHash "C:\Users\Arikl\AppData\Local\Temp\acidbass-release\x\My lil acid bass.vst3\Contents\x86_64-win\My lil acid bass.vst3").Hash
  Select-String 'C:\Program Files\Common Files\VST3\My lil acid bass.vst3\Contents\Resources\moduleinfo.json' -Pattern '"Version": "1\.0\.0' | Measure-Object | % Count
  Test-Path C:\Users\Arikl\Desktop\screenshots\plugin-release-fl.png
  ```
  Expected: `True`, `1`, `True`.
- **Commit:** none.

---

## After the plan

- User posts the listing copy from `docs/listing.md` (accounts are the user's).
- Memory: update `project-acid-bass-vcv.md` or a new `project-acid-bass-plugin.md` with the release URL and the tag-to-release process.
- v2 candidates stay in the spec section 8 (macOS, Linux, signing, installer).
