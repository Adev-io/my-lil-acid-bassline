# My lil acid bass: public release pipeline — design

Date: 2026-10-19. Branch: feat/plugin-sequencer (11 commits ahead of main). Plugin version in CMake: 0.1.0.
Scope approved in conversation: v1 = Windows only, unsigned, AGPL. GitHub Releases built by CI on tag,
merge to main, user-facing README, listings. Mac/Linux, installer, code signing: out of scope (section 8).

## 1. Goals

1. A user with FL Studio downloads one zip from GitHub Releases, copies one folder, rescans, plays. No build tools.
2. Releasing is `git tag vX.Y.Z && git push --tags`. CI builds, tests, and attaches the artefacts. No local steps.
3. The repo front page reads as a product first (what, screenshot, download, install) and a developer repo second.
4. Nothing already true changes: licences (MIT web, AGPL plugin), target names, data folders, FL plugin identity
   (`PLUGIN_CODE Ab2x`, product name "My lil acid bass").

## 2. Versioning

- Single source: `project(MyLilAcidBassline VERSION x.y.z)` in `plugin/CMakeLists.txt`. JUCE stamps it into the
  VST3 (`JucePlugin_VersionString`) and the standalone.
- The git tag must equal `v` + that version. CI fails the release job if they differ (one `grep` step), so a tag
  can never ship a binary that reports a different version.
- First public release: **1.0.0**. The sequencer, pattern bank, MIDI drag/save and web panel are in; "phase 2 in
  progress" is no longer true. Bump 0.1.0 → 1.0.0 in the same commit that refreshes the README.

## 3. CI: `.github/workflows/plugin.yml`

One workflow, two triggers:

- `push` to `main` and `pull_request` touching `plugin/**`, `index.html`, `acidbass.js`, `factory.js`,
  `ui-bridge.js`, `.github/workflows/plugin.yml`: build + smoke test only. Keeps main green.
- `push` of tag `v*`: build + smoke test + package + create GitHub Release with the zip attached.

Job `build` on `windows-latest`:

1. `actions/checkout@v4`.
2. `ilammy/msvc-dev-cmd@v1` (puts `cl` on PATH so Ninja + MSVC work; mirrors what `build.bat` does with vcvars64).
3. Cache `plugin/build/_deps` keyed on `hashFiles('plugin/CMakeLists.txt')` (JUCE 9.0.4 clone + WebView2 package,
   saves ~2 min per run). Ninja comes with the runner image.
4. `cmake -S plugin -B plugin/build -G Ninja -DCMAKE_BUILD_TYPE=Release`
5. `cmake --build plugin/build`
6. `ctest --test-dir plugin/build --output-on-failure`
7. Tag runs only: version check
   `grep -q "VERSION ${GITHUB_REF_NAME#v})" plugin/CMakeLists.txt` (bash shell step).
8. Tag runs only: package. One zip `My-lil-acid-bass-${tag}-windows-x64.zip` containing
   `My lil acid bass.vst3/` (the whole bundle folder), `My lil acid bass.exe` (standalone), `plugin/LICENSE` as
   `LICENSE-plugin.txt`, root `LICENSE` as `LICENSE-web.txt`, and a 10-line `INSTALL.txt` (the three FL steps from
   the README). `Compress-Archive` in a pwsh step.
9. Tag runs only: `softprops/action-gh-release@v2` with the zip, `generate_release_notes: true`, body prefix from
   `plugin/RELEASE-NOTES.md` if present (kept short, hand-written per release; absent = auto notes only).

Permissions: `contents: write` on the workflow (needed to create the release). No secrets needed.

Not done: macOS job, Linux job, code signing, installer. Section 8.

## 4. Repo hygiene

- Merge `feat/plugin-sequencer` → `main` with a merge commit (history keeps the plan-task commits). Done after the
  workflow is on the branch, so the first push to main runs the build job and proves CI before tagging.
- `.gitignore` already has `plugin/build/`. Add nothing.
- `.github/ISSUE_TEMPLATE/bug.md` (host, OS, plugin version, steps, expected, actual) and `feature.md`
  (what, why). Plain markdown templates, no forms YAML. `CONTRIBUTING.md`: 8 lines (build with `build.bat`,
  run the tests, PR to main, AGPL applies to `plugin/`, MIT elsewhere, no CLA).
