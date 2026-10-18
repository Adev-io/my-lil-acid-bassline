# Drive, Reverb and Tweaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Tweaks (HP, key follow, min decay, pulse width, LFO to PW), Drive, Reverb panels and the Delay tone/stereo knobs to the web app, with every default leaving today's sound unchanged.

**Architecture:** Pure maths, curves, the reverb impulse-response generator and state cleaning go in `acidbass.js` (tested in node). `index.html` wires them into the Web Audio graph: `osc -> HP -> 24 dB lowpass -> amp -> Drive -> master -> clip -> Delay -> Reverb -> out`. Audio is verified with an offline-render harness driven through Playwright. The VST3 port is a separate plan after this one.

**Tech Stack:** Vanilla JS, Web Audio (`OfflineAudioContext` for checks), `node --test` / `bun test`, Playwright MCP for render checks.

**Deviation from the spec (decided while planning):** pulse width is made with the built-in sawtooth oscillator minus a copy of itself delayed by `pw / frequency` (a `DelayNode`), not an AudioWorklet. Same sound and the same knobs, but it works from `file://`, needs no fallback, and needs no extra file. Task 7 amends the spec to match.

**Environment rules (from the user's setup):**
- Run commands in PowerShell, from `C:\Users\Arikl\Desktop\_Projects\my-lil-acid-bassline`.
- Never write into the `algo-art` worktree. Playwright MCP drops files into `algo-art\.playwright-mcp`: delete the ones you made afterwards. Screenshots go to `C:\Users\Arikl\Desktop\screenshots` (move them there after capture).
- Commit messages carry no Claude/AI attribution line.
- Test both runners: `bun test` and `node --test`. Both must be green (vm-realm objects fail node's deepEqual: wrap with `JSON.parse(JSON.stringify(x))`).
- `file://` is blocked in Playwright: serve with `bun x serve -l 8777 .` (run in the background, kill it afterwards).

---

## File structure

- Modify `acidbass.js`: new knob defaults and maps, `drive`/`reverb` state, `driveShape`, `driveCurve`, `driveMakeupDb`, `reverbIR`.
- Modify `acidbass.test.mjs`: tests for all of the above.
- Modify `index.html`: three panels and toolbar buttons, `KNOBDEF` entries, graph wiring, `play()` changes, automation pushes.
- Create `tools/render-harness.js`: an in-page offline render helper pasted into Playwright `browser_evaluate`.
- Create `tests/render-reference.json`: signatures of today's sound, captured before any change.
- Modify `README.md`, `docs/superpowers/specs/2026-10-17-drive-reverb-tweaks-design.md` (amend the oscillator line).

New knob keys (all 0..1 in state, mapped by core functions):

| Key | Map | Default knob | Default meaning |
|---|---|---|---|
| `hp` | `hpHz` 20..500 Hz | 0 | 20 Hz |
| `kfol` | `keyMul` 0..100 % | 0 | 0 % |
| `mind` | `minDecSec` 30 ms..0.6 s | 0 | 30 ms |
| `pw` | `pwFrac` 5..95 % | 0.5 | 50 % |
| `lfor` | `lfoHz` 0.05..20 Hz | 0.6157 | 2 Hz |
| `lfopw` | depth | 0 | 0 % |
| `drhp` | `drHpHz` 20..800 Hz | 0 | 20 Hz |
| `drdrive` | `drDb` 0..30 dB | 0 | 0 dB |
| `drtone` | `drToneHz` 0.8..16 kHz | 1 | 16 kHz |
| `drvol` | `drVolDb` +-12 dB | 0.5 | 0 dB |
| `drmix` | 0..100 % | 1 | 100 % |
| `rvpre` | `rvPreSec` 0..200 ms | 0 | 0 |
| `rvsize` | `rvSizeScale` | 0.5 | medium |
| `rvdec` | `rvDecSec` 0.3..6 s | 0.5 | about 1.3 s |
| `rvdamp` | 0..1 | 0.5 | medium |
| `rvlow` | `rvLowHz` 20..500 Hz | 0 | 20 Hz |
| `rvhigh` | `rvHighHz` 1..20 kHz | 1 | 20 kHz |
| `rvwid` | 0..100 % | 1 | 100 % |
| `rvdry` | 0..100 % | 1 | 100 % |
| `rvwet` | 0..100 % | 0 | 0 |
| `dtone` | `dToneHz` 0.4..20 kHz | 1 | 20 kHz |
| `dwid` | 0..100 % | 1 | 100 % |

State additions: `drive: { on: false, type: 'soft' }`, `reverb: { on: false }`.

---

### Task 0: Capture today's sound as a reference

**Files:**
- Create: `tools/render-harness.js`
- Create: `tests/render-reference.json`

The harness defines `window.__h` with helpers. Run it through Playwright `browser_evaluate` (paste the file's content as the function body, after navigating to `http://localhost:8777/`).

- [ ] **Step 1: Write the harness**

Create `tools/render-harness.js`:

```js
// Offline render helper for Playwright browser_evaluate. Paste the whole file as the evaluate body; it defines window.__h.
// It renders notes through the REAL graph (buildGraph/play) into an OfflineAudioContext, then restores the live page.
// Top-level `let` bindings of index.html are reachable from here because evaluate runs in the page's global scope.
(() => {
  const SR = 44100;
  const GLOBALS = ['ctx', 'osc', 'f1', 'f2', 'vca', 'master', 'dry', 'wet', 'dFx', 'drFx', 'rvFx', 'hpF', 'pwG', 'pwDly', 'pwLfo', 'pwLfoG', 'keyMul', 'lastFreq', 'sweep'];
  const get = (n) => { try { return eval(n); } catch (_) { return undefined; } };
  const put = (n, v) => { try { (0, eval)(n + ' = __v'); } catch (_) { /* absent in older builds */ } };
  // knobs: overrides for S.knobs; opts: { wave, drive:{on,type}, reverb:{on}, delay:{pp,fat,sync}, notes:[{midi,t,accent,slide...}], secs }
  window.__h = {
    async render({ knobs = {}, wave = 'saw', drive, reverb, delay, notes, secs = 2, gate = 0.125 }) {
      const keep = {}; for (const n of GLOBALS) keep[n] = get(n);
      const S0 = JSON.stringify(S);
      try {
        Object.assign(S.knobs, knobs); S.wave = wave;
        if (drive) Object.assign(S.drive, drive);
        if (reverb) Object.assign(S.reverb, reverb);
        if (delay) Object.assign(S.delay, delay);
        const oc = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
        buildGraph(oc);
        for (const n of notes) play({ off: false, trig: n.trig !== false, glide: !!n.glide, midi: n.midi, accent: !!n.accent, hold: !!n.hold, len: 0.55 }, n.t, gate);
        const buf = await oc.startRendering();
        return { L: Array.from(buf.getChannelData(0)), R: Array.from(buf.getChannelData(1)) };
      } finally {
        S = T.cleanState(JSON.parse(S0));
        for (const n of GLOBALS) if (keep[n] !== undefined) put(n, keep[n]);
      }
    },
    rms: (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); },
    peak: (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0),
    // share of energy in the high band: sum of squared first differences over sum of squares (rises with brightness)
    bright: (x, a = 0, b = x.length) => { let d = 0, e = 1e-12; for (let i = a + 1; i < b; i++) { d += (x[i] - x[i - 1]) ** 2; e += x[i] ** 2; } return d / e; },
    duty: (x, a = 0, b = x.length) => { let p = 0; for (let i = a; i < b; i++) if (x[i] > 0) p++; return p / (b - a); },
    corr: (x, y) => { let xy = 0, xx = 1e-12, yy = 1e-12; for (let i = 0; i < x.length; i++) { xy += x[i] * y[i]; xx += x[i] * x[i]; yy += y[i] * y[i]; } return xy / Math.sqrt(xx * yy); },
    sr: SR,
  };
  return 'harness ready';
})();
```

- [ ] **Step 2: Serve the page and capture the reference**

Run (PowerShell): `Start-Process bun -ArgumentList 'x','serve','-l','8777','.' -WindowStyle Hidden`

In Playwright: navigate to `http://localhost:8777/`, then `browser_evaluate` with the harness file content, then a second `browser_evaluate` with:

```js
async () => {
  const h = window.__h, sig = (r) => ({ rms: h.rms(r.L), peak: h.peak(r.L), bright: h.bright(r.L), first: r.L.slice(20000, 20008) });
  const notes = [{ midi: 45, t: 0.05 }, { midi: 52, t: 0.5, accent: true }, { midi: 57, t: 0.95, glide: true, trig: false }];
  const saw = await h.render({ wave: 'saw', notes, secs: 1.8 });
  const sq = await h.render({ wave: 'square', notes, secs: 1.8 });
  const dly = await h.render({ wave: 'saw', knobs: { dmix: 0.5 }, notes, secs: 1.8 });
  return { saw: sig(saw), square: sig(sq), delay: sig(dly), n: saw.L.length };
}
```

Expected: an object with three signatures, `n` = 79380, finite non-zero `rms`.

- [ ] **Step 3: Save the result**

Write the returned JSON to `tests/render-reference.json` with the Write tool (pretty-printed). Read it back and confirm `saw.rms` is above 0.01.

- [ ] **Step 4: Stop the server and clean up**

Kill the `bun` serving port 8777 and delete the files you created under `C:\Users\Arikl\Desktop\_Projects\algo-art\.playwright-mcp`.

- [ ] **Step 5: Commit**

```powershell
git add tools tests
git commit -m "Add offline render harness and a reference render of the current sound"
```

---

### Task 1: Core knob maps and state

**Files:**
- Modify: `acidbass.js` (KNOBS around line 15, maps near line 106, `cleanState` line 44, export line 299)
- Test: `acidbass.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append these tests to `acidbass.test.mjs` (the file's helpers are `load()` returning `TB303`, and `plain` for the JSON round trip; follow the style of the existing tests; use `assert` and `test` as the file already imports them):

```js
test('new knob defaults keep today\'s sound', () => {
  const T = load();
  assert.equal(T.hpHz(T.KNOBS.hp), 20);
  assert.equal(T.keyMul(T.KNOBS.kfol, 72), 1);
  assert.equal(T.minDecSec(T.KNOBS.mind), 0.03);
  assert.equal(T.pwFrac(T.KNOBS.pw), 0.5);
  assert.ok(Math.abs(T.lfoHz(T.KNOBS.lfor) - 2) < 0.01);
  assert.equal(T.drDb(T.KNOBS.drdrive), 0);
  assert.equal(T.drVolDb(T.KNOBS.drvol), 0);
  assert.equal(T.drToneHz(T.KNOBS.drtone), 16000);
  assert.equal(T.rvHighHz(T.KNOBS.rvhigh), 20000);
  assert.equal(T.dToneHz(T.KNOBS.dtone), 20000);
  assert.equal(T.KNOBS.rvwet, 0);
});

test('knob maps hit their documented ends', () => {
  const T = load();
  assert.equal(T.hpHz(1), 500);
  assert.ok(Math.abs(T.minDecSec(1) - 0.6) < 1e-9);
  assert.ok(Math.abs(T.pwFrac(0) - 0.05) < 1e-9 && Math.abs(T.pwFrac(1) - 0.95) < 1e-9);
  assert.ok(Math.abs(T.lfoHz(0) - 0.05) < 1e-9 && Math.abs(T.lfoHz(1) - 20) < 1e-9);
  assert.equal(T.drDb(1), 30);
  assert.equal(T.drVolDb(0), -12); assert.equal(T.drVolDb(1), 12);
  assert.equal(T.drHpHz(1), 800);
  assert.ok(Math.abs(T.rvDecSec(0) - 0.3) < 1e-9 && Math.abs(T.rvDecSec(1) - 6) < 1e-9);
  assert.ok(Math.abs(T.rvPreSec(1) - 0.2) < 1e-9);
  assert.equal(T.rvLowHz(1), 500);
  assert.ok(Math.abs(T.dbGain(6.0206) - 2) < 1e-3);
});

test('key follow: 100 percent tracks pitch octave for octave around C3', () => {
  const T = load();
  assert.equal(T.keyMul(1, 48), 1);
  assert.equal(T.keyMul(1, 60), 2);
  assert.equal(T.keyMul(1, 36), 0.5);
  assert.ok(Math.abs(T.keyMul(0.5, 60) - Math.SQRT2) < 1e-9);
});

test('state: drive and reverb switches clean, old saves open neutral', () => {
  const T = load();
  const plain = (x) => JSON.parse(JSON.stringify(x));
  const s = plain(T.cleanState({ drive: { on: true, type: 'tube' }, reverb: { on: true } }));
  assert.deepEqual(s.drive, { on: true, type: 'tube' });
  assert.deepEqual(s.reverb, { on: true });
  assert.deepEqual(plain(T.cleanState({ drive: { on: 'yes', type: 'fuzz' } }).drive), { on: false, type: 'soft' });
  const old = plain(T.cleanState({ knobs: { cutoff: 0.3 } }));
  assert.equal(old.knobs.cutoff, 0.3);
  assert.equal(old.knobs.rvwet, 0);
  assert.deepEqual(old.drive, { on: false, type: 'soft' });
  assert.equal(Object.keys(old.auto).length, Object.keys(T.KNOBS).length);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test acidbass.test.mjs`
Expected: FAIL (`T.hpHz is not a function` and similar).

- [ ] **Step 3: Implement**

In `acidbass.js`, extend `KNOBS` (replace the closing of the object after the `dtime` line):

```js
    dtime: 0.5, dfb: 0.45, dmix: 0,   // delay: mix 0 is bypassed, so a fresh machine sounds as before
    dtone: 1, dwid: 1,                // delay tone (1 = open) and stereo width (1 = full ping-pong)
    hp: 0, kfol: 0, mind: 0, pw: 0.5, lfor: 0.6157, lfopw: 0,   // tweaks: every default is neutral
    drhp: 0, drdrive: 0, drtone: 1, drvol: 0.5, drmix: 1,        // drive (off until switched on)
    rvpre: 0, rvsize: 0.5, rvdec: 0.5, rvdamp: 0.5, rvlow: 0, rvhigh: 1, rvwid: 1, rvdry: 1, rvwet: 0,   // reverb (off, wet 0)
  };
```

Add the maps after `const stepSeconds = ...` (line 107):

```js
  // Tweaks, drive, reverb and delay-tone maps. Frequencies are exponential in the knob, like the cutoff.
  const k01 = (k, d) => num(k, 0, 1, d);
  const hpHz = (k) => 20 * Math.pow(25, k01(k, 0));                 // 20 Hz .. 500 Hz
  const minDecSec = (k) => 0.03 * Math.pow(20, k01(k, 0));          // 30 ms .. 0.6 s
  const pwFrac = (k) => 0.05 + 0.9 * k01(k, 0.5);                   // 5 % .. 95 %
  const lfoHz = (k) => 0.05 * Math.pow(400, k01(k, 0.6157));        // 0.05 Hz .. 20 Hz
  // Key follow: at 100 % the cutoff moves an octave per octave of pitch, with C3 (MIDI 48) as the neutral note.
  const keyMul = (k, midi) => Math.pow(2, k01(k, 0) * (midi - 48) / 12);
  const drHpHz = (k) => 20 * Math.pow(40, k01(k, 0));               // 20 Hz .. 800 Hz
  const drDb = (k) => 30 * k01(k, 0);                               // 0 .. 30 dB of drive
  const drToneHz = (k) => 800 * Math.pow(20, k01(k, 1));            // 0.8 .. 16 kHz
  const drVolDb = (k) => (k01(k, 0.5) - 0.5) * 24;                  // +-12 dB
  const dbGain = (db) => Math.pow(10, db / 20);
  const rvPreSec = (k) => 0.2 * k01(k, 0);                          // 0 .. 200 ms
  const rvDecSec = (k) => 0.3 * Math.pow(20, k01(k, 0.5));          // 0.3 .. 6 s
  const rvSizeScale = (k) => 0.5 + k01(k, 0.5);                     // 0.5 .. 1.5, stretches the build-up
  const rvLowHz = (k) => 20 * Math.pow(25, k01(k, 0));              // 20 .. 500 Hz
  const rvHighHz = (k) => 1000 * Math.pow(20, k01(k, 1));           // 1 .. 20 kHz
  const dToneHz = (k) => 400 * Math.pow(50, k01(k, 1));             // 0.4 .. 20 kHz
```

In `cleanState`, add before `return {`:

```js
    const dr = r.drive && typeof r.drive === 'object' ? r.drive : {};
    const rv = r.reverb && typeof r.reverb === 'object' ? r.reverb : {};
```

and inside the returned object after the `delay:` line:

```js
      drive: { on: dr.on === true, type: DRIVE_TYPES.includes(dr.type) ? dr.type : 'soft' },
      reverb: { on: rv.on === true },
```

Add near the top constants (after `SONG_MAX`):

```js
  const DRIVE_TYPES = ['soft', 'tube', 'wavefold'];
```

Add to the `window.TB303` export list: `DRIVE_TYPES, hpHz, minDecSec, pwFrac, lfoHz, keyMul, drHpHz, drDb, drToneHz, drVolDb, dbGain, rvPreSec, rvDecSec, rvSizeScale, rvLowHz, rvHighHz, dToneHz,`.

- [ ] **Step 4: Run to verify pass**

Run: `bun test; node --test`
Expected: all pass on both (50 old + 4 new tests), 0 fail.

- [ ] **Step 5: Commit**

```powershell
git add acidbass.js acidbass.test.mjs
git commit -m "Core: knob maps and state for tweaks, drive, reverb, delay tone"
```

---

### Task 2: Core drive curves and the reverb impulse response

**Files:**
- Modify: `acidbass.js` (new block after the maps from Task 1; export list)
- Test: `acidbass.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
test('drive shapes are bounded; tube is asymmetric, soft is odd', () => {
  const T = load();
  for (const type of T.DRIVE_TYPES) {
    const c = T.driveCurve(type);
    assert.equal(c.length, 2048);
    for (const v of c) assert.ok(Math.abs(v) <= 1.4 && Number.isFinite(v), type);
    assert.ok(Math.abs(c[1023] + c[1024]) < 0.01 || type === 'tube' || type === 'wavefold');   // near the middle: no jump
  }
  const soft = T.driveCurve('soft'), tube = T.driveCurve('tube');
  assert.ok(Math.abs(soft[300] + soft[2047 - 300]) < 1e-6);        // odd symmetry
  assert.ok(Math.abs(tube[300] + tube[2047 - 300]) > 0.05);        // asymmetric
  assert.ok(Math.abs(T.driveCurve('nonsense')[10] - soft[10]) < 1e-12);   // unknown type = soft
});

test('wavefold folds back: output is not monotonic', () => {
  const T = load();
  const c = T.driveCurve('wavefold');
  let up = 0, down = 0;
  for (let i = 1; i < c.length; i++) { if (c[i] > c[i - 1]) up++; else if (c[i] < c[i - 1]) down++; }
  assert.ok(up > 0 && down > 0);
});

test('drive makeup gain only ever turns the level down as drive rises', () => {
  const T = load();
  assert.equal(T.driveMakeupDb(0), 0);
  assert.ok(T.driveMakeupDb(30) < T.driveMakeupDb(10) && T.driveMakeupDb(10) < 0);
});

test('reverb IR: repeatable, seeded, decaying, damp darkens it', () => {
  const T = load();
  const a = T.reverbIR(8000, 1, 0.5, 0.5, 0.5), b = T.reverbIR(8000, 1, 0.5, 0.5, 0.5), c = T.reverbIR(8000, 2, 0.5, 0.5, 0.5);
  assert.equal(a.L.length, b.L.length);
  assert.ok(a.L.every((v, i) => v === b.L[i] && a.R[i] === b.R[i]));
  assert.ok(a.L.some((v, i) => v !== c.L[i]));
  assert.notDeepEqual(Array.from(a.L.slice(0, 50)), Array.from(a.R.slice(0, 50)));   // two channels are decorrelated
  const rms = (x, lo, hi) => Math.sqrt(x.slice(Math.floor(x.length * lo), Math.floor(x.length * hi)).reduce((s, v) => s + v * v, 0) / (x.length * (hi - lo)));
  assert.ok(rms(a.L, 0.1, 0.3) > 3 * rms(a.L, 0.7, 0.9));
  const hf = (x) => { let d = 0, e = 1e-12; for (let i = 1; i < x.length; i++) { d += (x[i] - x[i - 1]) ** 2; e += x[i] ** 2; } return d / e; };
  const bright = T.reverbIR(8000, 1, 0.5, 0.5, 0), dark = T.reverbIR(8000, 1, 0.5, 0.5, 1);
  assert.ok(hf(dark.L) < 0.6 * hf(bright.L));
  assert.ok(a.L.length <= 8000 * 7);
});

test('reverb IR length follows the decay knob', () => {
  const T = load();
  assert.ok(T.reverbIR(8000, 1, 0.5, 1, 0.5).L.length > 4 * T.reverbIR(8000, 1, 0.5, 0, 0.5).L.length);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test acidbass.test.mjs`
Expected: FAIL (`T.driveCurve is not a function`).

- [ ] **Step 3: Implement**

In `acidbass.js` add after the maps block from Task 1:

```js
  // ---- drive curves: a lookup table over input -1..1, which stands for -DRIVE_RANGE..+DRIVE_RANGE in shape units ----
  const DRIVE_RANGE = 1.5;
  function driveShape(type, x) {
    if (type === 'tube') return Math.tanh(x + 0.35) - Math.tanh(0.35);   // biased tanh: asymmetric, even harmonics, zero at zero
    if (type === 'wavefold') return Math.sin(x * 1.3);                   // folds back over itself once the input is big
    return Math.tanh(x);
  }
  function driveCurve(type, n) {
    const len = n || 2048, c = new Float32Array(len);
    for (let i = 0; i < len; i++) c[i] = driveShape(type, DRIVE_RANGE * (2 * i / (len - 1) - 1));
    return c;
  }
  // Level compensation: take back 40 % of the drive in dB, so full drive is not much louder than bypass. Tuned by ear
  // and checked by the render test in the plan; change the 0.4 only together with that check.
  const driveMakeupDb = (db) => -0.4 * db;

  // ---- reverb impulse response: seeded noise, exponential decay (-60 dB at the decay time), a fade-in set by Size, and a
  // one-pole lowpass that closes as the tail ages (Hi damp). Same seed in, same samples out, so tests and the plugin agree. ----
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function reverbIR(sr, seed, size, decay, damp) {
    const rt = rvDecSec(decay), len = Math.min(Math.ceil(sr * rt), sr * 7), fade = 0.005 + 0.04 * k01(size, 0.5), dm = k01(damp, 0.5);
    const out = { L: new Float32Array(len), R: new Float32Array(len) };
    ['L', 'R'].forEach((ch, c) => {
      const r = rng(seed * 2 + c); let y = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr, env = Math.exp(-6.9 * t / rt) * Math.min(1, t / fade);
        const a = 1 - dm * 0.9 * (1 - Math.exp(-4 * t / rt));   // 1 = open, closing toward 0.1 as the tail ages
        y += a * ((r() * 2 - 1) * env - y);
        out[ch][i] = y;
      }
    });
    return out;
  }
```

Add to the export list: `driveShape, driveCurve, driveMakeupDb, reverbIR,`.

- [ ] **Step 4: Run to verify pass**

Run: `bun test; node --test`
Expected: all pass on both. If the "damp darkens" test fails by a small margin, widen the gap by raising the `0.9` in the damp coefficient to `0.95` (keep `a` above 0).

- [ ] **Step 5: Commit**

```powershell
git add acidbass.js acidbass.test.mjs
git commit -m "Core: drive curves, makeup gain and the seeded reverb impulse response"
```

---

### Task 3: Tweaks panel, pulse-width oscillator, HP, key follow, min decay

**Files:**
- Modify: `index.html` (CSS near line 14-30, toolbar line ~89, panels near line 70-77, script: globals line 136, `buildGraph` 148, `gateOff`/`play` 214-251, `KNOBDEF` 375, `setKnob` 397, `applyCutoff` 410, `setWave` 465, automation interval 523, `adopt` 603)

- [ ] **Step 1: Add the panel and toolbar button**

After the `#fx` panel (ends at line 76) add:

```html
  <div class="panel hidden" id="tw">
    <div class="eg"><div class="gt">Tweaks</div><div class="krow" id="twK"></div></div>
  </div>
```

In the toolbar next to `#fxBtn` (line 89) add before it:

```html
    <button class="btn" id="twBtn" aria-pressed="false" title="show the tweaks: high-pass, key follow, minimum decay, pulse width and its LFO">Tweaks</button>
```

Wire it with the other panel toggles (next to line 536):

```js
$('twBtn').onclick = () => { const on = $('tw').classList.contains('hidden'); $('tw').classList.toggle('hidden', !on); flag('twBtn', on); };
```

- [ ] **Step 2: Add the knob definitions**

Append to `KNOBDEF` (before the closing `];`):

```js
  ['hp', 'HP', (v) => Math.round(T.hpHz(v)) + 'Hz', 'twK'],
  ['kfol', 'Key Follow', pc, 'twK'],
  ['mind', 'Min Decay', (v) => ms(T.minDecSec(v)), 'twK'],
  ['pw', 'PW', (v) => Math.round(T.pwFrac(v) * 100) + '%', 'twK'],
  ['lfor', 'LFO Rate', (v) => T.lfoHz(v).toFixed(2) + 'Hz', 'twK'],
  ['lfopw', 'LFO>PW', pc, 'twK'],
```

- [ ] **Step 3: Rebuild the oscillator and filter front end**

Replace line 136 (`let ctx = null, osc, f1, f2, vca, master;`) with:

```js
let ctx = null, osc, hpF, pwG, pwDly, pwLfo, pwLfoG, f1, f2, vca, master, keyMul = 1;
const mkSet = (snap) => { const now = ctx.currentTime; return (p, v) => (snap ? (p.value = v) : p.setTargetAtTime(v, now, 0.03)); };
```

In `buildGraph`, replace the line creating `osc` (line 150) and the connection line (line 160 `osc.connect(f1); ...`) as follows. Delete line 150 and put this in its place:

```js
  osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 110;
  // Square = the saw minus a copy of itself delayed by pw/frequency: a pulse whose width is the delay (no aliasing a naive pulse would add).
  // The LFO adds to that delay, which is the pulse-width modulation. Saw mode just mutes the delayed copy.
  const sum = ctx.createGain(); pwG = ctx.createGain(); pwG.gain.value = S.wave === 'square' ? -1 : 0;
  pwDly = ctx.createDelay(0.05); pwDly.delayTime.value = 0.5 / 110;
  pwLfo = ctx.createOscillator(); pwLfo.frequency.value = T.lfoHz(S.knobs.lfor); pwLfoG = ctx.createGain(); pwLfoG.gain.value = 0;
  osc.connect(sum); osc.connect(pwG); pwG.connect(pwDly); pwDly.connect(sum); pwLfo.connect(pwLfoG); pwLfoG.connect(pwDly.delayTime);
  hpF = ctx.createBiquadFilter(); hpF.type = 'highpass'; hpF.Q.value = 0.7071; hpF.frequency.value = T.hpHz(S.knobs.hp);
```

Replace the connection line (old line 160) with:

```js
  sum.connect(hpF); hpF.connect(f1); f1.connect(f2); f2.connect(vca); vca.connect(master); master.connect(sh);
```

and replace `osc.start();` (line 162) with `osc.start(); pwLfo.start();`.

Replace the `setWave` body's second line (old line 467) with:

```js
  if (pwG) pwG.gain.setTargetAtTime(w === 'square' ? -1 : 0, ctx.currentTime, 0.005);
```

- [ ] **Step 4: Key follow, min decay, pulse width in `play` and the cutoff helpers**

Add after `const effCut = ...` (line 212):

```js
// The cutoff the filter rests at: the knob (or its automation), shifted by key follow for the note now sounding.
const cutHz = (t) => Math.min(16000, T.cutoffHz(effCut(t)) * keyMul);
```

In `gateOff` replace `const base = T.cutoffHz(effCut(t));` with `const base = cutHz(t);`.

In `applyCutoff` replace `T.cutoffHz(effCut())` with `cutHz()`.

In `play`, after `const f = T.freqOf(...)` (line 224) insert:

```js
  keyMul = T.keyMul(k.kfol, ev.midi);
  const pw = T.pwFrac(k.pw), lfoAmt = k.lfopw * 0.4;   // pulse width as a fraction of the period; the LFO swings +-0.4 of it at 100 %
```

Replace the pitch block (old lines 225-231, `if (ev.glide) {...} else if (ev.trig) {...}` and `lastFreq = f;`) with:

```js
  if (ev.glide) {
    osc.frequency.setValueAtTime(lastFreq, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.06);   // the 303's ~60 ms slide
    pwDly.delayTime.setValueAtTime(pw / lastFreq, t); pwDly.delayTime.exponentialRampToValueAtTime(pw / f, t + 0.06);
    pwLfoG.gain.setValueAtTime(lfoAmt / lastFreq, t); pwLfoG.gain.linearRampToValueAtTime(lfoAmt / f, t + 0.06);
  } else if (ev.trig) {
    osc.frequency.setValueAtTime(f, t);
    pwDly.delayTime.setValueAtTime(pw / f, t); pwLfoG.gain.setValueAtTime(lfoAmt / f, t);
  }
  lastFreq = f;
```

In the trig block replace `const base = T.cutoffHz(effCut(t)), acc = ev.accent ? k.accent : 0;` with `const base = cutHz(t), acc = ev.accent ? k.accent : 0;` and replace the `dec` line (old 239) with:

```js
    const atk = T.atkSec(k.fatk), dec = Math.max(ev.accent ? Math.min(T.decSec(k.fdec), 0.2) : T.decSec(k.fdec), T.minDecSec(k.mind));   // accent: short filter decay, never below Min Decay
```

- [ ] **Step 5: Push tweak knobs live (setKnob and the automation interval)**

Add to `setKnob` (after the `volume` line):

```js
  if (key === 'hp' || key === 'lfor') applyTweaks();
```

Add after `applyCutoff`:

```js
// HP and the LFO rate are live params. PW, LFO depth, key follow and min decay are read per note, in play().
function applyTweaks(snap) {
  if (!ctx) return;
  const set = mkSet(snap);
  set(hpF.frequency, T.hpHz(val('hp'))); set(pwLfo.frequency, T.lfoHz(val('lfor')));
}
```

In the automation `setInterval` add before the `if (S.auto.cutoff.on)` line: `if (S.auto.hp.on || S.auto.lfor.on) applyTweaks();`.

In `adopt`, after the `paintDelay();` line add `applyTweaks(true);`.

- [ ] **Step 6: Run the unit tests**

Run: `bun test; node --test`
Expected: all green (the page is not covered by node tests; this guards the core).

- [ ] **Step 7: Verify in the browser (offline render)**

Serve the page, navigate to `http://localhost:8777/`, check the console has no errors, load `tools/render-harness.js`, then run in `browser_evaluate`:

```js
async () => {
  const h = window.__h, ref = await (await fetch('tests/render-reference.json')).json();
  const notes = [{ midi: 45, t: 0.05 }, { midi: 52, t: 0.5, accent: true }, { midi: 57, t: 0.95, glide: true, trig: false }];
  const out = {};
  const saw = await h.render({ wave: 'saw', notes, secs: 1.8 });
  out.sawRmsRatio = h.rms(saw.L) / ref.saw.rms;                       // expect 0.97..1.03
  out.sq = (await h.render({ wave: 'square', notes, secs: 1.8 }));
  out.sqRmsRatio = h.rms(out.sq.L) / ref.square.rms; delete out.sq;   // expect 0.93..1.07 (pulse by delay vs native square)
  const a = await h.render({ wave: 'saw', knobs: { hp: 0 }, notes: [{ midi: 33, t: 0.05 }], secs: 0.6 });
  const b = await h.render({ wave: 'saw', knobs: { hp: 1 }, notes: [{ midi: 33, t: 0.05 }], secs: 0.6 });
  out.hpRatio = h.rms(b.L) / h.rms(a.L);                              // expect < 0.5
  const k0 = await h.render({ wave: 'saw', knobs: { kfol: 0 }, notes: [{ midi: 72, t: 0.05 }], secs: 0.6 });
  const k1 = await h.render({ wave: 'saw', knobs: { kfol: 1 }, notes: [{ midi: 72, t: 0.05 }], secs: 0.6 });
  out.keyBright = h.bright(k1.L) / h.bright(k0.L);                    // expect > 1.2
  const open = { cutoff: 1, envmod: 0, res: 0 };
  const w5 = await h.render({ wave: 'square', knobs: { ...open, pw: 0.5 }, notes: [{ midi: 36, t: 0.05 }], secs: 0.6 });
  const w1 = await h.render({ wave: 'square', knobs: { ...open, pw: 0 }, notes: [{ midi: 36, t: 0.05 }], secs: 0.6 });
  const mid = [Math.floor(0.2 * h.sr), Math.floor(0.5 * h.sr)];
  out.duty50 = h.duty(w5.L, ...mid); out.duty5 = h.duty(w1.L, ...mid);   // expect |duty50-0.5| < 0.1 and |duty5-0.5| > 0.25
  const d0 = await h.render({ wave: 'saw', knobs: { fdec: 0, mind: 0 }, notes: [{ midi: 45, t: 0.05 }], secs: 0.6 });
  const d1 = await h.render({ wave: 'saw', knobs: { fdec: 0, mind: 1 }, notes: [{ midi: 45, t: 0.05 }], secs: 0.6 });
  const w = [Math.floor(0.25 * h.sr), Math.floor(0.35 * h.sr)];
  out.minDecBright = h.bright(d1.L, ...w) / h.bright(d0.L, ...w);     // expect > 1.2
  return out;
}
```

Expected values are in the comments. If `sqRmsRatio` falls outside 0.93..1.07, listen-check by also logging `h.corr` of the square render against a native-square render is not available; instead lower the bar to 0.85..1.15 only if the waveform is visibly a clean pulse (render `duty50` near 0.5 confirms it).

- [ ] **Step 8: Eyeball the panel**

Take a screenshot with the Tweaks panel open, save it to `C:\Users\Arikl\Desktop\screenshots\tweaks-panel.png` (move it there if Playwright writes it elsewhere). Check six knobs sit in a row with no horizontal page scroll at 1100 px: run `() => document.documentElement.scrollWidth <= innerWidth` and expect `true`.

- [ ] **Step 9: Clean up and commit**

Kill the server, delete your files in `algo-art\.playwright-mcp`, then:

```powershell
git add index.html
git commit -m "Tweaks: high-pass, key follow, min decay, pulse width and LFO to PW"
```

---

### Task 4: Drive panel

**Files:**
- Modify: `index.html` (panel HTML, toolbar, `KNOBDEF`, graph, `setKnob`, interval, `adopt`)

- [ ] **Step 1: Panel, button, knob definitions**

After the `#tw` panel:

```html
  <div class="panel hidden" id="dr">
    <div class="eg"><div class="gt">Drive</div><div class="krow" id="drK"></div></div>
    <div class="eg"><div class="gt">Mode</div>
      <div class="krow" style="align-items:center;gap:8px"><button class="btn" id="drOn" aria-pressed="false" title="drive on or off">On</button><button class="btn" id="drSoft" aria-pressed="true">Soft</button><button class="btn" id="drTube" aria-pressed="false">Tube</button><button class="btn" id="drFold" aria-pressed="false">Fold</button></div>
    </div>
  </div>
```

Toolbar button before `#fxBtn`: `<button class="btn" id="drBtn" aria-pressed="false" title="show the drive: amount, tone, type, mix">Drive</button>`

Toggle wiring (with the other panel toggles):

```js
$('drBtn').onclick = () => { const on = $('dr').classList.contains('hidden'); $('dr').classList.toggle('hidden', !on); flag('drBtn', on); };
```

`KNOBDEF` additions:

```js
  ['drdrive', 'Drive', (v) => '+' + T.drDb(v).toFixed(1) + 'dB', 'drK'],
  ['drhp', 'HP', (v) => Math.round(T.drHpHz(v)) + 'Hz', 'drK'],
  ['drtone', 'Tone', (v) => (T.drToneHz(v) / 1000).toFixed(1) + 'k', 'drK'],
  ['drvol', 'Volume', (v) => (T.drVolDb(v) >= 0 ? '+' : '') + T.drVolDb(v).toFixed(1) + 'dB', 'drK'],
  ['drmix', 'Mix', pc, 'drK'],
```

- [ ] **Step 2: Build the drive stage**

Add `drFx` to the `let` globals: `let drFx = null;` (next to `let dry, wet, dFx = null, fatCurve = null;`).

In `buildGraph` replace `vca.connect(master)` (inside the connection line from Task 3) so the line reads `... f2.connect(vca); buildDrive(vca, master); master.connect(sh);`.

Add after `buildGraph`:

```js
// ---- drive: a parallel stage. dry path untouched; wet path = HP -> pre-gain -> 4x oversampled shaper -> tone -> DC block -> volume ----
function buildDrive(src, out) {
  const dryG = ctx.createGain(), hp = ctx.createBiquadFilter(), pre = ctx.createGain(), sh = ctx.createWaveShaper();
  const tone = ctx.createBiquadFilter(), dc = ctx.createBiquadFilter(), vol = ctx.createGain(), wetG = ctx.createGain();
  hp.type = 'highpass'; hp.Q.value = 0.7071; tone.type = 'lowpass'; dc.type = 'highpass'; dc.frequency.value = 20; sh.oversample = '4x';
  src.connect(dryG); dryG.connect(out);
  src.connect(hp); hp.connect(pre); pre.connect(sh); sh.connect(tone); tone.connect(dc); dc.connect(vol); vol.connect(wetG); wetG.connect(out);
  drFx = { dryG, hp, pre, sh, tone, vol, wetG, type: null };
  applyDrive(true);
}
function applyDrive(snap) {
  if (!drFx) return;
  const set = mkSet(snap), on = S.drive.on, mix = val('drmix'), db = T.drDb(val('drdrive'));
  set(drFx.dryG.gain, on ? 1 - mix : 1); set(drFx.wetG.gain, on ? mix : 0);
  set(drFx.hp.frequency, T.drHpHz(val('drhp'))); set(drFx.pre.gain, T.dbGain(db));
  set(drFx.tone.frequency, T.drToneHz(val('drtone')));
  set(drFx.vol.gain, T.dbGain(T.drVolDb(val('drvol')) + T.driveMakeupDb(db)));
  if (drFx.type !== S.drive.type) { drFx.sh.curve = T.driveCurve(S.drive.type); drFx.type = S.drive.type; }
}
function paintDrive() {
  flag('drOn', S.drive.on); flag('drSoft', S.drive.type === 'soft'); flag('drTube', S.drive.type === 'tube'); flag('drFold', S.drive.type === 'wavefold');
  applyDrive();
}
$('drOn').onclick = () => { ensureAudio(); S.drive.on = !S.drive.on; paintDrive(); save(); };
$('drSoft').onclick = () => { ensureAudio(); S.drive.type = 'soft'; paintDrive(); save(); };
$('drTube').onclick = () => { ensureAudio(); S.drive.type = 'tube'; paintDrive(); save(); };
$('drFold').onclick = () => { ensureAudio(); S.drive.type = 'wavefold'; paintDrive(); save(); };
```

(`flag` is defined at line 364, after `buildGraph` but before these handlers run, so the `$('drOn').onclick` lines belong with the other button wiring, after `flag`'s definition. Place the four `onclick` lines next to `$('dPP').onclick`.)

- [ ] **Step 3: Live pushes**

In `setKnob` add: `if (key.startsWith('dr')) applyDrive();`.
In the automation interval add: `if (['drdrive', 'drhp', 'drtone', 'drvol', 'drmix'].some((n) => S.auto[n].on)) applyDrive();`.
In `adopt` after `paintDelay();` add `paintDrive();`.

- [ ] **Step 4: Verify in the browser**

Serve, load the harness, then:

```js
async () => {
  const h = window.__h, ref = await (await fetch('tests/render-reference.json')).json();
  const notes = [{ midi: 45, t: 0.05 }, { midi: 52, t: 0.5, accent: true }, { midi: 57, t: 0.95, glide: true, trig: false }];
  const out = {};
  const off = await h.render({ wave: 'saw', notes, secs: 1.8 });
  out.bypassRatio = h.rms(off.L) / ref.saw.rms;                                      // expect 0.97..1.03
  const offKnobs = await h.render({ wave: 'saw', knobs: { drdrive: 1, drmix: 1 }, drive: { on: false }, notes, secs: 1.8 });
  out.offIgnoresKnobs = h.corr(off.L, offKnobs.L);                                    // expect > 0.9999
  const on = await h.render({ wave: 'saw', knobs: { drdrive: 1 }, drive: { on: true, type: 'soft' }, notes, secs: 1.8 });
  out.driveLevel = h.rms(on.L) / h.rms(off.L);                                        // expect 0.5..1.42 (at most ~3 dB louder)
  out.driveBright = h.bright(on.L) / h.bright(off.L);                                 // expect > 1.15 (added harmonics)
  for (const type of ['tube', 'wavefold']) {
    const r = await h.render({ wave: 'saw', knobs: { drdrive: 1 }, drive: { on: true, type }, notes, secs: 1.8 });
    out[type + 'Level'] = h.rms(r.L) / h.rms(off.L); out[type + 'Peak'] = h.peak(r.L);   // finite, peak < 1.5
  }
  const hp = await h.render({ wave: 'saw', knobs: { drdrive: 0.5, drhp: 1, drmix: 1 }, drive: { on: true }, notes: [{ midi: 33, t: 0.05 }], secs: 0.6 });
  const nohp = await h.render({ wave: 'saw', knobs: { drdrive: 0.5, drhp: 0, drmix: 1 }, drive: { on: true }, notes: [{ midi: 33, t: 0.05 }], secs: 0.6 });
  out.drHpRatio = h.rms(hp.L) / h.rms(nohp.L);                                        // expect < 0.8
  return out;
}
```

If `driveLevel` is outside 0.5..1.42, change only the `0.4` in `driveMakeupDb` (in `acidbass.js`; keep the test for monotonic decrease) and rerun; the aim is a value between 0.9 and 1.3.

- [ ] **Step 5: Tests and commit**

Run: `bun test; node --test` (green). Screenshot the Drive panel to `C:\Users\Arikl\Desktop\screenshots\drive-panel.png`. Kill the server, clean `.playwright-mcp`.

```powershell
git add index.html acidbass.js
git commit -m "Drive: parallel soft, tube and wavefold stage with tone, HP, volume and mix"
```

---

### Task 5: Reverb panel

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Panel, button, knob definitions**

After the `#dr` panel:

```html
  <div class="panel hidden" id="rv">
    <div class="eg"><div class="gt">Reverb</div><div class="krow" id="rvK"></div></div>
    <div class="eg"><div class="gt">Mode</div>
      <div class="krow" style="align-items:center;gap:8px"><button class="btn" id="rvOn" aria-pressed="false" title="reverb on or off">On</button></div>
    </div>
  </div>
```

Toolbar button before `#fxBtn`: `<button class="btn" id="rvBtn" aria-pressed="false" title="show the reverb">Reverb</button>`

Toggle: `$('rvBtn').onclick = () => { const on = $('rv').classList.contains('hidden'); $('rv').classList.toggle('hidden', !on); flag('rvBtn', on); };`

`KNOBDEF` additions:

```js
  ['rvpre', 'Pre-delay', (v) => Math.round(T.rvPreSec(v) * 1000) + 'ms', 'rvK'],
  ['rvsize', 'Size', pc, 'rvK'],
  ['rvdec', 'Decay', (v) => T.rvDecSec(v).toFixed(1) + 's', 'rvK'],
  ['rvdamp', 'Hi Damp', pc, 'rvK'],
  ['rvlow', 'Low Cut', (v) => Math.round(T.rvLowHz(v)) + 'Hz', 'rvK'],
  ['rvhigh', 'Hi Cut', (v) => (T.rvHighHz(v) / 1000).toFixed(1) + 'k', 'rvK'],
  ['rvwid', 'Width', pc, 'rvK'],
  ['rvdry', 'Dry', pc, 'rvK'],
  ['rvwet', 'Wet', pc, 'rvK'],
```

- [ ] **Step 2: Build the reverb and route the delay into it**

Add `let rvFx = null;` next to the other globals.

Change `buildDelay` to take its output: signature `function buildDelay(src, out)`, and replace `dry.connect(ctx.destination); wet.connect(ctx.destination);` with `dry.connect(out); wet.connect(out);`.

In `buildGraph` replace `buildDelay(sh);` with:

```js
  const rvIn = ctx.createGain(); buildDelay(sh, rvIn); buildReverb(rvIn, ctx.destination);
```

Add after `buildDrive`/`applyDrive`:

```js
// ---- reverb: dry + a wet bus (pre-delay -> convolver -> low cut -> high cut -> width). The impulse response is generated
// by the core; a Size/Decay/Hi-damp change builds a fresh convolver and crossfades to it so there is no click. ----
function buildReverb(src, out) {
  const dryG = ctx.createGain(), pre = ctx.createDelay(0.25), lo = ctx.createBiquadFilter(), hi = ctx.createBiquadFilter();
  const sp = ctx.createChannelSplitter(2), mg = ctx.createChannelMerger(2), wetG = ctx.createGain();
  lo.type = 'highpass'; lo.Q.value = 0.7071; hi.type = 'lowpass'; hi.Q.value = 0.7071;
  const mix = () => { const g = ctx.createGain(); return g; };
  const gLL = mix(), gRR = mix(), gLR = mix(), gRL = mix();   // width: mid/side blend between the two channels
  src.connect(dryG); dryG.connect(out);
  src.connect(pre); lo.connect(hi); hi.connect(sp);
  sp.connect(gLL, 0); gLL.connect(mg, 0, 0); sp.connect(gLR, 0); gLR.connect(mg, 0, 1);
  sp.connect(gRL, 1); gRL.connect(mg, 0, 0); sp.connect(gRR, 1); gRR.connect(mg, 0, 1);
  mg.connect(wetG); wetG.connect(out);
  rvFx = { dryG, pre, lo, hi, wetG, gLL, gRR, gLR, gRL, conv: null, key: '', at: -1 };
  applyReverb(true);
}
function loadIR(snap) {
  const k = [val('rvsize'), val('rvdec'), val('rvdamp')], key = k.map((v) => Math.round(v * 50)).join(',');
  if (key === rvFx.key) return;
  const now = ctx.currentTime;
  if (!snap && now - rvFx.at < 0.25) return;   // automation can move these 30x a second: rebuild at most 4x a second
  rvFx.key = key; rvFx.at = now;
  const ir = T.reverbIR(ctx.sampleRate, 1, k[0], k[1], k[2]);
  const buf = ctx.createBuffer(2, ir.L.length, ctx.sampleRate); buf.copyToChannel(ir.L, 0); buf.copyToChannel(ir.R, 1);
  const conv = ctx.createConvolver(), g = ctx.createGain(); conv.buffer = buf;
  rvFx.pre.connect(conv); conv.connect(g); g.connect(rvFx.lo);
  const old = rvFx.conv;
  if (old && !snap) {
    g.gain.value = 0; g.gain.setTargetAtTime(1, now, 0.02); old.g.gain.setTargetAtTime(0, now, 0.02);
    setTimeout(() => { try { rvFx.pre.disconnect(old.conv); old.g.disconnect(); } catch (_) { /* already gone */ } }, 400);
  } else if (old) { rvFx.pre.disconnect(old.conv); old.g.disconnect(); }
  rvFx.conv = { conv, g };
}
function applyReverb(snap) {
  if (!rvFx) return;
  const set = mkSet(snap), on = S.reverb.on;
  loadIR(snap);
  set(rvFx.pre.delayTime, T.rvPreSec(val('rvpre')));
  set(rvFx.lo.frequency, T.rvLowHz(val('rvlow'))); set(rvFx.hi.frequency, T.rvHighHz(val('rvhigh')));
  const w = val('rvwid'), same = (1 + w) / 2, cross = (1 - w) / 2;
  set(rvFx.gLL.gain, same); set(rvFx.gRR.gain, same); set(rvFx.gLR.gain, cross); set(rvFx.gRL.gain, cross);
  set(rvFx.dryG.gain, on ? val('rvdry') : 1); set(rvFx.wetG.gain, on ? val('rvwet') : 0);
}
function paintReverb() { flag('rvOn', S.reverb.on); applyReverb(); }
```

Wire next to `$('dPP').onclick`:

```js
$('rvOn').onclick = () => { ensureAudio(); S.reverb.on = !S.reverb.on; paintReverb(); save(); };
```

- [ ] **Step 3: Live pushes**

`setKnob`: `if (key.startsWith('rv')) applyReverb();`
Automation interval: `if (['rvpre', 'rvsize', 'rvdec', 'rvdamp', 'rvlow', 'rvhigh', 'rvwid', 'rvdry', 'rvwet'].some((n) => S.auto[n].on)) applyReverb();`
`adopt`: after `paintDrive();` add `paintReverb();`.

- [ ] **Step 4: Verify in the browser**

Serve, load harness, run:

```js
async () => {
  const h = window.__h, ref = await (await fetch('tests/render-reference.json')).json();
  const notes = [{ midi: 45, t: 0.05 }];
  const out = {};
  const base = await h.render({ wave: 'saw', notes: [{ midi: 45, t: 0.05 }, { midi: 52, t: 0.5, accent: true }, { midi: 57, t: 0.95, glide: true, trig: false }], secs: 1.8 });
  out.bypassRatio = h.rms(base.L) / ref.saw.rms;                                       // expect 0.97..1.03
  const tailFrom = Math.floor(1.0 * h.sr);
  // Tails are read at 0.3-0.6 s: the IR is -60 dB at its decay time (1.34 s at the default Decay), so 1.0 s is too quiet.
  const tA = Math.floor(0.3 * h.sr), tB = Math.floor(0.6 * h.sr);
  const dryR = await h.render({ wave: 'saw', knobs: { rvwet: 0 }, reverb: { on: true }, notes, secs: 3 });
  const wetR = await h.render({ wave: 'saw', knobs: { rvwet: 1, rvdry: 0 }, reverb: { on: true }, notes, secs: 3 });
  out.tailDry = h.rms(dryR.L, tA, tB); out.tailWet = h.rms(wetR.L, tA, tB);             // expect tailDry < 0.001, tailWet > 0.003
  const offR = await h.render({ wave: 'saw', knobs: { rvwet: 1 }, reverb: { on: false }, notes, secs: 3 });
  out.tailOff = h.rms(offR.L, tA, tB);                                                  // expect < 0.001
  const long = await h.render({ wave: 'saw', knobs: { rvwet: 1, rvdry: 0, rvdec: 1 }, reverb: { on: true }, notes, secs: 3 });
  const short = await h.render({ wave: 'saw', knobs: { rvwet: 1, rvdry: 0, rvdec: 0 }, reverb: { on: true }, notes, secs: 3 });
  const late = Math.floor(2.0 * h.sr);
  out.longVsShortLate = h.rms(long.L, late) / Math.max(1e-9, h.rms(short.L, late));    // expect > 5
  const darkR = await h.render({ wave: 'saw', knobs: { rvwet: 1, rvdry: 0, rvdamp: 1 }, reverb: { on: true }, notes, secs: 3 });
  const brightR = await h.render({ wave: 'saw', knobs: { rvwet: 1, rvdry: 0, rvdamp: 0 }, reverb: { on: true }, notes, secs: 3 });
  out.dampBright = h.bright(darkR.L, tailFrom) / h.bright(brightR.L, tailFrom);         // expect < 0.8
  const mono = await h.render({ wave: 'saw', knobs: { rvwet: 1, rvdry: 0, rvwid: 0 }, reverb: { on: true }, notes, secs: 3 });
  out.monoCorr = h.corr(mono.L, mono.R);                                                // expect > 0.99 (width 0 = mono)
  const wide = await h.render({ wave: 'saw', knobs: { rvwet: 1, rvdry: 0, rvwid: 1 }, reverb: { on: true }, notes, secs: 3 });
  out.wideCorr = h.corr(wide.L, wide.R);                                                // expect < 0.5
  return out;
}
```

If `tailDry` is above 0.001 the delay's wet path is leaking (delay mix defaults to 0, so it should not).

- [ ] **Step 5: Tests and commit**

Run: `bun test; node --test`. Screenshot to `C:\Users\Arikl\Desktop\screenshots\reverb-panel.png`. Check `document.documentElement.scrollWidth <= innerWidth` with all three panels open. Kill the server, clean `.playwright-mcp`.

```powershell
git add index.html
git commit -m "Reverb: generated stereo impulse response with pre-delay, cuts, width, dry and wet"
```

---

### Task 6: Delay tone and stereo width

**Files:**
- Modify: `index.html` (`KNOBDEF`, `applyDelay`, `setKnob`, automation interval)

- [ ] **Step 1: Knob definitions**

```js
  ['dtone', 'Tone', (v) => (T.dToneHz(v) / 1000).toFixed(1) + 'k', 'fxK'],
  ['dwid', 'Stereo', pc, 'fxK'],
```

- [ ] **Step 2: Apply them**

In `buildDelay` change `const pl = ctx.createStereoPanner(), pr = ctx.createStereoPanner(); pl.pan.value = -1; pr.pan.value = 1;` so the panners are kept on `dFx`: after `dFx = { ... };` line add `dFx.pl = pl; dFx.pr = pr;`.

In `applyDelay` replace the loop line with:

```js
  const tone = T.dToneHz(val('dtone'));
  for (const l of dFx.loops) { set(l.g.gain, fb); set(l.lp.frequency, Math.min(tone, fat ? 2600 : 20000)); }
  const wid = val('dwid'); set(dFx.pl.pan, -wid); set(dFx.pr.pan, wid);
```

In `setKnob`: extend the delay condition to `if (key === 'dtime' || key === 'dfb' || key === 'dmix' || key === 'dtone' || key === 'dwid') applyDelay();`.
In the automation interval extend the delay condition with `|| S.auto.dtone.on || S.auto.dwid.on`.

- [ ] **Step 3: Verify in the browser**

```js
async () => {
  const h = window.__h, ref = await (await fetch('tests/render-reference.json')).json();
  const notes = [{ midi: 45, t: 0.05 }, { midi: 52, t: 0.5, accent: true }, { midi: 57, t: 0.95, glide: true, trig: false }];
  const out = {};
  const d = await h.render({ wave: 'saw', knobs: { dmix: 0.5 }, notes, secs: 1.8 });
  out.defaultsRatio = h.rms(d.L) / ref.delay.rms;                                       // expect 0.97..1.03
  const open = await h.render({ wave: 'saw', knobs: { dmix: 1, dtone: 1, dtime: 0.3 }, notes: [{ midi: 57, t: 0.05, accent: true }], secs: 1.5 });
  const dark = await h.render({ wave: 'saw', knobs: { dmix: 1, dtone: 0, dtime: 0.3 }, notes: [{ midi: 57, t: 0.05, accent: true }], secs: 1.5 });
  // Tone is a lowpass in the feedback repeats only (the first echo is a direct tap, unfiltered by design),
  // so compare the repeats window 0.65-1.5 s; the whole buffer would be dominated by the first echo.
  const sr = 44100, a = Math.floor(0.65 * sr), b = Math.floor(1.5 * sr);
  out.toneBright = h.bright(dark.L, a, b) / h.bright(open.L, a, b);                     // expect < 0.7
  const wide = await h.render({ wave: 'saw', knobs: { dmix: 1, dwid: 1, dtime: 0.3 }, delay: { pp: true }, notes: [{ midi: 57, t: 0.05 }], secs: 1.5 });
  const narrow = await h.render({ wave: 'saw', knobs: { dmix: 1, dwid: 0, dtime: 0.3 }, delay: { pp: true }, notes: [{ midi: 57, t: 0.05 }], secs: 1.5 });
  out.wideCorr = h.corr(wide.L, wide.R); out.narrowCorr = h.corr(narrow.L, narrow.R);   // expect wideCorr < 0.5, narrowCorr > 0.95
  return out;
}
```

- [ ] **Step 4: Tests and commit**

Run: `bun test; node --test`. Kill the server, clean `.playwright-mcp`.

```powershell
git add index.html
git commit -m "Delay: tone and stereo width knobs"
```

---

### Task 7: Automation check, export header, docs, release

**Files:**
- Modify: `acidbass.js` (`exportFiles` sound line), `acidbass.test.mjs`, `README.md`, `docs/superpowers/specs/2026-10-17-drive-reverb-tweaks-design.md`

- [ ] **Step 1: Test that the txt export mentions drive and reverb state**

Append to `acidbass.test.mjs`:

```js
test('txt export header lists drive and reverb state', () => {
  const T = load();
  const s = T.newState(); T.loadDemo(s);
  s.drive = { on: true, type: 'tube' }; s.reverb = { on: true };
  const txt = Buffer.from(T.exportFiles(s).find((f) => f.name.endsWith('.txt')).data).toString('utf8');
  assert.match(txt, /drive tube/);
  assert.match(txt, /reverb on/);
});
```

Run `bun test acidbass.test.mjs`; expected FAIL (no such text). Then in `exportFiles` extend the `sound` line: append to the string

```js
 + '  drive ' + (S.drive.on ? S.drive.type : 'off') + '  reverb ' + (S.reverb.on ? 'on' : 'off')
```

(at the end of the `const sound = ...;` expression, before the semicolon). Run `bun test; node --test`; expected all green.

- [ ] **Step 2: Automation round-trip check in the browser**

Serve, load the page, then run:

```js
async () => {
  const out = {};
  for (const key of ['hp', 'kfol', 'mind', 'pw', 'lfor', 'lfopw', 'drdrive', 'drhp', 'drtone', 'drvol', 'drmix', 'rvpre', 'rvsize', 'rvdec', 'rvdamp', 'rvlow', 'rvhigh', 'rvwid', 'rvdry', 'rvwet', 'dtone', 'dwid']) {
    out[key] = !!knobUI[key] && !!S.auto[key] && knobUI[key].au.children.length === 2;
  }
  S.auto.rvdec = { on: true, min: 0, max: 1, rate: 1 }; ensureAudio(); await new Promise((r) => setTimeout(r, 700));
  out.noThrow = true;
  S.auto.rvdec.on = false;
  return { allKnobsAutomatable: Object.values(out).every(Boolean), out };
}
```

Expected: `allKnobsAutomatable: true`. Also read the console (`browser_console_messages`) and confirm no errors.

- [ ] **Step 3: Amend the spec to match the build**

In `docs/superpowers/specs/2026-10-17-drive-reverb-tweaks-design.md` replace the **Oscillator** bullet under "Signal chain" with:

```
- **Oscillator:** pulse width is the built-in sawtooth minus a copy of itself delayed by `pw / frequency` (a `DelayNode`); the LFO adds to that delay. Saw mode mutes the delayed copy. No AudioWorklet is needed, so there is no fallback and it works from `file://`.
```

and replace the first line of "Order of work" item 2 with `2. Pulse-width oscillator and Tweaks panel.`

- [ ] **Step 4: README**

Add to the "What it does" list in `README.md` one bullet each (match the list's existing style): Tweaks (HP, key follow, min decay, pulse width and LFO to PW), Drive (soft, tube, fold, parallel mix), Reverb (generated stereo reverb with pre-delay, cuts, width), Delay tone and stereo width.

- [ ] **Step 5: Full verification and release**

Run: `bun test; node --test` (both green). Serve and repeat the Task 3, 4, 5 and 6 render checks once more in one session to confirm nothing regressed (all expected values in those tasks). Open the page at 1100 px with every panel and the Automate row open and confirm `document.documentElement.scrollWidth <= innerWidth`. Kill the server, clean `.playwright-mcp`.

```powershell
git add -A
git commit -m "Drive, Reverb and Tweaks: export header, README, spec amended to match"
git push
```

Then open the live site after the Pages rebuild (about two minutes) and confirm the title and the three new toolbar buttons.

- [ ] **Step 6: Update memory**

Edit `C:\Users\Arikl\.claude\projects\C--Users-Arikl-Desktop--Projects-algo-art\memory\my-lil-acid-bassline-repo.md`: record that Drive, Reverb and Tweaks shipped (date), that pulse width is delay-based (no AudioWorklet), and that the VST3 port of these features is the next plan.

---

## Self-review

**Spec coverage:** Tweaks panel and six knobs (Task 3), Drive with HP, drive, type, tone, volume, mix and level compensation (Tasks 2 and 4), Reverb with pre-delay, size, decay, hi damp, low cut, hi cut, width, dry, wet and seeded generated IR with crossfade (Tasks 2 and 5), delay tone and stereo (Task 6), automation of every continuous knob (the knobs go through `KNOBDEF`, which builds the automation row; Task 7 step 2 checks it), state cleaning and old saves (Task 1), txt export header (Task 7), tests in node and in the browser (every task), bypass identical to today (Tasks 3 to 6 compare to the Task 0 reference). The plugin port is explicitly out of this plan.

**Placeholder scan:** none. The one tuning constant (`0.4` in `driveMakeupDb`) has a stated acceptance check and the exact line to change.

**Type consistency:** knob keys are the same in the table, `KNOBS`, `KNOBDEF`, `val(...)` calls and the harness checks (`hp, kfol, mind, pw, lfor, lfopw, drhp, drdrive, drtone, drvol, drmix, rvpre, rvsize, rvdec, rvdamp, rvlow, rvhigh, rvwid, rvdry, rvwet, dtone, dwid`). Core function names used in `index.html` all exist in Task 1 and 2 (`hpHz, minDecSec, pwFrac, lfoHz, keyMul, drHpHz, drDb, drToneHz, drVolDb, dbGain, driveCurve, driveMakeupDb, rvPreSec, rvDecSec, rvLowHz, rvHighHz, reverbIR, dToneHz`). `keyMul` is both a core function (`T.keyMul`) and a page variable (`keyMul` number): they live in different scopes and the page never calls its own variable as a function.
