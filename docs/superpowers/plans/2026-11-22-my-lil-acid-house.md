# My lil acid house rack: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Ari listens after every task and says keep or adjust; the next task starts only after a keep.

**Goal:** Build a melodic, dynamic Chicago acid house patch (124 bpm, A minor) out of the My lil modules, live in Rack, one section per task.

**Architecture:** A small Bun helper (`ah.mjs`) wraps the Rack MCP's HTTP endpoint and finds modules, ports and params by name, so no id is hard-coded. A runner (`build.mjs`) holds one `apply` function and one `check` function per step. Music data (Roll chord text, Acid Bass steps, Drums rows, Slider values) is generated in code from note names, so every note is checkable.

**Tech Stack:** Bun, `tools/rack.mjs` (existing `rack()` JSON-RPC client), My lil MCP 2.0.0 at `http://127.0.0.1:2600/mcp`, Rack 2.

Spec: `docs/superpowers/specs/2026-11-22-my-lil-acid-house-design.md`

---

## Changes from the spec (found while reading the module sources)

| Spec said | Plan does | Why |
|---|---|---|
| Kick alone on strip 1, rest on strip 2 | Strip 1 = Drums mix. Drums pad 1 (kick) goes to Mixer SC only | Drums mix output always contains the kick; a separate kick strip would double it |
| Strips 3-6 | Strips 2 acid, 3 answer acid, 4 chords, 5 hook | One strip fewer after the drums change |
| 16-step hook on Slider A | 8-step hook motif on Slider A, 8-step answer on Slider B | Slider A and B are 8 steps each; chaining them would use both |
| Ride and shaker | Closed hat 16ths at low velocity as the shaker; open hat on offbeats; no ride | The Drums kit has kick, snare, chat, ohat, clap, rim, tom, crash only |
| Swing 54 percent | Left out of the build; add by ear after s9 if wanted | Drums has no swing param; Clocked swing is not needed to prove the song |
| Transit with 4 scenes | Two Transits scripted over the MCP (see "As built"), plus a `scene()` function | Transit's mappings and slot values are plain saved state, so no mouse mapping is needed |

## As built (2026-11-22): what changed after the tasks below were written

The tasks below are the first design. The build, run live with Ari listening after every step, changed them like this. `build.mjs` is the source of truth; the saved patches are `my-lil-acid-house-s1-clock` ... `s9-transit-levels`.

