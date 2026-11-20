// tools/smf.mjs — a Standard MIDI File in, a step pattern out: the inverse of TB303.patternsToMidi, for any file.
// readSmf() turns the bytes into notes; notesToPattern() snaps them to the 16th grid and reads accent, slide and tie off them.
// The grid is the file's own ticks, which is right for anything a DAW or the web app wrote. A stem transcribed from audio
// (notegrab, basic-pitch) is written at a placeholder 120 bpm, so its ticks do not follow the song: give notesToPattern the
// song's real tempo (gridBpm) and it snaps on seconds instead.
// Author: Ari Klopfer / A_Development · MIT

export const LO = 24, HI = 60;   // the machine's range: 13 keys, octave -1..+1
const ACCENT_VEL = 110;          // the plugin's threshold: velocity 110/127 and up is an accent
const OFF_GRID = 0.15;           // notes this far from the grid on average (in steps) mean the grid is wrong, not the playing

// d: Uint8Array / Buffer. opts.track: read only this track's notes (0-based); tempo events are read from every track.
// Returns { ppq, bpm (first tempo, or null), notes: [{ start, end, note, vel, channel, track (0-based), startSec, endSec }] } sorted by start.
// Ticks are the file's own; seconds follow its whole tempo map.
export function readSmf(d, opts = {}) {
  const b = Buffer.from(d);
  if (b.length < 14 || b.toString('latin1', 0, 4) !== 'MThd') throw new Error('not a MIDI file');
  const ntrks = b.readUInt16BE(10), division = b.readUInt16BE(12);
  if (division & 0x8000) throw new Error('SMPTE time division is not supported');
  if (division === 0) throw new Error('bad time division 0');
  let pos = 8 + b.readUInt32BE(4);
  const notes = [], tempos = [];
  for (let t = 0; t < ntrks && pos + 8 <= b.length; t++) {
    const end = Math.min(b.length, pos + 8 + b.readUInt32BE(pos + 4));
    // a chunk of any other type is for some other program to read: step over it (t counts track chunks only)
    if (b.toString('latin1', pos, pos + 4) !== 'MTrk') { pos = end; t--; continue; }
    const wanted = opts.track === undefined || opts.track === t;
    let i = pos + 8, tick = 0, status = 0;
    const open = new Map();
    const vlq = () => { let v = 0, c; do { c = b[i++]; v = (v << 7) | (c & 127); } while (c & 128 && i < end); return v; };
    const retrig = new Map();   // key -> the tick its open note was opened on by a note-on that closed the one before it
    const close = (key, at) => { const n = open.get(key); if (n) { notes.push({ ...n, end: at }); open.delete(key); } return !!n; };
    while (i < end) {
      tick += vlq();
      let st = b[i];
      if (st & 0x80) i++; else { st = status; if (!st) throw new Error('bad running status'); }
      if (st === 0xff) {
        const type = b[i++], len = vlq();
        if (type === 0x51 && len === 3) tempos.push({ tick, us: b.readUIntBE(i, 3) });
        i += len; continue;   // a meta event leaves running status as it was; sysex (below) cancels it
      }
      if (st === 0xf0 || st === 0xf7) { i += vlq(); status = 0; continue; }
      status = st;
      const kind = st & 0xf0, a = b[i++], v = kind === 0xc0 || kind === 0xd0 ? 0 : b[i++];
      if (!wanted) continue;
      const key = ((st & 15) << 7) | a;
      if (kind === 0x90 && v > 0) {
        if (close(key, tick)) retrig.set(key, tick); else retrig.delete(key);
        open.set(key, { start: tick, note: a, vel: v, channel: st & 15, track: t });
      }
      // an off on the tick a retrigger opened its note belongs to the note before it (already closed by that note-on): ignore
      // it, once. Any other off closes its note, even on the tick it opened: a note of zero length.
      else if (kind === 0x80 || kind === 0x90) { if (retrig.get(key) === tick) retrig.delete(key); else close(key, tick); }
    }
    for (const key of [...open.keys()]) close(key, tick);   // a note never switched off ends with its track
    pos = end;
  }
  // the tempo map: 120 bpm until the first tempo event (the SMF default), then each change from its tick on
  tempos.sort((x, y) => x.tick - y.tick);
  const map = [{ tick: 0, us: 500000, sec: 0 }];
  for (const t of tempos) {
    const last = map[map.length - 1];
    if (t.tick === last.tick) last.us = t.us;
    else map.push({ tick: t.tick, us: t.us, sec: last.sec + (t.tick - last.tick) * last.us / 1e6 / division });
  }
  const secOf = (tick) => { let m = map[0]; for (const x of map) { if (x.tick > tick) break; m = x; } return m.sec + (tick - m.tick) * m.us / 1e6 / division; };
  for (const n of notes) { n.startSec = secOf(n.start); n.endSec = secOf(n.end); }
  notes.sort((x, y) => x.start - y.start || x.note - y.note);
  const bpm = tempos.length ? Math.round(6e7 / tempos[0].us * 100) / 100 : null;
  return { ppq: division, bpm, notes };
}

