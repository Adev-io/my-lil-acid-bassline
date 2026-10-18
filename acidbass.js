// acidbass.js — My lil acid bassline's pure half (the classic's rules plus filter/amp ADSR, gate length, delay and MIDI): patterns in, per-step note events out, a cleaner for every untrusted
// blob (saved state, imported JSON), and the file export (.txt notation, .mid, .zip). No Web Audio and no DOM here,
// so node can test it.
// Author: Ari Klopfer / A_Development · MIT
(function () {
  'use strict';
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C'];   // the 13 keys
  const GATES = ['note', 'rest', 'tie'];
  const BASE = 36;                  // C2: the bottom key at octave Normal
  const SLOTS = 32;                 // 2 banks x 2 groups x 8 patterns
  const STEPS = 32;                 // a pattern holds up to 32; len says how many play, new ones start at 16
  const SONG_MAX = 16;
  const DRIVE_TYPES = ['soft', 'tube', 'wavefold'];
  // Defaults for the envelope knobs reproduce v1's sound: instant attack, a ~0.5 s filter decay to the cutoff, the amp held
  // flat while the gate is up and cut in ~6 ms, gate 55% of a step.
  const KNOBS = {
    tuning: 0.5, cutoff: 0.45, res: 0.5, envmod: 0.6, accent: 0.6, volume: 0.7, tempo: 0.45, gate: 0.5,
    fatk: 0, fdec: 0.64, fsus: 0, frel: 0.68,
    aatk: 0, adec: 0.5, asus: 1, arel: 0.03,
    dtime: 0.5, dfb: 0.45, dmix: 0,   // delay: mix 0 is bypassed, so a fresh machine sounds as before
    dtone: 1, dwid: 1,                // delay tone (1 = open) and stereo width (1 = full ping-pong)
    hp: 0, kfol: 0, mind: 0, pw: 0.5, lfor: 0.6157, lfopw: 0,   // tweaks: every default is neutral
    drhp: 0, drdrive: 0, drtone: 1, drvol: 0.5, drmix: 1,        // drive (off until switched on)
    rvpre: 0, rvsize: 0.5, rvdec: 0.5, rvdamp: 0.5, rvlow: 0, rvhigh: 1, rvwid: 1, rvdry: 1, rvwet: 0,   // reverb (off, wet 0)
  };

  const num = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const int = (v, lo, hi, d) => Math.round(num(v, lo, hi, d));

  const emptyStep = () => ({ gate: 'rest', note: 0, oct: 0, accent: false, slide: false });
  const emptyPattern = () => ({ len: 16, steps: Array.from({ length: STEPS }, emptyStep) });

  function cleanStep(s) {
    const r = s && typeof s === 'object' ? s : {};
    return {
      gate: GATES.includes(r.gate) ? r.gate : 'rest',
      note: int(r.note, 0, 12, 0),
      oct: int(r.oct, -1, 1, 0),
      accent: r.accent === true,
      slide: r.slide === true,
    };
  }
  function cleanPattern(p) {
    const r = p && typeof p === 'object' ? p : {};
    const src = Array.isArray(r.steps) ? r.steps : [];
    return { len: int(r.len, 1, STEPS, 16), steps: Array.from({ length: STEPS }, (_, i) => cleanStep(src[i])) };
  }
  // The whole saved/imported state. A hostile or stale blob comes out as a playable machine, never a throw.
  function cleanState(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const src = Array.isArray(r.patterns) ? r.patterns : [];
    const knobs = {};
    const k = r.knobs && typeof r.knobs === 'object' ? r.knobs : {};
    for (const n of Object.keys(KNOBS)) knobs[n] = num(k[n], 0, 1, KNOBS[n]);
    const au = r.auto && typeof r.auto === 'object' ? r.auto : {};
    const auto = {};
    for (const n of Object.keys(KNOBS)) {
      const a = au[n] && typeof au[n] === 'object' ? au[n] : {};
      auto[n] = { on: a.on === true, min: num(a.min, 0, 1, 0), max: num(a.max, 0, 1, 1), rate: num(a.rate, 0.25, 64, 4) };
    }
    const song = (Array.isArray(r.song) ? r.song : []).slice(0, SONG_MAX).map((i) => int(i, 0, SLOTS - 1, 0));
    const dr = r.drive && typeof r.drive === 'object' ? r.drive : {};
    const rv = r.reverb && typeof r.reverb === 'object' ? r.reverb : {};
    return {
      patterns: Array.from({ length: SLOTS }, (_, i) => cleanPattern(src[i])),
      knobs,
      auto,
      wave: r.wave === 'square' ? 'square' : 'saw',
      delay: { pp: (r.delay || {}).pp !== false, fat: (r.delay || {}).fat === true, sync: (r.delay || {}).sync === true },
      drive: { on: dr.on === true, type: DRIVE_TYPES.includes(dr.type) ? dr.type : 'soft' },
      reverb: { on: rv.on === true },
      cur: int(r.cur, 0, SLOTS - 1, 0),
      song,
      swing: num(r.swing, 0, 1, 0),
    };
  }
  // Automated knob: a sine between min and max (fractions of the knob's travel), starting at min, one cycle per
  // `rate` beats. Time is in beats, so it follows the tempo knob rather than a wall clock.
  const autoValue = (a, beats) => a.min + (a.max - a.min) * (0.5 - 0.5 * Math.cos(2 * Math.PI * beats / a.rate));
  const newState = () => cleanState(null);

  const midiOf = (s) => BASE + s.note + 12 * s.oct;
  const freqOf = (midi, cents) => 440 * Math.pow(2, (midi - 69 + (cents || 0) / 100) / 12);
  // The tuning knob is +-100 cents around centre.
  const tuneCents = (k) => (num(k, 0, 1, 0.5) - 0.5) * 200;
  const bpmOf = (k) => Math.round(40 + num(k, 0, 1, 0.45) * 260);
  // Exponential sweeps: the ear hears octaves, so a linear knob across 2 decades feels dead at one end.
  const cutoffHz = (k) => 60 * Math.pow(2, num(k, 0, 1, 0.45) * 6.5);          // 60 Hz .. ~5.4 kHz
  const resQ = (k) => 0.7 + Math.pow(num(k, 0, 1, 0.5), 1.6) * 24;
  // Envelope times are exponential in the knob: 2 ms..1.5 s attack, 30 ms..2.5 s decay, 5 ms..2 s release.
  const atkSec = (k) => 0.002 * Math.pow(750, num(k, 0, 1, 0));
  const decSec = (k) => 0.03 * Math.pow(83, num(k, 0, 1, 0.5));
  const relSec = (k) => 0.005 * Math.pow(400, num(k, 0, 1, 0.03));
  // How much of a step the gate is held: 10%..100%. The knob's centre (0.5) is the 303's 55%.
  // Delay time is exponential, 20 ms..1000 ms, so the short slap-back range gets as much knob as the long echoes; the
  // feedback knob tops out at 0.9, which stays under unity even before the lowpass in each repeat takes its share.
  const delayMs = (k) => 20 * Math.pow(50, num(k, 0, 1, 0.5));
  const msToKnob = (ms) => Math.min(1, Math.max(0, Math.log(num(ms, 20, 1000, 141) / 20) / Math.log(50)));
  // Tempo sync: the Time knob steps through note divisions instead of milliseconds. Beats are quarter notes; T = triplet, . = dotted.
  const DIVS = [
    { name: '1/32', beats: 0.125 }, { name: '1/16T', beats: 1 / 6 }, { name: '1/16', beats: 0.25 }, { name: '1/8T', beats: 1 / 3 },
    { name: '1/16.', beats: 0.375 }, { name: '1/8', beats: 0.5 }, { name: '1/4T', beats: 2 / 3 }, { name: '1/8.', beats: 0.75 },
    { name: '1/4', beats: 1 }, { name: '1/2T', beats: 4 / 3 }, { name: '1/4.', beats: 1.5 }, { name: '1/2', beats: 2 },
  ];
  const divIndex = (k) => Math.round(num(k, 0, 1, 0.5) * (DIVS.length - 1));
  const syncDiv = (k) => DIVS[divIndex(k)];
  const syncSec = (k, bpm) => syncDiv(k).beats * 60 / bpm;
  // The knob position whose division is closest to `sec` at this tempo, so flipping Sync keeps the echo where it was.
  const knobOfSec = (sec, bpm) => {
    let best = 0;
    DIVS.forEach((d, i) => { if (Math.abs(d.beats * 60 / bpm - sec) < Math.abs(DIVS[best].beats * 60 / bpm - sec)) best = i; });
    return best / (DIVS.length - 1);
  };
  const delayFb = (k) => 0.9 * num(k, 0, 1, 0.45);
  const gateFrac = (k) => 0.1 + 0.9 * num(k, 0, 1, 0.5);
  const stepSeconds = (bpm) => 60 / bpm / 4;
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

  // What one step does, given the step before and after it (patterns wrap, as the machine's does).
  //   trig    start a fresh envelope; false = legato (slid into, or tied)
  //   glide   a note that was slid into: pitch moves, the envelope does not restart
  //   hold    the gate stays up past this step (slide into a note, or a tie follows)
  //   len     gate length as a fraction of the step when not held
  // A tie repeats the previous sounding pitch and never retriggers. A slide on a step glides into the NEXT
  // step's pitch only when that step is a note; slid-into-a-rest ends the gate as a plain note would.
  function stepEvent(pat, i) {
    const L = pat.len;
    const at = (j) => pat.steps[((j % L) + L) % L];
    const s = at(i), prev = at(i - 1), next = at(i + 1);
    if (s.gate === 'rest') return { off: true };
    const hold = (s.slide && next.gate === 'note') || next.gate === 'tie';
    if (s.gate === 'tie') {
      // Pitch comes from the nearest note behind it. A pattern of nothing but ties has no pitch: treat as rest.
      for (let b = 1; b <= L; b++) {
        const p = at(i - b);
        if (p.gate === 'note') return { off: false, trig: false, glide: false, midi: midiOf(p), accent: false, hold, len: 0.95 };
        if (p.gate === 'rest') break;
      }
      return { off: true };
    }
    const legato = prev.slide && (prev.gate === 'note') && L > 0;
    return { off: false, trig: !legato, glide: legato, midi: midiOf(s), accent: s.accent, hold, len: 0.55 };
  }

  // Pitch-mode write: the key goes at the cursor, the cursor advances. Returns the next cursor.
  function writeNote(pat, cursor, note, mods) {
    const m = mods || {};
    pat.steps[cursor] = { gate: 'note', note: int(note, 0, 12, 0), oct: int(m.oct, -1, 1, 0), accent: m.accent === true, slide: m.slide === true };
    return (cursor + 1) % pat.len;
  }
  const cycleGate = (s) => { s.gate = GATES[(GATES.indexOf(s.gate) + 1) % GATES.length]; };
  const cycleOct = (s) => { s.oct = s.oct === 0 ? 1 : s.oct === 1 ? -1 : 0; };

  // Which pattern plays after this one. Pattern play loops itself; track play walks the song.
  function nextSlot(state, mode, songPos) {
    if (mode !== 'track' || !state.song.length) return { slot: state.cur, songPos: 0 };
    const p = (songPos + 1) % state.song.length;
    return { slot: state.song[p], songPos: p };
  }
  const slotName = (i) => `${i < 16 ? 'I' : 'II'}-${(i % 16) < 8 ? 'A' : 'B'}${(i % 8) + 1}`;

  // Compact step notation for presets and tests: one token per step, space separated.
  //   -  rest    =  tie    C C# D .. B  note    C'  the high C (13th key)    ^ _  octave up / down    *  accent    ~  slide
  function parsePattern(str) {
    const toks = String(str).trim().split(/\s+/).slice(0, STEPS);
    const p = emptyPattern();
    p.len = toks.length;
    toks.forEach((tok, i) => {
      if (tok === '-') return;
      if (tok === '=') { p.steps[i].gate = 'tie'; return; }
      const m = /^([A-G]#?)('?)([\^_]?)([*~]*)$/.exec(tok);
      if (!m) throw new Error('bad step "' + tok + '"');
      const note = m[2] ? 12 : NAMES.indexOf(m[1]);
      if (note < 0 || (m[2] && m[1] !== 'C')) throw new Error('bad step "' + tok + '"');
      p.steps[i] = { gate: 'note', note, oct: m[3] === '^' ? 1 : m[3] === '_' ? -1 : 0, accent: m[4].includes('*'), slide: m[4].includes('~') };
    });
    return p;
  }
  // A starter set: six lines into I-A1..I-A6, a song chaining them, and a squelchy sound to hear them in.
  const DEMO = [
    'A* - A A^ - A_* A - G~ A - A* - C^ - E~',
    'E E E^ E E E^* E E E E^ E - E G~ E^* D',
    'C* C~ D#~ G - C^* - G~ F - D#* C - G_ - C',
    "F* = = F - F^ = F* - G# = = A#~ C^* - C'",
    'D* - - - - - D_ - - - A* - - - - -',
    'C - C - C* - C^ - C - C - C* - C~ D#',
  ];
  const DEMO_SOUND = { cutoff: 0.33, res: 0.72, envmod: 0.75, fdec: 0.59, accent: 0.8, tempo: 0.36, volume: 0.7 };
  function loadDemo(state) {
    DEMO.forEach((d, i) => { state.patterns[i] = parsePattern(d); });
    state.song = [0, 1, 0, 2, 3, 0, 1, 4, 5, 2];
    state.cur = 0;
    Object.assign(state.knobs, DEMO_SOUND);
    return state;
  }


  // ---- files: step notation, standard MIDI, and a store-only zip so one click downloads the whole folder ----
  const PPQ = 480, STEP16 = PPQ / 4;
  const enc = new TextEncoder();

  // The inverse of parsePattern.
  function formatPattern(pat) {
    return pat.steps.slice(0, pat.len).map((s) => {
      if (s.gate === 'rest') return '-';
      if (s.gate === 'tie') return '=';
      const name = s.note === 12 ? "C'" : NAMES[s.note];
      return name + (s.oct === 1 ? '^' : s.oct === -1 ? '_' : '') + (s.accent ? '*' : '') + (s.slide ? '~' : '');
    }).join(' ');
  }
  const vlq = (n) => { const b = [n & 0x7f]; while ((n >>= 7) > 0) b.unshift((n & 0x7f) | 0x80); return b; };
  const be = (n, bytes) => Array.from({ length: bytes }, (_, i) => (n >>> (8 * (bytes - 1 - i))) & 255);

  // Format 0, one track, 480 PPQ. Accent = velocity 127 (else 90). A slide overlaps the next note-on by two ticks, which
  // is how a mono synth is told to glide; a tie never re-triggers, it only holds the note through.
  function patternsToMidi(pats, bpm, name, gate) {
    const g = gate === undefined ? 0.55 : gate;
    const ev = [];
    let base = 0;
    for (const pat of pats) {
      let open = null;
      const off = (tick) => { if (open !== null) { ev.push({ tick, order: 0, bytes: [0x80, open, 0] }); open = null; } };
      for (let i = 0; i < pat.len; i++) {
        const e = stepEvent(pat, i), t = base + i * STEP16;
        if (e.off) continue;
        const vel = e.accent ? 127 : 90;
        if (e.trig) { off(t); ev.push({ tick: t, order: 1, bytes: [0x90, e.midi, vel] }); open = e.midi; }
        else if (e.glide && open !== e.midi) {
          ev.push({ tick: t, order: 1, bytes: [0x90, e.midi, vel] });
          if (open !== null) ev.push({ tick: t + 2, order: 0, bytes: [0x80, open, 0] });
          open = e.midi;
        }
        if (!e.hold) off(t + Math.round((e.len < 0.9 ? g : e.len) * STEP16));
      }
      off(base + pat.len * STEP16);
      base += pat.len * STEP16;
    }
    ev.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const us = Math.round(60000000 / bpm);
    const nm = Array.from(enc.encode(String(name).slice(0, 60)));
    const body = [0, 0xff, 0x51, 3, ...be(us, 3), 0, 0xff, 0x03, nm.length, ...nm];
    let last = 0;
    for (const x of ev) { body.push(...vlq(x.tick - last), ...x.bytes); last = x.tick; }
    body.push(0, 0xff, 0x2f, 0);
    return Uint8Array.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, ...be(PPQ, 2), 0x4d, 0x54, 0x72, 0x6b, ...be(body.length, 4), ...body]);
  }

  const filled = (p) => p.steps.slice(0, p.len).some((s) => s.gate !== 'rest');
  const pct = (v) => Math.round(v * 100) + '%';
  // [{name, data: Uint8Array}] for every written pattern, plus song.txt / song.mid when there is a song.
  function exportFiles(raw) {
    const S = cleanState(raw);
    const bpm = bpmOf(S.knobs.tempo);
    const sound = Object.entries(S.knobs).map(([k, v]) => k + ' ' + pct(v)).join('  ') + '  wave ' + S.wave + '  delay ' + (S.delay.pp ? 'ping-pong' : 'mono') + (S.delay.fat ? ' fat' : '') + (S.delay.sync ? ' sync ' + syncDiv(S.knobs.dtime).name : '');
    const legend = "# notation: C..B note, C' high C, ^ _ octave up/down, * accent, ~ slide, - rest, = tie";
    const files = [];
    S.patterns.forEach((p, i) => {
      if (!filled(p)) return;   // an untouched slot is not a pattern
      const n = slotName(i);
      files.push({ name: n + '.txt', data: enc.encode('# ' + n + '  ' + p.len + ' steps  ' + bpm + ' bpm\n# sound: ' + sound + '\n' + legend + '\n' + formatPattern(p) + '\n') });
      files.push({ name: n + '.mid', data: patternsToMidi([p], bpm, n, gateFrac(S.knobs.gate)) });
    });
    const chain = S.song.filter((i) => filled(S.patterns[i]));
    if (chain.length) {
      files.push({ name: 'song.txt', data: enc.encode('# song  ' + bpm + ' bpm\n' + chain.map(slotName).join(' ') + '\n') });
      files.push({ name: 'song.mid', data: patternsToMidi(chain.map((i) => S.patterns[i]), bpm, 'song', gateFrac(S.knobs.gate)) });
    }
    return files;
  }

  const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (d) => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const le = (n, bytes) => be(n, bytes).reverse();
  // Store-only (no compression): the files are a few hundred bytes. Names are UTF-8, DOS date fixed at 1980-01-01.
  function zip(files, folder) {
    const out = [], central = [];
    let off = 0;
    for (const f of files) {
      const name = enc.encode((folder ? folder + '/' : '') + f.name), crc = crc32(f.data);
      const local = [...le(0x04034b50, 4), ...le(20, 2), ...le(0x0800, 2), ...le(0, 2), ...le(0, 2), ...le(0x21, 2), ...le(crc, 4), ...le(f.data.length, 4), ...le(f.data.length, 4), ...le(name.length, 2), ...le(0, 2)];
      central.push(...le(0x02014b50, 4), ...le(20, 2), ...le(20, 2), ...le(0x0800, 2), ...le(0, 2), ...le(0, 2), ...le(0x21, 2), ...le(crc, 4), ...le(f.data.length, 4), ...le(f.data.length, 4), ...le(name.length, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(off, 4), ...name);
      out.push(Uint8Array.from(local), name, f.data);
      off += local.length + name.length + f.data.length;
    }
    const eocd = [...le(0x06054b50, 4), ...le(0, 2), ...le(0, 2), ...le(files.length, 2), ...le(files.length, 2), ...le(central.length, 4), ...le(off, 4), ...le(0, 2)];
    const all = [...out, Uint8Array.from(central), Uint8Array.from(eocd)];
    const buf = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
    let p = 0;
    for (const a of all) { buf.set(a, p); p += a.length; }
    return buf;
  }

  // ---- Web MIDI: raw bytes in, a small event out. Anything that is not a note or a control change is ignored. ----
  const MIDI_CC = { 74: 'cutoff', 71: 'res', 7: 'volume' };   // the usual cutoff, resonance and channel-volume controllers
  function parseMidi(d) {
    if (!d || d.length < 2) return null;
    const st = d[0] & 0xf0, a = d[1] & 0x7f, b = (d[2] || 0) & 0x7f;
    if (st === 0x90) return b > 0 ? { type: 'on', note: a, vel: b } : { type: 'off', note: a };   // note-on with velocity 0 is note-off
    if (st === 0x80) return { type: 'off', note: a };
    if (st === 0xb0 && MIDI_CC[a]) return { type: 'cc', knob: MIDI_CC[a], value: b / 127 };
    return null;
  }
  // A MIDI note as a step: C2 (36) is the bottom key, and the octave is held to the machine's -1..+1.
  function midiToStep(midi) {
    const n = Math.round(num(midi, 0, 127, 36)) - 36, o = Math.floor(n / 12);
    return { note: n - 12 * o, oct: Math.min(1, Math.max(-1, o)) };
  }

  window.TB303 = {
    DRIVE_TYPES, hpHz, minDecSec, pwFrac, lfoHz, keyMul, drHpHz, drDb, drToneHz, drVolDb, dbGain, rvPreSec, rvDecSec, rvSizeScale, rvLowHz, rvHighHz, dToneHz,
    NAMES, GATES, SLOTS, STEPS, KNOBS, emptyPattern, cleanPattern, cleanState, newState, midiOf, freqOf, tuneCents, bpmOf,
    parseMidi, midiToStep, cutoffHz, resQ, delayMs, msToKnob, delayFb, DIVS, syncDiv, syncSec, knobOfSec, atkSec, decSec, relSec, gateFrac, stepSeconds, stepEvent, autoValue, writeNote, cycleGate, cycleOct, nextSlot, slotName, parsePattern, loadDemo, formatPattern, patternsToMidi, exportFiles, zip, crc32,
  };
})();
