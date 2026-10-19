# Plugin pattern bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** 128 pattern slots in the plugin: 64 factory bass patterns (funk, disco, house, tech house, melodic), 64 empty, all overwritable, Restore for factory slots, edits kept in the project and a user bank file.

**Architecture:** see `docs/superpowers/specs/2026-10-19-plugin-pattern-bank-design.md`. Factory patterns are page-side (`factory.js`, step notation). The processor keeps the current pattern (existing `pattern`/`audioPattern`), `cur`, and an override map, persisted to project state and a user file. One shared event contract:

- page to plugin, `pattern` `{ json, slot, base }`: select slot `slot`, its content is `json`; `base` is true when the content equals the factory pattern (or empty for slots 64+). Plugin: `cur = slot`, `pattern = json`; if `base` remove `overrides[slot]` else set it; bump `bankRev`; write the user file.
- plugin to page, `bank` `{ cur, overrides: { "<slot>": "<pattern json>" } }`: sent on `ready` and whenever `bankRev` changed by something other than the page's own `pattern` event (state restore). Replaces the old plugin-to-page `pattern` event.

Existing facts: step notation (`acidbass.js` `parsePattern`): `-` rest, `=` tie, `C C# D .. B` note, `C'` high C, `^`/`_` octave up/down, `*` accent, `~` slide, space separated, up to 32 tokens. `T.cleanPattern`, `T.emptyPattern`, `T.parsePattern`, `T.SLOTS=32` live in `acidbass.js`; `ui-bridge.js` is the plugin-only layer; `plugin\build.bat` must be run from PowerShell with stdin from nul (it hangs in the Bash tool); count smoke checks with `ctest --test-dir plugin\build -V`. Commit messages plain prose. Do not run the Standalone with the WebView2 debug flag while FL64 runs. Only `git add` your own task's files (another task may run in parallel).

---

### Task 1: `factory.js` and its test (JS only; touches `factory.js`, `factory.test.mjs`, and the embed/script-tag wiring)

