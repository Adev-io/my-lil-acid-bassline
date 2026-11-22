// tools/stem-score.mjs — the stem test's pure half: where a stem's notes and a converted part's notes start (in 16th steps), and how
// well they match. A stem note is hit by a part note starting within half a step with the same pitch class (the reader folds octaves).
// Spec: docs/superpowers/specs/2026-11-22-stem-test-design.md
// Author: Ari Klopfer / A_Development · MIT

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

// F1 of part against stem. Each part note hits at most one stem note (stem notes taken in time order, first free match wins).
export function f1Score(stem, part) {
  const used = new Set();
  let hits = 0;
  for (const a of [...stem].sort((x, y) => x.pos - y.pos)) {
    const j = part.findIndex((b, i) => !used.has(i) && Math.abs(b.pos - a.pos) <= 0.5 && (b.note - a.note) % 12 === 0);
    if (j >= 0) { used.add(j); hits++; }
  }
  const p = part.length ? hits / part.length : 0, r = stem.length ? hits / stem.length : 0;
  return { f1: p + r ? 2 * p * r / (p + r) : 0, kept: hits, dropped: stem.length - hits, extra: part.length - hits };
}
