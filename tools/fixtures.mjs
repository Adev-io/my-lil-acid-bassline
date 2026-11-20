// tools/fixtures.mjs — test-only MIDI files: a tiny format-0 writer, and a "stem" written the way basic-pitch writes one.
// Author: Ari Klopfer / A_Development · MIT
import { readSmf } from './smf.mjs';

const vlq = (n) => { const b = [n & 0x7f]; while ((n >>= 7) > 0) b.unshift((n & 0x7f) | 0x80); return b; };
const be = (n, k) => Array.from({ length: k }, (_, i) => (n >>> (8 * (k - 1 - i))) & 255);

// A format-0 file from [tick, ...bytes] events, sorted by tick (note-offs before note-ons on the same tick).
export function smf(ppq, events) {
  const ev = [...events].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const body = [];
  let last = 0;
  for (const [tick, ...bytes] of ev) { body.push(...vlq(tick - last), ...bytes); last = tick; }
  body.push(0, 0xff, 0x2f, 0);
  return Uint8Array.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, ...be(ppq, 2), 0x4d, 0x54, 0x72, 0x6b, ...be(body.length, 4), ...body]);
}
export const tempo = (tick, bpm) => { const us = Math.round(6e7 / bpm); return [tick, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255]; };

// The pattern played at realBpm, starting startSec into the file, each note nudged by +-jitterMs, then written as basic-pitch
// writes a transcription: a placeholder 120 bpm at pretty_midi's 220 PPQ, so the ticks no longer follow the song's beat.
export function stemLike(T, text, realBpm, startSec = 0, jitterMs = 0) {
  const played = readSmf(T.patternsToMidi([T.parsePattern(text)], realBpm, 'x')).notes;
  const tick = (sec) => Math.round(sec * 2 * 220);   // 120 bpm = 2 beats a second, 220 ticks a beat
  const ev = [tempo(0, 120)];
  played.forEach((n, i) => {
    const j = (i % 2 ? -1 : 1) * jitterMs / 1000;
    ev.push([tick(startSec + n.startSec + j), 0x90, n.note, n.vel], [tick(startSec + n.endSec + j), 0x80, n.note, 0]);
  });
  return smf(220, ev);
}

// A stem with explicit lengths, the way a transcriber leaves them: notes [{ step, note, sec, vel }], each starting on its
// 16th at bpm (plus opts.startSec) and lasting sec seconds, written at basic-pitch's placeholder 120 bpm and 220 PPQ.
export function stemNotes(notes, bpm, opts = {}) {
  const tick = (sec) => Math.round(sec * 2 * 220), from = opts.startSec || 0;
  const ev = [tempo(0, 120)];
  for (const n of notes) {
    const at = from + n.step * 15 / bpm;
    ev.push([tick(at), 0x90, n.note, n.vel || 90], [tick(at + n.sec), 0x80, n.note, 0]);
  }
  return smf(220, ev);
}