- [ ] Create `factory.js` exposing a global `TB303Factory = { list: [{ name, steps }, ...64] }` (and `module.exports` the same way `acidbass.js` does). `name` is "Funk 01".."Funk 13", "Disco 01".."Disco 13", "House 01".."House 13", "Tech House 01".."Tech House 12", "Melodic 01".."Melodic 13" in that order (64 total). `steps` is the step notation string.
- [ ] Musical brief: TB-303 acid bass lines, base pitch C2 (note 0 = C, `_` goes an octave down, `^` up). Every pattern is different (no duplicates, vary the root note across C, D#, F, G, A, etc.), has a clear groove, uses a mix of accent `*`, slide `~`, rests `-` and ties `=` as the genre calls for, and loops cleanly.
  - Funk: syncopated 16ths, ghost rests, octave pops, chromatic walk-ups, mostly 16 steps.
  - Disco: driving octave bass (root-octave-root-octave, offbeat octave jumps), 16 steps.
  - House: simple offbeat bass (rest on the beat, note on the "and"), one or two notes repeating, a few slides, 16 steps.
  - Tech house: minimal, rolling 16ths on one note with accent moves, a variation in the second bar for some (32 steps), filtered-groove feel.
  - Melodic: scale-based riffs (minor, dorian, phrygian), longer phrases up to 32 steps, slides and ties for legato, a clear hook.
- [ ] Test `factory.test.mjs` in the style of the existing `*.test.mjs` (read them first; must pass under `bun test` and `node --test`): 64 entries, correct names and per-style counts, every `steps` parses with `T.parsePattern` without throwing, length between 8 and 32, at least 4 sounding notes each, all 64 `steps` strings distinct, `formatPattern(parsePattern(x))` round trips.
- [ ] Wiring: find how `ui-bridge.js` is included in `index.html` and embedded for the plugin (`juce_add_binary_data(AcidUi ...)` in `plugin/CMakeLists.txt`, plus the resource provider in `plugin/Source/Editor.cpp`); add `factory.js` the same way, loaded before `ui-bridge.js`. Do not change other behaviour.
- [ ] Run `node --test` and `bun test`; all green. Commit: `Factory bass patterns: 64 lines in five styles`.

### Task 2: Processor bank, persistence, editor events (C++; touches `plugin/Source/PluginProcessor.*`, `plugin/Source/Editor.*`, `plugin/Tests/smoke.cpp`)

- [ ] Smoke checks first (existing style), they must fail before the code exists: after `setPatternSlot(5, json, false)` the `getBankJson()` contains slot 5, `getCurSlot()==5` and `getPatternJson()` equals json; `setPatternSlot(5, base, true)` removes the override; a state save then `setStateInformation` into a fresh processor restores `cur`, overrides and the playing pattern; `setBankFile(tmp)` then edits write the file, and a fresh processor with `setBankFile(sameTmp)` sees the overrides; project overrides win over the file for the same slot; `bankRev()` increments on every change; garbage JSON in the file or state does not crash and leaves an empty bank.
- [ ] Implement in the processor: `int getCurSlot() const`, `juce::String getBankJson() const` (`{"cur":n,"overrides":{"5":"<pattern json string>"}}`), `void setPatternSlot (int slot, const juce::String& json, bool base)` (slot clamped 0..127; under `patternLock`; the editor uses it instead of `setPatternJson`; keep `setPatternJson` working for the existing tests by routing it to the current slot as a non-base edit), `int bankRev() const` (atomic), `void setBankFile (const juce::File&)` (loads the file as the initial overrides; the constructor calls it with `userApplicationDataDirectory/A_Development/MyLilAcidBassline/bank.json`; saving creates the directory; write only when overrides change; write failures are ignored). Project state gets a `bank` property (the `getBankJson()` string) next to the existing `pattern` property; `setStateInformation` restores `cur` and overrides from it (project wins per slot over the file), then restores `pattern`. Tests must call `setBankFile` with a temp file before any edit, so they never write the real user file.
- [ ] Editor: the `pattern` listener reads `{ json, slot, base }` and calls `setPatternSlot`, then records the rev so it is not echoed back; `pushChanges` emits `bank` (payload: `cur` and `overrides` as an object of slot to pattern JSON string) when `bankRev()` differs from the last sent, and on `ready`; drop the old plugin-to-page `pattern` emission.
- [ ] `plugin\build.bat` green (the existing 104 checks still pass plus the new ones). Commit: `Plugin: pattern bank with project and user file persistence`.

### Task 3: Page slot picker, bank sync, Restore (touches `ui-bridge.js`, `ui-bridge.test.mjs`, and `plugin/Source/Editor.cpp` only for window sizing if needed)

- [ ] In plugin mode (inside the existing `window.__JUCE__` branch): extend `S.patterns` to 128 (`T.emptyPattern()` for the new ones); build `base[i]` (slot i < 64 from `TB303Factory.list[i].steps` via `T.parsePattern`, else `T.emptyPattern()`); name function: slot < 64 gives `NN ` + factory name, else `NN User`; override `T.slotName` with it.
- [ ] Hide the old `gBank/gGroup/gSlot` groups in the injected CSS; add a slot picker in their place: prev button, next button, a `<select>` of 128 entries (`07 Funk 07` / `70 User`), and a Restore button (title: "put this slot back to its factory pattern, or clear it"). Choosing a slot sets `S.cur`, repaints (`paintSteps`) and sends a `pattern` event `{ json, slot, base }` for it. Restore sets `S.patterns[S.cur]` to a copy of `base[S.cur]` and sends the same event with `base: true`.
- [ ] The existing change poll now emits `{ json, slot: S.cur, base: json === JSON.stringify(base[S.cur]) }`. Handle the new plugin-to-page `bank` event: reset all 128 slots to `base`, apply `overrides` (each through `T.cleanPattern(JSON.parse(...))`), set `S.cur = cur`, set `lastPat`, repaint, update the picker. Remove the old plugin-to-page `pattern` handler.
- [ ] Unit tests in `ui-bridge.test.mjs` for any pure helpers you add (slot name, base comparison); keep the existing 70 tests green (`node --test` and `bun test`).
- [ ] Prove in the Standalone (first check FL64 is not running; if it is, stop and report): after `plugin\build.bat`, using the debug flag and CDP as in earlier tasks: slot 1 shows the "Funk 01" pattern; pick slot 20 (a Disco one) and it shows; edit a step; reload the page and the edit survives while an untouched slot still shows its factory pattern; Restore returns the factory pattern and a reload still shows it; pick slot 70 (empty), write a step, reload, it persists. Delete the test bank file afterwards (`%APPDATA%\A_Development\MyLilAcidBassline\bank.json`) and close the app. Screenshots via PrintWindow from a DPI-aware process into `C:\Users\Arikl\Desktop\screenshots`. If the window height no longer fits, refit `NAT_H` and the editor size.
- [ ] Commit: `Plugin window: 128-slot picker with factory patterns and Restore`.

### Task 4 (controller): install, FL check, docs, roadmap, merge.
