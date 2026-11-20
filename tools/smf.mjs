// tools/smf.mjs — a Standard MIDI File in, a step pattern out: the inverse of TB303.patternsToMidi, for any file.
// readSmf() turns the bytes into notes; notesToPattern() snaps them to the 16th grid and reads accent, slide and tie off them.
// The grid is the file's own ticks, which is right for anything a DAW or the web app wrote. A stem transcribed from audio
// (notegrab, basic-pitch) is written at a placeholder 120 bpm, so its ticks do not follow the song: give notesToPattern the
// song's real tempo (gridBpm) and it snaps on seconds instead.
// Author: Ari Klopfer / A_Development · MIT

export const LO = 24, HI = 60;   // the machine's range: 13 keys, octave -1..+1
const ACCENT_VEL = 110;          // the plugin's threshold: velocity 110/127 and up is an accent
const TIE_SLACK = 0.25;          // a note within this much of a whole number of steps counts as that many
const OFF_GRID = 0.15;           // notes this far from the grid on average (in steps) mean the grid is wrong, not the playing

// d: Uint8Array / Buffer. opts.track: read only this track's notes (0-based); tempo events are read from every track.
// Returns { ppq, bpm (first tempo, or null), notes: [{ start, end, note, vel, channel, startSec, endSec }] } sorted by start.
// Ticks are the file's own; seconds follow its whole tempo map.
export function readSmf(d, opts = {}) {
  const b = Buffer.from(d);
  if (b.length < 14 || b.toString('latin1', 0, 4) !== 'MThd') throw new Error('not a MIDI file');
  const ntrks = b.readUInt16BE(10), division = b.readUInt16BE(12);
  if (division & 0x8000) throw new Error('SMPTE time division is not supported');
  let pos = 8 + b.readUInt32BE(4);
  const notes = [], tempos = [];
  for (let t = 0; t < ntrks && pos + 8 <= b.length; t++) {
    if (b.toString('latin1', pos, pos + 4) !== 'MTrk') throw new Error('missing track chunk');
    const end = Math.min(b.length, pos + 8 + b.readUInt32BE(pos + 4));
    const wanted = opts.track === undefined || opts.track === t;
    let i = pos + 8, tick = 0, status = 0;
    const open = new Map();
    const vlq = () => { let v = 0, c; do { c = b[i++]; v = (v << 7) | (c & 127); } while (c & 128 && i < end); return v; };
    const close = (key, at) => { const n = open.get(key); if (n) { notes.push({ ...n, end: at }); open.delete(key); } };
    while (i < end) {
      tick += vlq();
      let st = b[i];
      if (st & 0x80) i++; else { st = status; if (!st) throw new Error('bad running status'); }
      if (st === 0xff) {
        const type = b[i++], len = vlq();
        if (type === 0x51 && len === 3) tempos.push({ tick, us: b.readUIntBE(i, 3) });
        i += len; status = 0; continue;
      }
      if (st === 0xf0 || st === 0xf7) { i += vlq(); status = 0; continue; }
      status = st;
      const kind = st & 0xf0, a = b[i++], v = kind === 0xc0 || kind === 0xd0 ? 0 : b[i++];
      if (!wanted) continue;
      const key = ((st & 15) << 7) | a;
      if (kind === 0x90 && v > 0) { close(key, tick); open.set(key, { start: tick, note: a, vel: v, channel: st & 15 }); }
      else if (kind === 0x80 || kind === 0x90) close(key, tick);
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
