# Presets: design

Date: 2026-10-17. Status: draft for review. Builds after [Drive, Reverb and Tweaks](2026-10-17-drive-reverb-tweaks-design.md), so presets carry every new knob from day one.

## Goal

Save and recall the settings for different instruments: a named **Sound** (the sound alone) or a named **Snapshot** (the sound plus all patterns), with four factory presets, file export and import, and nothing that can break the app.

## What a preset holds

| Kind | Contents | Loading it |
|---|---|---|
| Sound | `knobs`, `auto`, `wave`, `delay`, `drive`, `reverb`, `swing` | Replaces the sound only. Patterns, song and current pattern stay. |
| Snapshot | Everything in Sound, plus `patterns`, `song`, `cur` | Replaces the whole machine. Asks first, since it overwrites unsaved patterns. |

A preset is JSON: `{ name, kind: 'sound' | 'snapshot', state }`, where `state` is a partial state object. Every load goes through `cleanState`, so old presets open after new knobs are added (missing knobs take their neutral defaults) and hostile JSON comes out playable.

## Storage

- Browser `localStorage`, key `acidbass2.presets`: an array of user presets. Separate from the working state (`acidbass2`), so a bad preset cannot break the app.
- Factory presets are built into `acidbass.js`, are read-only and cannot be deleted. They are listed first, tagged "factory".
- A user preset with the same name as a factory preset is allowed; both are listed.
- Storage blocked or full: the panel says so and Export still works.

## Panel

A **Presets** toolbar button opens a panel:
- A list: name, a Sound or Snapshot tag, a factory marker.
- A name box and **Save Sound**, **Save Snapshot**. Saving over an existing user preset of the same name and kind asks first.
- **Load**, **Rename**, **Delete** for the selected user preset (factory presets allow Load only).
- **Export** downloads the selected preset, or all user presets if none is selected, as `.json`. **Import** reads a `.json` file. An imported name that already exists is renamed with a numeric suffix, never overwritten.
- Loading a Snapshot asks "This replaces all patterns. Load?" before applying. Loading a Sound never asks.

## Factory presets (Sound kind)

Knob values are the normalised 0..1 values stored in state; anything not listed keeps its default.

| Name | Settings |
|---|---|
| Classic 303 | All defaults, saw wave. The original sound. |
| Squelchy lead | Square wave. cutoff 0.38, res 0.78, envmod 0.8, accent 0.8, fdec 0.5, fsus 0.15. Delay mix 0.3, feedback 0.5, ping-pong. Reverb on, wet 0.2. |
| Sub bass | Square wave, pw 0.5. cutoff 0.25, res 0.2, envmod 0.25, fdec 0.45, arel 0.1, key follow 0.3. Drive on (soft), drive 0.25, mix 0.5. |
| Dub drive | Saw wave. cutoff 0.4, res 0.55, envmod 0.6. Drive on (tube), drive 0.5, mix 0.7. Delay fat and ping-pong, mix 0.35, feedback 0.6. Reverb on, wet 0.25, decay 0.7. |

## Code

- `acidbass.js` (pure, no DOM): `FACTORY_PRESETS`, `makePreset(state, kind, name)`, `applyPreset(state, preset)` returning a new cleaned state, `cleanPreset(raw)` returning a valid preset or `null`, `uniqueName(list, name)`, `presetsToJson(list)`, `presetsFromJson(text)` (never throws; returns `[]` on junk).
- `index.html`: the panel only. It calls the core and then repaints knobs, wave, delay, drive and reverb, and re-applies the live audio parameters the same way `adopt` already does.

## Testing

Node (`acidbass.test.mjs`, node and bun):
- A Sound preset applied to a state leaves `patterns`, `song` and `cur` unchanged and replaces the sound.
- A Snapshot round-trips exactly (`applyPreset(makePreset(s, 'snapshot'))` equals `s`).
- `cleanPreset` drops unknown fields, clamps knobs, and turns junk into `null`.
- Old presets without the newer knobs load with neutral defaults.
- `uniqueName` suffixes on collision; `presetsFromJson` survives malformed text.
- Each factory preset survives `cleanState` unchanged, so no listed value is out of range.

Browser (Playwright): save, reload the page, load; save over a name (asks); delete; export then import; Snapshot load asks and Cancel changes nothing.

## Out of scope

Cloud sync, preset folders or tags, morphing between presets, and the VST3 side (the plugin uses the host's preset system and the same knob names).