const fold = (m) => { let r = m; while (r < LO) r += 12; while (r > HI) r -= 12; return r; };
// 24..60 as { note 0-12, oct -1..1 }: twelve notes per octave, the top C only at 60 (so C^ and C' never both appear).
const stepOf = (m) => { const oct = m === HI ? 1 : Math.floor((m - LO) / 12) - 1; return { note: m - 36 - 12 * oct, oct }; };

// notes: readSmf's notes (or [{ start, end, note, vel }] in ticks). T: TB303 (emptyPattern). opts:
//   steps     pattern length, 1-32 (default: the notes' span rounded up to a multiple of 4)
//   offset    16th steps to skip from the start of the grid
//   gridBpm   the music's real tempo: snap the notes' seconds to its 16ths instead of the file's ticks (needs startSec/endSec)
//   startSec  with gridBpm, where step 1 falls in seconds (default 0)
// Returns { pattern, report }; throws when there is nothing to read or the notes run past 32 steps without a window.
export function notesToPattern(notes, ppq, T, opts = {}) {
  const offset = opts.offset || 0, origin = opts.startSec || 0;
  if (!Number.isInteger(offset) || offset < 0) throw new Error('--offset must be a whole number from 0 up');
  if (!notes.length) throw new Error('no notes in the file');
  if (opts.gridBpm !== undefined && !(opts.gridBpm > 0)) throw new Error('--grid-bpm must be a positive number');
  // where a moment sits on the 16th grid, in steps: from ticks, or from seconds at the music's real tempo (bpm / 15 steps a second)
  const at = opts.gridBpm ? (sec) => (sec - origin) * opts.gridBpm / 15 : (tick) => tick / (ppq / 4);
  const rows = notes.map((n) => {
    const p0 = opts.gridBpm ? at(n.startSec) : at(n.start), p1 = opts.gridBpm ? at(n.endSec) : at(n.end);
    return { ...n, p0, p1, s: Math.round(p0) - offset };
  });
  const ahead = rows.filter((r) => r.s >= 0);
  if (!ahead.length) throw new Error('no notes after --offset ' + offset);
  let len = opts.steps;
  if (len === undefined) {
    const span = Math.max(...ahead.map((r) => r.s)) + 1;
    if (span > 32) throw new Error('more than 32 steps (' + span + '): pick a window with --offset N and --steps N');
    len = Math.ceil(span / 4) * 4;
  }
  if (!Number.isInteger(len) || len < 1 || len > 32) throw new Error('--steps must be a whole number from 1 to 32');
  const inWindow = ahead.filter((r) => r.s < len);
  if (!inWindow.length) throw new Error('no notes inside the window (offset ' + offset + ', ' + len + ' steps)');

  // a bass: the lowest note on a step stays, the rest are counted and dropped
  const byStep = new Map();
  for (const r of inWindow) { const k = byStep.get(r.s); if (!k || r.note < k.note) byStep.set(r.s, r); }
  const kept = [...byStep.values()].sort((x, y) => x.s - y.s);
  const snaps = kept.map((k) => Math.abs(k.p0 - (k.s + offset)));
  const meanSnap = snaps.reduce((a, x) => a + x, 0) / snaps.length;
  const report = {
    read: notes.length, kept: kept.length, dropped: inWindow.length - kept.length, folded: 0,
    outside: rows.length - inWindow.length, steps: len,
    maxSnap: Math.max(...snaps), meanSnap, offGrid: meanSnap > OFF_GRID,   // in steps: 0.5 is as far off as a note can be
    wrapSlide: false,
  };

  const p = T.emptyPattern();
  p.len = len;
  // how long this file holds a plain note, in steps: a held note whose overhang matches it is a slide into the same pitch, which
  // writes no new note-on. Only a file with gated notes shows one (tick mode); a transcription's lengths say nothing about it.
  const short = kept.map((k) => k.p1 - k.p0).filter((d) => d < 0.98).sort((a, b) => a - b);
  const gate = opts.gridBpm || !short.length ? null : (short[(short.length - 1) >> 1] + short[short.length >> 1]) / 2;
  // k's pitch on every step from k.s to `to`, each sliding into the next; the last slides on only when lastSlides
  const chain = (k, midi, to, lastSlides) => {
    for (let s = k.s; s <= to; s++) {
      if (s > k.s) p.steps[s] = { gate: 'note', ...stepOf(midi), accent: false, slide: false };
      p.steps[s].slide = s < to || lastSlides;
    }
  };
  kept.forEach((k, j) => {
    const next = kept[j + 1];
    const midi = fold(k.note);
    if (midi !== k.note) report.folded++;
    p.steps[k.s] = { gate: 'note', ...stepOf(midi), accent: k.vel >= ACCENT_VEL, slide: false };
    // still sounding when the next note starts, and held up to its step: a slide into it, at any distance
    if (next && k.p1 > next.p0 && k.p1 >= next.s + offset - 0.5) { chain(k, midi, next.s - 1, true); return; }
    // the steps after its own the note reaches into by more than a hair; a tie holds 0.95 of its step, a note its gate
    const dur = k.p1 - k.p0, want = Math.ceil(dur - 1 - 0.02);
    let ext = Math.max(0, Math.min(want, (next ? next.s : len) - k.s - 1, len - 1 - k.s));
    if (ext === want && ext > 0) {
      const tail = dur - ext;
      if (gate !== null && Math.abs(tail - gate) <= 0.15 && tail < 0.9) { chain(k, midi, k.s + ext, false); return; }
      if (tail < 0.3) ext--;   // a note that runs a little long (a transcriber's minimum length, a loose DAW note) holds no step
    }
    for (let t = 1; t <= ext; t++) p.steps[k.s + t].gate = 'tie';
  });
  // a note held to the end of the pattern runs into step 1 of the loop: that is how a slide off the last step is written.
  // Unless the file's notes are full length (another note ends on a step boundary without running into the next one): then held.
  const last = kept[kept.length - 1];
  const fullGate = kept.some((k, j) => k !== last && Math.abs(k.p1 - Math.round(k.p1)) < 0.01 && k.p1 <= kept[j + 1].p0);
  if (!fullGate && last.p1 >= offset + len - 1e-6 && p.steps[0].gate === 'note') {
    chain(last, fold(last.note), len - 1, true);
    report.wrapSlide = true;
  }
  return { pattern: p, report };
}

const pct = (x) => Math.round(x * 100) + '%';
export const describe = (r) =>
  'read ' + r.read + ' notes: ' + r.kept + ' kept, ' + r.dropped + ' dropped (one note per step, the lowest stays), ' + r.folded +
  ' folded into MIDI ' + LO + '-' + HI + ', ' + r.outside + ' outside the window; ' + r.steps + ' steps, largest snap to the grid ' +
  pct(r.maxSnap) + ' of a step' +
  (r.wrapSlide ? '; read the last note as a slide into step 1 (it is held to the end of the pattern)' : '') +
  (r.offGrid ? '\nwarning: the notes sit ' + pct(r.meanSnap) + ' of a step off this grid on average, so the grid is probably wrong: ' +
    'is the tempo right? A stem from notegrab / basic-pitch needs --grid-bpm <song bpm> (and --start <seconds> if step 1 is not at 0)' : '');