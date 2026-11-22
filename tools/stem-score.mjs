// tools/stem-score.mjs — the stem test's pure half: where a stem's notes and a converted part's notes start (in 16th steps), and how
// well they match. A stem note is hit by a part note starting within half a step with the same pitch class (the reader folds octaves).
// Spec: docs/superpowers/specs/2026-11-22-stem-test-design.md
// Author: Ari Klopfer / A_Development · MIT
import { notesToPattern } from './smf.mjs';

// readSmf notes -> [{ pos, note }]: pos is the onset in 16th steps at bpm (bpm / 15 steps a second), step 0 at startSec
export const stemOnsets = (notes, bpm, startSec = 0) => notes.map((n) => ({ pos: (n.startSec - startSec) * bpm / 15, note: n.note }));

// a step pattern's note-ons as [{ pos, note }], pos = offset + step. A note step slid into from the same pitch writes no note-on.
export function patternOnsets(p, offset = 0) {
  const out = [];
  for (let s = 0; s < p.len; s++) {
    const st = p.steps[s];
    if (st.gate !== 'note') continue;
    const midi = 36 + st.note + 12 * st.oct, prev = s > 0 ? p.steps[s - 1] : null;
    if (prev && prev.gate === 'note' && prev.slide && out.length && out[out.length - 1].note === midi) continue;
    out.push({ pos: offset + s, note: midi });
  }
  return out;
}

// F1 of part against stem. Each part note hits at most one stem note (stem and part both taken in time order, first free match wins).
export function f1Score(stem, part) {
  const used = new Set(), sorted = [...part].sort((x, y) => x.pos - y.pos);
  let hits = 0;
  for (const a of [...stem].sort((x, y) => x.pos - y.pos)) {
    const j = sorted.findIndex((b, i) => !used.has(i) && Math.abs(b.pos - a.pos) <= 0.5 && (b.note - a.note) % 12 === 0);
    if (j >= 0) { used.add(j); hits++; }
  }
  const p = part.length ? hits / part.length : 0, r = stem.length ? hits / stem.length : 0;
  return { f1: p + r ? 2 * p * r / (p + r) : 0, kept: hits, dropped: stem.length - hits, extra: part.length - hits };
}

// The bass as an Acid Bass pattern: every 32-step window (offset 0, 32, 64, ...) read by notesToPattern at the song's tempo,
// each scored against the stem notes that snap into it. The window with the most stem notes kept wins, then the higher F1, then the
// earlier one (F1 alone would let a window with one stray note, F1 1, beat a real phrase at F1 0.94).
// Returns { offset, pattern, report, score }.
export function bestBassWindow(notes, T, bpm, startSec = 0) {
  const on = stemOnsets(notes, bpm, startSec);
  const last = Math.max(...on.map((o) => Math.round(o.pos)));
  let best = null;
  for (let offset = 0; offset <= last; offset += 32) {
    let r;
    try { r = notesToPattern(notes, null, T, { steps: 32, offset, gridBpm: bpm, startSec }); }
    catch (e) { if (String(e.message).startsWith('no notes')) continue; throw e; }   // an empty window
    const stem = on.filter((o) => Math.round(o.pos) >= offset && Math.round(o.pos) < offset + 32);
    const score = f1Score(stem, patternOnsets(r.pattern, offset));
    if (!best || score.kept > best.score.kept || (score.kept === best.score.kept && score.f1 > best.score.f1)) best = { offset, pattern: r.pattern, report: r.report, score };
  }
  if (!best) throw new Error('no 32-step window holds a note');
  return best;
}

const ROLL_16TH = 24, ROLL_BAR = 384, ROLL_MAX_BARS = 16;   // My lil Roll: 96 PPQ, 4/4, up to 16 bars

// A chord part as My lil Roll text: every note snapped to a 16th at bpm, at least a 16th long, one per start + pitch (Roll keeps
// one), velocity 0-1, the first 16 bars only. Returns { text, bars, score, meanSnap } (score: F1 against the stem's notes in those
// bars; meanSnap: their mean distance to the 16th grid, in steps).
export function rollPart(notes, bpm, startSec = 0) {
  const tick = (sec) => Math.round((sec - startSec) * bpm / 15) * ROLL_16TH;
  const rows = [], seen = new Set();
  for (const n of notes) {
    const s = tick(n.startSec);
    if (s < 0 || s >= ROLL_MAX_BARS * ROLL_BAR || seen.has(s + ':' + n.note)) continue;
    seen.add(s + ':' + n.note);
    rows.push([s, Math.max(ROLL_16TH, tick(n.endSec) - s), n.note, Math.round(n.vel / 127 * 100) / 100]);
  }
  if (!rows.length) throw new Error('no notes in the first 16 bars');
  const bars = Math.floor(Math.max(...rows.map((r) => r[0])) / ROLL_BAR) + 1;
  const stem = stemOnsets(notes, bpm, startSec).filter((o) => Math.round(o.pos) >= 0 && Math.round(o.pos) < bars * 16);
  const score = f1Score(stem, rows.map(([s, , note]) => ({ pos: s / ROLL_16TH, note })));
  const meanSnap = stem.reduce((a, o) => a + Math.abs(o.pos - Math.round(o.pos)), 0) / stem.length;
  return { text: 'bars=' + bars + '\n' + rows.map((r) => r.join(' ')).join('\n') + '\n', bars, score, meanSnap };
}