- No `SECURITY.md`, no code of conduct, no changelog file (GitHub's generated release notes cover it).

## 5. README refresh

Root `README.md`:

- Title stays "My lil acid bassline" (the repo and the web app). Subtitle gains the plugin name:
  "…and **My lil acid bass**, the same synth as a VST3 for FL Studio and other hosts."
- New section directly under the title, before "Use it": **Download the plugin**. One link to
  `https://github.com/Adev-io/my-lil-acid-bassline/releases/latest`, the three install steps, Windows 10/11
  x64 requirement, WebView2 note, SmartScreen note ("unsigned; click More info → Run anyway"), and a screenshot
  `docs/screenshots/plugin-fl.png` (taken from FL Studio with the plugin window open, saved first to
  `C:\Users\Arikl\Desktop\screenshots\plugin-fl.png` then copied into the repo).
- "FL Studio plugin" section: drop "in progress (phase 2 …)". New text: what ships, link to `plugin/README.md`.
- License section: add one sentence: "The plugin binary embeds the MIT web files (`index.html`, `acidbass.js`,
  `factory.js`, `ui-bridge.js`) as its window; MIT code inside an AGPL binary is permitted, and the combined work
  is AGPL-3.0-or-later."

`plugin/README.md`:

- Title: "My lil acid bass: VST3 and standalone". Remove "(in progress)".
- Status paragraph rewritten from the code: voice, tweaks, drive, delay (incl. Fat, Sync if present in
  `PluginProcessor.cpp`; verify before writing), reverb, ADSRs, gate length if present, 32-step sequencer on the
  host clock, 128-slot pattern bank with factory patterns, MIDI drag and save, web panel window.
  The author of the task reads `PluginProcessor.cpp` parameter list and `Sequencer.h` and lists only what exists.
- "Install" section: link to Releases first, build from source second.
- Roadmap: item 5 "Release" becomes done for Windows; add "macOS (AU + VST3, notarised) and Linux" as the open item.
- Keep "Known differences" and "License" as they are.

## 6. Listings (after the first release exists, manual, user does the account steps)

Prepared text, not automated. One file `docs/listing.md` holds:

- 60-word and 200-word descriptions, feature bullets, system requirements, licence line, links (release, source,
  web version). Same text pasted into KVR Audio (free developer account, "Add product"), r/edmproduction or
  r/FL_Studio post, FL Studio forum (Looptalk), Bedroom Producers Blog tip form.
- The Rack version is a separate project (`project-acid-bass-vcv`) and submits to the VCV library on its own;
  one line in `docs/listing.md` points there. Not part of this spec's tasks.

## 7. Verification gate

1. Workflow file passes `actionlint` (install via `winget install rhysd.actionlint` or skip if unavailable; then
   at least a YAML parse with `python -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))"`).
2. Push branch, open PR → build job green on `windows-latest` (smoke test passes in CI). Merge.
3. Tag `v1.0.0` on main, push → release job green; release page shows the zip; download it on this PC, extract,
   hash of `My lil acid bass.vst3\Contents\x86_64-win\My lil acid bass.vst3` differs from the local build (different
   compiler path) but FL loads it: rescan, add instrument, play a note. Screenshot to
   `C:\Users\Arikl\Desktop\screenshots\plugin-release-fl.png`.
4. `README.md` download link resolves to the release.

## 8. Out of scope (v2 candidates)

- macOS: AU + VST3 universal binary, Apple developer account, notarisation. Linux: VST3 build on ubuntu-latest.
- Windows code signing (OV certificate, or Azure Trusted Signing), Inno Setup installer.
- Auto-update check inside the plugin. Donation link.

## 9. Risks

- WebView2 static linking on the runner: JUCE downloads the WebView2 NuGet package at configure time. The local
  build does this already; the runner has NuGet. If configure fails, the fallback is
  `-DJUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=0` (dynamic link, runtime present on Win11) noted in the plan.
- `ilammy/msvc-dev-cmd` picks VS 2022 on `windows-latest`; local build used whatever `vcvars64` found. Same
  toolchain family (MSVC 19.x), C++20 fine.
- Smoke test in CI has no audio device. It is headless already (console app, offline render), so no change.
- The 128-slot picker and MIDI drag use the WebView2 window; CI never opens it. The manual FL check in the gate
  covers it.