| Step | Tasks below said | Built |
|---|---|---|
| layout | not mentioned | `vcvrack_set_layout_preferences` to 260 HP x 8 rows before adding modules; the default box refused the 21st module |
| s1 | Clocked params by guessed names | Exact names: `Master clock` (a regex on bpm hit `Bpm mode prev`), `Clk 1 ratio` is numeric (value 5 shows "4"), Run is a toggle |
| s3 | Acid slot per scene | Acid sits at A2 and above, over a new sub bass (Roll #0 + Triple #0, strip 6, roots A F C G, D E F G) |
| s4 | 4-bar chords, one pattern | 8-bar progression Am9 Fmaj7#11 Cmaj9 G6/9 / Dm9 Em11 Fmaj9 G6/9, rootless voicings; chords muted in the groove (Ari: the stab is a distraction); ambient pads (Roll #2) and a sine arp with a dotted-8th delay (Roll #3) added |
| s5 | Slider A hook through Harmony | Hook is an 8-bar composed melody on a Roll (Roll #4) through Harmony (solo, glide 0) into Triple #4; velocity shapes each phrase and opens the filter (VCA-1 into Cutoff CV, filter envelope bloom). Slider A is not used |
| s6 | Slider B into Arpeggio into AcidVoice | A second AcidBass (answer acid), an octave up, playing only in the lead's rests; Mutate from Ripple B |
| s7 | Ripple ENV into the stab Filter | Ripple generator B (period 6) ducks the pads and C (period 10) ducks the arp through two My lil Duck modules in trigger mode; Ripple A mutates the lead acid; the chord Roll's end-of-loop undoes the mutations. The first try (3 and 5) was too busy. R' is "every tick R did not fire", so it was not used |
| s8 | Reverb on send 2 | AS ReverbStereoFx, then a third Duck keyed by the kick audio, into Return 2. Send knobs are not linear: 0.2 to 0.5 left the tail at -37 dB RMS; 0.6 to 1.0 gives about -23 |
| s9 | `scene()` only | Two Transits (instant for patterns and Harmony snap; morph, about one bar, for mutes, cutoffs, sends and master level) written over the MCP, plus `scene()` which presses both slot buttons. Intro and break use a lower master level |
| watchdog | Roll, Harmony, Arpeggio | `bun build.mjs key` also checks the stored slots and Transpose of every AcidBass |

Facts found while building, worth keeping:

- **Roll** velocity is 0..1 (a value of 105 made every note line skip). Pattern param is 1-based; Drums and AcidBass Pattern are 0-based.
- **Harmony** Glide above 0 plays the semitones in between, out of key. Keep it 0.
- **Fundamental LFO** frequency knob behaves as radians (about 2 pi slower than the label); raw -7.7 gives a 30 s cycle. **Delay** time is overridden by a patched Clock input, so leave the clock unpatched and set the time to 0.365 s (dotted 8th at 124 bpm).
- **Rack MCP** `get_voltages` only reports ports with channels, so an unpatched output reads empty. Ripple's 1 ms triggers are missed by polling; prove a duck by comparing RMS before and after it.
- **Transit** 2.5.0 loads slot values with `json_real_value`, which returns 0 for a JSON integer: send whole numbers as v + 1e-4 and give each slot a real `fadeTime`. Clear `sourceMaps`, wait 2 s, then write the maps and presets. A recall crossfades every non-switch param, hence two Transits. Fade seconds = 0.01 * 2^(10 * fade).
- `ah.mjs` gained `ensure()` (rerunnable steps), an idempotent `cable()`, `setByDisplay()` and `setDb()`.

Not built: Slider A and B (one Slider module is still in the patch, unpatched), Arpeggio, AcidVoice, the stab Filter, the Ripple envelope as a cutoff source. The slow LFO (30 s cycle, through a VCA-1 scaler) rides the lead acid's cutoff instead of an AcidVoice. Tasks 5 to 9 below are therefore historical.

## File structure

Outside the repo, next to the other music files (spec: no new code files in the repo):

- `C:\Users\Arikl\Desktop\claude artifacts\my-lil-acid-bassline\acid-house\ah.mjs` - the helper: `add`, `cable`, `set`, `get`, `data`, `measure`, `save`.
- `...\acid-house\build.mjs` - the runner and the step functions (`steps.sN`, `checks.sN`), plus the music data.
- Saved patches: `%LOCALAPPDATA%\Rack2\patches\my-lil-acid-house-sN-<name>.vcv`.

In the repo: this plan and the spec only.

## Facts every task relies on

- Add a module: `vcvrack_add_module {plugin_slug, module_slug, x, y}`, positions from `vcvrack_get_rack_layout` `suggested_positions` (labels `append_mcp_row`, `new_row`).
- Add a cable: `vcvrack_add_cable {outputModuleId, outputId, inputModuleId, inputId}`. Set knobs: `vcvrack_set_params {moduleId, params:[{id, value}]}`. Read: `vcvrack_get_module {module_id}` (params with `displayValue`, inputs, outputs). Audio levels: `vcvrack_measure {moduleId, outputId, seconds}`. Save a copy: `vcvrack_save_patch {path}`.
- Module state (patterns): `vcvrack_get_module_state {id}` then `vcvrack_set_module_state {id, state:{id, plugin, model, version, data}}`; send the whole `data` (Acid Bass `patterns` must list all 32 slots, Roll all 16).
- Plugin and module slugs: `ImpromptuModular/Clocked`, `MyLilToolbox/{Mixer,Arpeggio,Ripple,Filter,Slider,Duck}`, `MyLilDrums/Drums`, `MyLilAcidBass/{AcidBass,AcidVoice}`, `MyLilTriple/{Triple,Roll,Harmony}`, `Fundamental/{Delay,LFO}`, `AS/ReverbStereoFx`, `Core/AudioInterface2`, `MyLilMcp/Mcp`.
- Drums pads: 0 kick, 1 snare, 2 chat, 3 ohat, 4 clap, 5 rim, 6 tom, 7 crash. A pattern row is 64 steps as 128 lowercase hex digits (velocity 0-127).
- Acid Bass: pattern slot index 0 is I-A1. A step is `{gate: rest|note|tie, note 0-11, oct, accent, slide}`; MIDI = 36 + note + 12*oct. A1 = 33.
- Roll patterns are text: `bars=N`, then one `start len pitch vel` line per note; 96 PPQ, bar = 384 ticks, 16th = 24 ticks. Roll key and mode live in state `data.key` (A = 9) and `data.mode` (Aeolian = 5); Harmony's key and mode are params.
- Slider values: range `0 to 2 V` maps param 0..1 to 0..2 V; `-5 to +5 V` maps 0..1 to -5..+5 V. 0 V is C4 (MIDI 60), 1/12 V per semitone.

---

### Task 0: Bootstrap the empty patch and the helper

**Files:**
- Create: `acid-house\ah.mjs`, `acid-house\build.mjs`

- [ ] **Step 1: Ari saves or discards arrow-remix, then opens a new patch**

In Rack: Ctrl+S (or answer discard) for arrow-remix, then File > New. In the new patch add by hand: **Audio 2** (set the driver to WASAPI and the Realtek speakers) and **My lil MCP**. Nothing else.

- [ ] **Step 2: Confirm the MCP answers**

Run: `bun -e "import {rack} from 'file:///C:/Users/Arikl/Desktop/_Projects/my-lil-acid-bassline/tools/rack.mjs'; console.log(JSON.stringify(await rack('vcvrack_list_modules')))"`
Expected: a JSON list with two modules, slugs `Mcp` and `AudioInterface2`. If it prints "open the patch in Rack first", the audio engine is not running: re-pick the audio device in the Audio module.

- [ ] **Step 3: Write `ah.mjs`**

```js
// ah.mjs - Rack helper for the acid house build. Finds modules, ports and params by name.
import { rack } from 'file:///C:/Users/Arikl/Desktop/_Projects/my-lil-acid-bassline/tools/rack.mjs';
export { rack };
export const patches = process.env.LOCALAPPDATA.replace(/\\/g, '/') + '/Rack2/patches';

const one = (xs, re, what, first = false) => {
  const r = xs.filter((x) => re.test(x.name));
  if (!r.length || (r.length > 1 && !first)) throw new Error(`${what} ${re}: ${r.length} matches among: ${xs.map((x) => x.name).join(' | ')}`);
  return r[0];
};
export const list = () => rack('vcvrack_list_modules');
export const detail = (id) => rack('vcvrack_get_module', { module_id: id });
export async function id(slug, nth = 0) {
  const m = (await list()).filter((x) => x.slug === slug)[nth];
  if (!m) throw new Error('no ' + slug + ' #' + nth + ' in the patch');
  return m.id;
}
export async function add(plugin, slug) {
  const l = await rack('vcvrack_get_rack_layout');
  for (const label of ['append_mcp_row', 'new_row']) {
    const s = l.suggested_positions.find((p) => p.label === label);
    if (!s) continue;
    try { return (await rack('vcvrack_add_module', { plugin_slug: plugin, module_slug: slug, x: s.x, y: s.y })).id; }
    catch (e) { if (label === 'new_row') throw e; }
  }
  throw new Error('no free position for ' + plugin + '/' + slug);
}
export async function cable(a, outRe, b, inRe) {
  const [A, B] = [await detail(a), await detail(b)];
  return rack('vcvrack_add_cable', { outputModuleId: a, outputId: one(A.outputs, outRe, 'output').id, inputModuleId: b, inputId: one(B.inputs, inRe, 'input').id });
}
export async function set(m, nameRe, value, first = false) {
  const p = one((await detail(m)).params, nameRe, 'param', first);
  await rack('vcvrack_set_params', { moduleId: m, params: [{ id: p.id, value }] });
  return p;
}
export const get = async (m, nameRe, first = false) => one((await detail(m)).params, nameRe, 'param', first);
// step an integer switch/knob until its display text matches (for knobs whose value-to-text map is not known)
export async function setByDisplay(m, nameRe, shownRe) {
  const p = one((await detail(m)).params, nameRe, 'param', true);
  for (let v = Math.round(p.min); v <= Math.round(p.max); v++) {
    await rack('vcvrack_set_params', { moduleId: m, params: [{ id: p.id, value: v }] });
    const q = (await detail(m)).params.find((x) => x.id === p.id);
    if (shownRe.test(q.displayValue)) return q.displayValue;
  }
  throw new Error(`${nameRe}: no value displays as ${shownRe}`);
}
// replace fields of a module's saved data (Acid Bass patterns, Roll patterns, key, mode)
export async function data(m, patch) {
  const s = await rack('vcvrack_get_module_state', { id: m });
  const next = typeof patch === 'function' ? patch(s.data) : { ...s.data, ...patch };
  await rack('vcvrack_set_module_state', { id: m, state: { id: m, plugin: s.plugin, model: s.model, version: s.version, data: next } });
}
const deep = (o, re) => { for (const [k, v] of Object.entries(o || {})) { if (re.test(k) && typeof v === 'number') return v; if (v && typeof v === 'object') { const r = deep(v, re); if (r !== undefined) return r; } } };
export async function measure(m, outRe, seconds = 2) {
  const o = one((await detail(m)).outputs, outRe, 'output', true);
  const r = await rack('vcvrack_measure', { moduleId: m, outputId: o.id, seconds });
  return { raw: r, peak: deep(r, /peak.*db|^peakdb/i), rms: deep(r, /rms.*db|^rmsdb/i), lufs: deep(r, /lufs/i) };
}
export const volts = (m) => rack('vcvrack_get_voltages', { moduleId: m });
export const save = (name) => rack('vcvrack_save_patch', { path: `${patches}/my-lil-acid-house-${name}.vcv` });
```

- [ ] **Step 4: Write `build.mjs` (runner only for now)**

```js
// build.mjs - bun build.mjs <step> | bun build.mjs save <name>
import * as A from './ah.mjs';
export const steps = {}, checks = {};
export const { id, add, cable, set, get, setByDisplay, data, measure, volts, save, detail, rack } = A;

// ---- music data goes here (added by the tasks) ----

// ---- steps go here (added by the tasks) ----

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'save') console.log(await save(arg));
else if (steps[cmd]) { await steps[cmd](); if (checks[cmd]) await checks[cmd](); }
else if (cmd) { console.error('unknown step ' + cmd); process.exit(2); }
```

- [ ] **Step 5: Smoke test the helper**

Run (in the `acid-house` folder): `bun -e "import {id,detail} from './ah.mjs'; const m=await detail(await id('AudioInterface2')); console.log(m.name, m.inputs.length, m.outputs.length)"`
Expected: `Audio-2 ...` with 8 or more inputs. A thrown error means the folder or the import path is wrong.

- [ ] **Step 6: Commit the plan (repo)**

```bash
git add docs/superpowers/plans/2026-11-22-my-lil-acid-house.md docs/superpowers/specs/2026-11-22-my-lil-acid-house-design.md
git commit -m "docs(acid-house): implementation plan, spec updated for module limits found in the sources"
```

---

### Task 1 (s1): Clock, Mixer, Audio

**Files:** Modify: `acid-house\build.mjs`

- [ ] **Step 1: Add the step and its check**

```js
steps.s1 = async () => {
  const clk = await add('ImpromptuModular', 'Clocked');
  const mix = await add('MyLilToolbox', 'Mixer');
  await set(clk, /bpm|tempo/i, 124, true);
  // clock 1 must run at 16ths: x4 against the beat
  console.log('clock 1 ratio shows', await setByDisplay(clk, /ratio/i, /[x\u00d7]\s*4\b/i));
  const audio = await id('AudioInterface2');
  await cable(mix, /^Master left/, audio, /^left|1/i);
  await cable(mix, /^Master right/, audio, /^right|2/i);
};
checks.s1 = async () => {
  const clk = await id('Clocked');
  console.log('clocked outputs:', (await detail(clk)).outputs.map((o) => o.id + ':' + o.name).join(' | '));
  const m = await measure(await id('Mixer'), /^Master left/, 1);
  console.log('master', m.rms, m.peak);
};
```

- [ ] **Step 2: Run it**

Run: `bun build.mjs s1`
Expected: `clock 1 ratio shows` an x4 string, the Clocked output list, and a master RMS far below -60 or `-Infinity` (silent). A thrown `... matches among: ...` lists the real names: fix the regex in the step and rerun (delete the half-built modules first with `vcvrack_delete_module` if they were added twice).

- [ ] **Step 3: Start the clock and prove the rate**

Run: `bun -e "import {id,set,volts} from './ah.mjs'; const c=await id('Clocked'); await set(c,/run/i,1,true); await set(c,/run/i,0,true); await set(c,/run/i,1,true); let n=0,p=0; const t=Date.now(); while(Date.now()-t<3000){const v=(await volts(c)); const x=JSON.stringify(v); const hi=/\"name\":\"Clock 1\"[^}]*\"voltages\":\[(\d+\.?\d*)/.exec(x); const h=hi&&+hi[1]>2; if(h&&!p)n++; p=h;} console.log('edges in 3 s', n)"`
Expected: edges in the range 18 to 27 (124 bpm x4 = 8.27 Hz, about 25 in 3 s; polling can miss short pulses, so below 18 is a failure, not a close call). Clocked's Run is a toggle (set 1 then 0 per press); the three sets leave it running.

- [ ] **Step 4: Ari keep or adjust, then save**

Run: `bun build.mjs save s1-clock`
Expected: `{"path":".../my-lil-acid-house-s1-clock.vcv","bytes":...}`

- [ ] **Step 5: Commit nothing** (patch files are not in the repo)

---

### Task 2 (s2): Drums

- [ ] **Step 1: Add the drum patterns and the step**

```js
// 4 scene patterns: 0 intro, 1 groove, 2 break, 3 drop. 16 steps, velocity per step.
const row = (hits, v) => { const a = new Array(64).fill(0); for (const s of hits) a[s] = typeof v === 'number' ? v : v[s]; return a.map((x) => x.toString(16).padStart(2, '0')).join(''); };
const zero = row([], 0);
const rows = (o) => Array.from({ length: 16 }, (_, p) => o[p] || zero);
const ghost = [1, 3, 5, 7, 9, 11, 13, 15], off = [2, 6, 10, 14], four = [0, 4, 8, 12];
export const drumPatterns = [
  { length: 16, rows: rows({ 0: row(four, 120), 2: row(off, 90) }) },                                                        // intro: kick + offbeat hat
  { length: 16, rows: rows({ 0: row(four, 120), 2: row([...off, ...ghost], { 2: 100, 6: 100, 10: 100, 14: 100, 1: 35, 3: 40, 5: 35, 7: 40, 9: 35, 11: 40, 13: 35, 15: 40 }), 4: row([4, 12], 110), 5: row([3, 10], 80) }) }, // groove
  { length: 16, rows: rows({ 2: row(off, 70), 5: row([3, 10], 60) }) },                                                      // break: no kick
  { length: 16, rows: rows({ 0: row(four, 124), 2: row(ghost, 40), 3: row(off, 100), 4: row([4, 12], 118), 5: row([3, 7, 10, 15], 85) }) }, // drop
];
steps.s2 = async () => {
  const d = await add('MyLilDrums', 'Drums');
  const clk = await id('Clocked'), mix = await id('Mixer');
  await cable(clk, /clock 1/i, d, /^Clock/);
  await cable(clk, /^reset/i, d, /^Reset/);
  await data(d, (cur) => ({ ...cur, patterns: cur.patterns.map((p, i) => (drumPatterns[i] ? { ...p, ...drumPatterns[i] } : p)) }));
  await cable(d, /^Mix left/, mix, /^Strip 1 left/);
  await cable(d, /^Mix right/, mix, /^Strip 1 right/);
  await cable(d, /^Pad 1$/, mix, /^Sidechain/);   // kick pad drives the duck
};
checks.s2 = async () => {
  const d = await id('Drums');
  const m = await measure(d, /^Mix left/, 3);
  console.log('drums mix', m.rms, m.peak);
  const mm = await measure(await id('Mixer'), /^Master left/, 3);
  console.log('master', mm.rms, mm.peak);
  if (!(mm.peak < -1)) throw new Error('master peak ' + mm.peak + ' is not below -1 dBFS');
};
```

- [ ] **Step 2: Run it**

Run: `bun build.mjs s2`
Expected: drums RMS between -30 and -10 dBFS, master peak below -1. If the Drums data has no `patterns` array shape like this, `data()` throws on `cur.patterns.map`: print `await rack('vcvrack_get_module_state',{id})` and match the shape (the source writes `{length, rows}` per pattern).

- [ ] **Step 3: Select pattern 0 and listen**

Run: `bun -e "import {id,set} from './ah.mjs'; const d=await id('Drums'); console.log((await (await import('./ah.mjs')).detail(d)).params.filter(p=>/pattern|run/i.test(p.name)).map(p=>p.id+':'+p.name+'='+p.value).join(' | '))"`
Expected: the pattern selector and run params with their values; set the pattern knob to the four scene patterns in turn with `set(d, /pattern/i, N, true)` while Ari listens: 0 kick and hat, 1 adds clap, rim, ghost hats, 2 has no kick, 3 is full.

- [ ] **Step 4: Ari keep or adjust, then save**

Run: `bun build.mjs save s2-drums`

---

### Task 3 (s3): Acid Bass

- [ ] **Step 1: Add the pattern generator and the step**

```js
// token: A1 note, A1a accent, A1s slide, '-' tie, '.' rest. MIDI from the name; Acid step = 36 + note + 12*oct.
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const tok = (t) => {
  if (t === '.') return { gate: 'rest', note: 0, oct: 0, accent: false, slide: false };
  if (t === '-') return { gate: 'tie', note: 0, oct: 0, accent: false, slide: false };
  const m = /^([A-G])(#?)(\d)([as]*)$/.exec(t);
  if (!m) throw new Error('bad token ' + t);
  const midi = 12 * (+m[3] + 1) + PC[m[1]] + (m[2] ? 1 : 0), n = midi - 36;
  return { gate: 'note', note: ((n % 12) + 12) % 12, oct: Math.floor(n / 12), accent: m[4].includes('a'), slide: m[4].includes('s') };
};
const acid = (txt) => { const t = txt.trim().split(/\s+/); if (t.length !== 32) throw new Error('need 32 tokens, got ' + t.length); return { len: 32, steps: t.map(tok) }; };
export const acidSlots = [
  acid('A1 - - . . . A1 . . . A1 - . . . .   A1 - - . . . A1 . . . A1 - . . A2 .'),                    // I-A1 intro, sparse
  acid('A1a . A1 A1a . A1 A1a . C2 A1a . A1 E2s . D2 .   A1a . A1 A1a . A1 A1a . A2s A1a . G2 A1 . A2s .'), // I-A2 groove, A pedal + pentatonic
  acid('A1a A1 A2 A1a A1 A2 A1a A1 C2 A1a A1 A2 E2s G2 A2s .   A1a A1 A2 A1a A1 A2 A1a D2 C2 A1a A1 A2 G2s E2 A1a A1'), // I-A3 drop, busy
  acid('A1 - - - - - - - A2s - - - - - - -   A2 - - - G2s - - - E2s - - - A1s - - -'),                // I-A4 break, long slides
];
steps.s3 = async () => {
  const a = await add('MyLilAcidBass', 'AcidBass');
  const clk = await id('Clocked'), mix = await id('Mixer');
  await cable(clk, /clock 1/i, a, /^Clock/);
  await cable(clk, /^reset/i, a, /^Reset/);
  await data(a, (cur) => ({ ...cur, patterns: cur.patterns.map((p, i) => acidSlots[i] || p) }));
  await set(a, /^Pattern$/, 1);                      // slot index 1 = I-A2, the groove
  await set(a, /^Volume/, 0.7);
  await cable(a, /^Audio/, mix, /^Strip 2 left/);
};
checks.s3 = async () => {
  const a = await id('AcidBass');
  const m = await measure(a, /^Audio/, 3);
  console.log('acid', m.rms, m.peak);
  const mm = await measure(await id('Mixer'), /^Master left/, 3);
  console.log('master', mm.rms, mm.peak);
  if (!(mm.peak < -1)) throw new Error('master peak ' + mm.peak + ' is not below -1 dBFS');
  const gate = JSON.stringify(await volts(a));
  if (!/Sequencer gate/.test(gate)) throw new Error('sequencer gate not carrying a signal: the clock is not reaching Acid Bass');
};
```

- [ ] **Step 2: Run it**

Run: `bun build.mjs s3`
Expected: acid RMS around -20 to -10, master peak below -1. A `need 32 tokens` error names the slot that is off.

- [ ] **Step 3: Duck the mix with the kick**

Run: `bun -e "import {id,set} from './ah.mjs'; const m=await id('Mixer'); await set(m,/^Strip 2 duck/,0.25); console.log('ok')"`
Expected: `ok`. Ari hears the acid dip on each kick.

- [ ] **Step 4: Ari switches slots by ear**

Run for each of 0, 2, 3: `bun -e "import {id,set} from './ah.mjs'; await set(await id('AcidBass'),/^Pattern$/,N)"` (N = 0 intro, 2 drop, 3 break). Ari says keep or adjust; adjust means edit the token strings above and rerun `bun build.mjs s3`.

- [ ] **Step 5: Save**

Run: `bun build.mjs save s3-acid`

---

### Task 4 (s4): Roll to Triple, the chord spine

- [ ] **Step 1: Add the chord generator and the step**

```js
// A Aeolian, one chord per bar: Am9 Fmaj7 Cmaj7 G6. Close voice leading G3..B4 (MIDI).
export const chords = [[57, 60, 64, 67, 71], [53, 57, 60, 64], [55, 59, 60, 64], [55, 59, 62, 64]];
const BAR = 384;
const rollText = (bars, hits, len, vel) => 'bars=' + bars + '\n' + chords.flatMap((c, b) => hits.flatMap((h) => c.map((n) => `${b * BAR + h} ${len} ${n} ${vel}`))).join('\n');
export const rollPats = [
  rollText(4, [48, 144, 240, 336], 36, 100),     // 1 stab: offbeat 8ths
  rollText(4, [0], 380, 80),                      // 2 pad: whole notes
  rollText(4, [0, 72, 144, 192, 264, 336], 48, 105), // 3 drop: 3-3-2
];
steps.s4 = async () => {
  const r = await add('MyLilTriple', 'Roll');
  const t = await add('MyLilTriple', 'Triple');
  const clk = await id('Clocked'), mix = await id('Mixer');
  await cable(clk, /clock 1/i, r, /^Clock/);
  await cable(clk, /^reset/i, r, /^Reset/);
  await data(r, (cur) => ({ ...cur, key: 9, mode: 5, scaleSnap: true, patterns: cur.patterns.map((p, i) => rollPats[i] || p) }));
  await cable(r, /^V\/OCT/, t, /^V\/OCT/);
  await cable(r, /^Gate/, t, /^Gate/);
  await set(r, /^Pattern/, 1);
  await set(t, /^Amp attack/, 0.01); await set(t, /^Amp release/, 0.25);
  await set(t, /^Cutoff$/, Math.log2(2500)); await set(t, /^Resonance/, 0.15);
  await cable(t, /^Left/, mix, /^Strip 4 left/);
  await cable(t, /^Right/, mix, /^Strip 4 right/);
  await set(mix, /^Strip 4 duck/, 0.7);
};
checks.s4 = async () => {
  const r = await id('Roll'), t = await id('Triple');
  const v = await volts(r);
  const out = (v.outputs || v).find?.((o) => /V\/OCT/.test(o.name));
  console.log('roll V/OCT voltages', JSON.stringify(out && out.voltages));
  const m = await measure(t, /^Left/, 3);
  console.log('triple', m.rms, m.peak);
  const mm = await measure(await id('Mixer'), /^Master left/, 3);
  console.log('master', mm.rms, mm.peak);
  if (!(mm.peak < -1)) throw new Error('master peak ' + mm.peak + ' is not below -1 dBFS');
};
```

- [ ] **Step 2: Run it**

Run: `bun build.mjs s4`
Expected: Roll V/OCT lists voltages equal to `(midi-60)/12` of the chord now playing (bar 1: -0.25, 0, 0.3333, 0.5833, 0.9167 or a subset while notes fade); master peak below -1. If the voltages are 0.1 V/octave off (Roll might use MIDI note 0 as C-1 differently), fix `chords` by the offset and rerun.

- [ ] **Step 3: Switch the three Roll patterns by ear**

Run for N = 1, 2, 3: `bun -e "import {id,set} from './ah.mjs'; await set(await id('Roll'),/^Pattern/,N)"`. Ari hears stab, pad, 3-3-2. Check the chord sequence repeats every 4 bars and each chord is warm, not clashing with the acid A pedal.

- [ ] **Step 4: Ari keep or adjust, then save**

Run: `bun build.mjs save s4-chords`

---

### Task 5 (s5): Hook, Slider A, Harmony, Triple #2

- [ ] **Step 1: Add the hook and the step**

```js
// 8-step hook motif on Slider A, A4..E5: A4 . C5 E5 . D5 C5 .   (range 0 to 2 V: value = ((midi-60)/12)/2)
export const hook = [69, null, 72, 76, null, 74, 72, null];
const sv2 = (m) => (m - 60) / 12 / 2;
steps.s5 = async () => {
  const s = await add('MyLilToolbox', 'Slider');
  const h = await add('MyLilTriple', 'Harmony');
  const t2 = await add('MyLilTriple', 'Triple');
  const clk = await id('Clocked'), r = await id('Roll'), mix = await id('Mixer');
  await cable(clk, /clock 1/i, s, /^Clock/);
  await cable(clk, /^reset/i, s, /^Reset/);
  await set(s, /^A range/, 1);                     // 0 to 2 V
  await set(s, /^A length/, 8);
  for (let i = 0; i < 8; i++) {
    if (hook[i] != null) await set(s, new RegExp('^Step A' + (i + 1) + '$|^Step ' + (i + 1) + '$'), sv2(hook[i]), true);
    await set(s, new RegExp('^Gate A?' + (i + 1) + '$|^Gate ' + (i + 1) + '$'), hook[i] != null ? 1 : 0, true);
  }
  await set(h, /^Key/, 9); await set(h, /^Mode/, 5);
  await set(h, /^Lead snap/, 0);                   // scale in the groove; the drop scene sets 1 (chord tones only)
  await set(h, /^Glide/, 0.12);
  await cable(r, /^V\/OCT/, h, /^Chord V\/OCT/);
  await cable(r, /^Gate/, h, /^Chord gate/);
  await cable(s, /^A CV/, h, /^Lead V\/OCT/);
  await cable(s, /^A gate/, h, /^Lead gate/);
  await cable(h, /^Lead \+ harmony V\/OCT/, t2, /^V\/OCT/);
  await cable(h, /^Gate/, t2, /^Gate/);
  await set(t2, /^Osc 1 wave/, 2);                 // square pluck
  await set(t2, /^Amp decay/, 0.18); await set(t2, /^Amp sustain/, 0.1); await set(t2, /^Amp release/, 0.15);
  await set(t2, /^Cutoff$/, Math.log2(4500));
  await cable(t2, /^Left/, mix, /^Strip 5 left/);
  await cable(t2, /^Right/, mix, /^Strip 5 right/);
  await set(mix, /^Strip 5 duck/, 0.35);
};
checks.s5 = async () => {
  const h = await id('Harmony');
  const d = await volts(h);
  const outs = (d.outputs || d).filter?.((o) => /V\/OCT/.test(o.name)) || [];
  const inKey = (v) => [9, 11, 0, 2, 4, 5, 7].includes(((Math.round(v * 12) % 12) + 12) % 12);   // A natural minor, 0 V = C
  const bad = outs.flatMap((o) => (o.voltages || [])).filter((v) => !inKey(v));
  console.log('harmony voltages', JSON.stringify(outs.map((o) => o.voltages)), 'out of A minor:', bad.length);
  const mm = await measure(await id('Mixer'), /^Master left/, 3);
  console.log('master', mm.rms, mm.peak);
  if (!(mm.peak < -1)) throw new Error('master peak ' + mm.peak + ' is not below -1 dBFS');
};
```

- [ ] **Step 2: Run it**

Run: `bun build.mjs s5`
Expected: `out of A minor: 0`; master peak below -1. A `... matches among: ...` error lists the real Slider param names: adjust the regexes (step and gate names) and rerun.

- [ ] **Step 3: Chord tones only in the drop (proves the mode)**

Run: `bun -e "import {id,set} from './ah.mjs'; await set(await id('Harmony'),/^Lead snap/,1)"` then listen: the hook now lands only on the chord's own notes. Set it back to 0 afterwards.

- [ ] **Step 4: Ari keep or adjust, then save**

Run: `bun build.mjs save s5-hook`

---

### Task 6 (s6): Answer acid, Slider B, Arpeggio, AcidVoice

- [ ] **Step 1: Add the answer riff and the step**

```js
// 8-step answer on Slider B, range -5..+5 V: value = ((midi-60)/12 + 5) / 10. Gaps for the lead acid: steps 2 4 6 7.
export const answer = [null, 48, null, 52, null, 50, 48, null];
const sv10 = (m) => ((m - 60) / 12 + 5) / 10;
steps.s6 = async () => {
  const s = await id('Slider');
  const q = await add('MyLilToolbox', 'Arpeggio');
  const v = await add('MyLilAcidBass', 'AcidVoice');
  const clk = await id('Clocked'), mix = await id('Mixer');
  await set(s, /^B range/, 3);                    // -5 to +5 V
  await set(s, /^B length/, 8);
  for (let i = 0; i < 8; i++) {
    if (answer[i] != null) await set(s, new RegExp('^Step B' + (i + 1) + '$|^Step ' + (i + 9) + '$'), sv10(answer[i]), true);
    await set(s, new RegExp('^Gate B' + (i + 1) + '$|^Gate ' + (i + 9) + '$'), answer[i] != null ? 1 : 0, true);
  }
  const keys = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const aMinor = new Set([9, 11, 0, 2, 4, 5, 7]);
  for (let i = 0; i < 12; i++) await set(q, new RegExp('^' + keys[i].replace('#', '\\#') + ' in scale'), aMinor.has(i) ? 1 : 0);
  await set(q, /^Mode$/, 0);                      // quantizer
  await cable(s, /^B CV/, q, /^A CV/);
  await cable(s, /^B gate/, q, /^A trigger/);
  await cable(q, /^A CV/, v, /^V\/?Oct/i);
  await cable(s, /^B gate/, v, /^Gate/i);
  await set(v, /^Cutoff$/, 0.35); await set(v, /^Resonance/, 0.55);
  await cable(v, /^Audio|^Out/i, mix, /^Strip 3 left/);
  await set(mix, /^Strip 3 duck/, 0.5);
};
checks.s6 = async () => {
  const q = await id('Arpeggio');
  const d = await volts(q);
  console.log('arpeggio', JSON.stringify(d));
  const m = await measure(await id('AcidVoice'), /^Audio|^Out/i, 3);
  console.log('answer acid', m.rms, m.peak);
  const mm = await measure(await id('Mixer'), /^Master left/, 3);
  console.log('master', mm.rms, mm.peak);
  if (!(mm.peak < -1)) throw new Error('master peak ' + mm.peak + ' is not below -1 dBFS');
};
```

- [ ] **Step 2: Run it**

Run: `bun build.mjs s6`
Expected: Arpeggio CV voltages only at pitch classes of A minor (multiples of 1/12 V from the set 9 11 0 2 4 5 7), answer acid RMS between -30 and -12, master peak below -1. If AcidVoice's input names differ, the error lists them: fix the regexes.

- [ ] **Step 3: Ari keep or adjust, then save**

Run: `bun build.mjs save s6-answer`

---

### Task 7 (s7): Ripple, LFO, stab Filter

- [ ] **Step 1: Add the step**

```js
steps.s7 = async () => {
  const rp = await add('MyLilToolbox', 'Ripple');
  const f = await add('MyLilToolbox', 'Filter');
  const lfo = await add('Fundamental', 'LFO');
  const clk = await id('Clocked'), t = await id('Triple', 0), t2 = await id('Triple', 1), v = await id('AcidVoice'), mix = await id('Mixer');
  await cable(clk, /clock 1/i, rp, /^External clock/);
  await cable(clk, /^reset/i, rp, /^Reset/);
  await set(rp, /^Mode/, 0);                       // grid
  for (const [i, p] of [3, 5, 7, 16].entries()) {
    const n = 'ABCD'[i];
    await set(rp, new RegExp('^' + n + ' period'), p);
    await set(rp, new RegExp('^' + n + ' on'), 1);
  }
  // chords through the My lil Filter: Triple 1 out -> Filter -> Strip 4 (replace the direct cable)
  const cables = await rack('vcvrack_list_cables');
  for (const c of cables) if (c && c.outputModuleId === t && c.inputModuleId === mix) await rack('vcvrack_delete_cable', { id: c.id });
  await cable(t, /^Left/, f, /^Audio/);
  await cable(f, /^Audio/, mix, /^Strip 4 left/);
  await set(f, /^Cutoff$/, 0.55); await set(f, /^Resonance/, 0.3);
  await cable(rp, /^Envelope/, f, /^Cutoff CV/);
  await set(f, /^Cutoff CV amount/, 0.5);
  // slow LFO (about 1/16 Hz = 16 bars at 124 bpm) on the answer acid cutoff
  await set(lfo, /^Frequency/i, -4);
  await cable(lfo, /^Sine/i, v, /^Cutoff CV/i);
};
checks.s7 = async () => {
  const rp = await id('Ripple'), f = await id('Filter');
  const a = JSON.stringify(await volts(f)), b = JSON.stringify(await volts(f));
  console.log('filter cutoff CV now vs later differ:', a !== b);
  const mm = await measure(await id('Mixer'), /^Master left/, 3);
  console.log('master', mm.rms, mm.peak);
  if (!(mm.peak < -1)) throw new Error('master peak ' + mm.peak + ' is not below -1 dBFS');
};
```

Ripple's ACCENT output has no matching input on Triple (Triple has no trigger input), so the spec's "accent fires the hook filter envelope" is not wired; Ripple's ENV on the stab Filter carries the movement.

- [ ] **Step 2: Run it**

Run: `bun build.mjs s7`
Expected: `differ: true` (the cutoff CV moves between two reads), master peak below -1. The stab chord now pulses in polyrhythm against the kick.

- [ ] **Step 3: Ari keep or adjust, then save**

Run: `bun build.mjs save s7-movement`

---

### Task 8 (s8): Delay and reverb sends

- [ ] **Step 1: Add the step**

```js
steps.s8 = async () => {
  const mix = await id('Mixer');
  const dl = await add('Fundamental', 'Delay');
  const rv = await add('AS', 'ReverbStereoFx');
  await cable(mix, /^Send 1 left/, dl, /^In/i);
  await cable(dl, /^Out/i, mix, /^Return 1 left/);
  await cable(mix, /^Send 2 left/, rv, /left|^In/i);
  await cable(rv, /left|^Out/i, mix, /^Return 2 left/);
  await set(dl, /^Time/i, -1.46);                  // dotted 1/8 at 124 bpm = 0.363 s = 2^-1.46 (Fundamental Delay time knob is log2 seconds)
  await set(dl, /^Feedback/i, 0.4); await set(dl, /^Mix|^Wet/i, 1, true);
  await set(mix, /^Strip 5 send 1/, 0.4);          // hook to delay
  await set(mix, /^Strip 4 send 2/, 0.25); await set(mix, /^Strip 5 send 2/, 0.2);   // chords, hook to reverb
};
checks.s8 = async () => {
  const mm = await measure(await id('Mixer'), /^Master left/, 4);
  console.log('master', mm.rms, mm.peak, 'LUFS', mm.lufs);
  if (!(mm.peak < -1)) throw new Error('master peak ' + mm.peak + ' is not below -1 dBFS');
  if (mm.lufs != null && (mm.lufs < -16 || mm.lufs > -8)) console.log('LUFS outside -16..-8: trim strip levels, target about -12');
};
```

- [ ] **Step 2: Run it and listen to the returns**

Run: `bun build.mjs s8`
Expected: master peak below -1; LUFS between -16 and -8 (target about -12). A missing return cable shows as a `... matches among:` error listing the real FX port names.

- [ ] **Step 3: Ari keep or adjust, then save**

Run: `bun build.mjs save s8-fx`

---

### Task 9 (s9): Scenes

- [ ] **Step 1: Add the scene function**

```js
// scene table: drums pattern, acid slot, roll pattern (1 stab, 2 pad, 3 drop), answer on, hook on, harmony snap, hook delay, reverb send
export const scenes = {
  intro:  { drums: 0, acid: 0, roll: 1, answer: 0, hook: 0, snap: 0, delay: 0.1, rev: 0.1 },
  groove: { drums: 1, acid: 1, roll: 1, answer: 1, hook: 1, snap: 0, delay: 0.4, rev: 0.2 },
  break:  { drums: 2, acid: 3, roll: 2, answer: 0, hook: 1, snap: 0, delay: 0.4, rev: 0.5 },
  drop:   { drums: 3, acid: 2, roll: 3, answer: 1, hook: 1, snap: 1, delay: 0.4, rev: 0.2 },
};
export async function scene(name) {
  const s = scenes[name]; if (!s) throw new Error('scenes: ' + Object.keys(scenes).join(' '));
  const mix = await id('Mixer');
  await set(await id('Drums'), /pattern/i, s.drums, true);
  await set(await id('AcidBass'), /^Pattern$/, s.acid);
  await set(await id('Roll'), /^Pattern/, s.roll);
  await set(await id('Harmony'), /^Lead snap/, s.snap);
  await set(mix, /^Strip 3 mute/, s.answer ? 0 : 1);
  await set(mix, /^Strip 5 mute/, s.hook ? 0 : 1);
  await set(mix, /^Strip 5 send 1/, s.delay);
  await set(mix, /^Strip 5 send 2/, s.rev);
}
steps.s9 = async () => { for (const n of ['intro', 'groove', 'break', 'drop']) await scene(n); await scene('groove'); };
checks.s9 = async () => {
  for (const n of ['intro', 'groove', 'break', 'drop']) {
    await scene(n); await new Promise((r) => setTimeout(r, 1500));
    const mm = await measure(await id('Mixer'), /^Master left/, 2);
    console.log(n, 'master', mm.rms, mm.peak);
    if (!(mm.peak < -1)) throw new Error(n + ' master peak ' + mm.peak + ' is not below -1 dBFS');
  }
};
```

Add a runner line to `build.mjs` so a scene can be called alone: `else if (cmd === 'scene') await (await import('./build.mjs')).scene(arg)` is circular; instead run `bun -e "import {scene} from './build.mjs'; await scene('drop')"` (the runner block does nothing when no command is given).

- [ ] **Step 2: Run it**

Run: `bun build.mjs s9`
Expected: four lines `intro|groove|break|drop master <rms> <peak>`, each peak below -1, scene changes without errors.

- [ ] **Step 3: Ari plays the song**

Ari says a scene name; Claude runs `bun -e "import {scene} from './build.mjs'; await scene('drop')"`. Ari rides the four macros by mouse: Acid Bass cutoff, resonance, stab Filter cutoff, strip 5 send 1. A bar-long morph is not scripted; scenes change on the next bar boundary only if Ari times the command, so call out "intro" or "drop" on the downbeat.

- [ ] **Step 4: Ari calls the whole song keep, then save the final**

Run: `bun build.mjs save s9-song`
Expected: path and bytes. Update the Life Board line for the acid house rack (new idea lane item) and add a line to the F57 note: the helper `ah.mjs` is the seed for the DAW workspace idea.

- [ ] **Step 5 (optional, Ari by mouse): Transit capture**

Right-click each of the macro knobs and strip mutes into a Transit module, snapshot the four scenes, morph time 1 bar. Claude does not do this step.

---

## Self-review

**Spec coverage:** signal path (Tasks 1-8), key and chords (Task 4), Acid Bass slots (Task 3), hook and Harmony modes (Task 5), answer acid (Task 6), drums (Task 2), movement (Task 7), FX (Task 8), scenes and hands (Task 9), failure handling (MCP down: Task 0 step 2; crash: reopen the last numbered save). The spec's Transit scenes and strip numbers differ and are listed in the table at the top.

**Known soft spots, each with a runtime check that exposes it:** Clocked's ratio and output names (Task 1 prints them), Slider and Ripple param names (the `one()` error lists the real ones), Roll pitch units (Task 4 voltage check), AcidVoice and FX port names (error lists them). None of these hides a failure: a wrong name throws, a wrong note shows in the voltage reads.
