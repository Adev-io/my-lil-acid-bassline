// tools/stem-test-run.mjs — one crate section's melodic stems, scored: notegrab each part (once; its .mid is reused), convert it for
// Acid Bass (bass: best 32-step window) or My lil Roll (guitar, other), score the conversion against the stem's notes, and compare
// with the section's baseline. --load puts the parts into the open Rack patch; --restore puts the patch back.
//   bun tools/stem-test-run.mjs arrow-rapsong-crate 04_hook [--load | --restore]
// Spec: docs/superpowers/specs/2026-11-22-stem-test-design.md
// Author: Ari Klopfer / A_Development · MIT
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadCore } from './load.mjs';
import { readSmf } from './smf.mjs';
import { bestBassWindow, rollPart } from './stem-score.mjs';
import { loadIntoRack, restoreRack } from './rack.mjs';

const UVR = process.env.STEM_TEST_UVR || join(homedir(), 'Desktop', 'uvr-loops');
const NOTEGRAB_REPO = join(homedir(), 'dev', 'mcp-servers', 'my-lil-uvr-mcp');
const PARTS = [['2-bass', 'bass'], ['3-guitar', 'guitar'], ['5-other', 'other']];
const TARGET = { bass: 'Acid Bass I-A5', guitar: 'Roll 16', other: 'Roll 15' };
const DROP = 0.05;   // a part whose F1 falls this far below the baseline fails
const USAGE = 'usage: stem-test <crate> <section, e.g. 04_hook> [--load | --restore]';

function notegrab(wav, mid) {
  if (existsSync(mid)) return;
  const py = join(NOTEGRAB_REPO, '.venv', 'Scripts', 'python.exe');
  const code = 'import sys\nfrom uvrcore import notes\nnotes.grab(sys.argv[1], mode="loop", outputs=("json", "midi", "html"))';
  console.error('notegrab ' + wav + ' (first run loads TensorFlow, about 30 s)');
  const r = spawnSync(py, ['-c', code, wav], { cwd: NOTEGRAB_REPO, encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(mid)) throw new Error('notegrab failed on ' + wav + '\n' + String(r.stderr || r.error || '').slice(-800));
}

const round6 = (x) => Math.round(x * 1e6) / 1e6;
const pct = (x) => Math.round(x * 100) + '%';
// the ear verdicts already typed into results.md, by part (column 10 of the table)
function earOf(path) {
  const ear = {};
  if (!existsSync(path)) return ear;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const raw = line.split('|'), c = raw.map((x) => x.trim());
    if (c.length >= 12 && TARGET[c[1]]) { const v = raw.slice(10, -1).join('|').trim(); if (v) ear[c[1]] = v; }   // a verdict may hold a pipe
  }
  return ear;
}
function table(res, ear) {
  const vs = (r) => r.change === null ? 'baseline' : (r.change >= 0 ? '+' : '') + r.change.toFixed(2) + (r.fail ? ' FAIL' : '');
  return '# stem test: ' + res.crate + ' ' + res.section + ' (' + res.date + ')\n\nFill `ear` with keep, close or bad.\n\n' +
    '| part | target | window | F1 | kept | dropped | extra | off grid | vs baseline | ear |\n|---|---|---|---|---|---|---|---|---|---|\n' +
    res.rows.map((r) => '| ' + [r.part, r.target, r.window ?? '-', r.f1.toFixed(2), r.kept, r.dropped, r.extra, pct(r.offGrid), vs(r),
      ear[r.part] || ''].join(' | ') + ' |').join('\n') + '\n';
}

async function main(argv) {
  const flags = argv.filter((a) => a.startsWith('--')), [crate, section, ...rest] = argv.filter((a) => !a.startsWith('--'));
  if (!crate || !section || rest.length || flags.length > 1 || (flags[0] && flags[0] !== '--load' && flags[0] !== '--restore')) throw new Error(USAGE);
  const out = join(UVR, 'notegrab', 'stem-test', crate + '-' + section);
  if (flags[0] === '--restore') { await restoreRack(out); return 0; }
  const dir = join(UVR, 'crates', crate);
  if (!existsSync(dir)) throw new Error('no crate folder ' + dir);
  const files = readdirSync(dir), esc = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const { T } = loadCore();
  const found = PARTS.map(([prefix, part]) => {
    const re = new RegExp('^' + prefix + '-' + esc + '-(\\d+(?:\\.\\d+)?)bpm\\.wav$', 'i');
    const fs = files.filter((x) => re.test(x));
    if (fs.length > 1) throw new Error('more than one ' + part + ' stem for ' + section + ': ' + fs.join(', '));
    return { part, re, f: fs[0] };
  });
  const rows = [];
  for (const { part, re, f } of found) {
    if (!f) { console.error('no ' + part + ' stem for ' + section + ': skipped'); continue; }
    try {
      const bpm = Number(re.exec(f)[1]), stem = f.replace(/\.wav$/i, ''), mid = join(UVR, 'notegrab', stem, stem + '.mid');
      notegrab(join(dir, f), mid);
      const notes = readSmf(readFileSync(mid)).notes.filter((n) => n.channel !== 9);   // channel 10 is drums
      if (part === 'bass') {
        const w = bestBassWindow(notes, T, bpm);
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, 'bass-acid.json'), JSON.stringify(w.pattern));
        rows.push({ part, target: TARGET[part], window: w.offset, ...w.score, offGrid: w.report.meanSnap });
      } else {
        const r = rollPart(notes, bpm);
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, part + '-roll.txt'), r.text);
        rows.push({ part, target: TARGET[part], window: null, ...r.score, offGrid: r.meanSnap });
      }
    } catch (e) { console.error(part + ': ' + e.message + ', skipped'); }
  }
  if (!rows.length) throw new Error('no bass, guitar or other stem for section ' + section + ' in ' + dir);

  const res = { crate, section, date: new Date().toISOString().slice(0, 10), rows };
  writeFileSync(join(out, 'results.json'), JSON.stringify(res, null, 2) + '\n');
  const basePath = join(out, 'baseline.json');
  const base = existsSync(basePath) ? JSON.parse(readFileSync(basePath, 'utf8')) : (copyFileSync(join(out, 'results.json'), basePath), null);
  let fails = 0;
  for (const r of rows) {
    const b = base && base.rows.find((x) => x.part === r.part);
    r.change = b ? round6(r.f1 - b.f1) : null;   // rounded so a drop of exactly 0.05 passes
    r.fail = b ? round6(b.f1 - r.f1) > DROP : false;
    if (r.fail) fails++;
  }
  for (const b of base ? base.rows : []) if (!rows.some((r) => r.part === b.part)) { console.error(b.part + ': in the baseline but not in this run'); fails++; }
  const md = join(out, 'results.md'), text = table(res, earOf(md));
  writeFileSync(md, text);
  console.log(text + '\n' + out);
  if (flags[0] === '--load') await loadIntoRack(out);
  return fails ? 1 : 0;
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(e.message); process.exitCode = 2; });
