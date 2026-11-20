// tools/pattern-export.mjs — one pattern in (step notation, pattern JSON, or a .mid), one target out (strudel, nubass, notation).
//   bun tools/pattern-export.mjs I-A1.txt --to strudel
//   bun tools/pattern-export.mjs bass-stem.mid --to notation --steps 16 --offset 32
//   bun tools/pattern-export.mjs I-A1.txt --to nubass --out I-A1-nubass.mid
//   bun tools/pattern-export.mjs bass-stem.mid --to strudel --grid-bpm 128 --start 0.47   (a notegrab / basic-pitch stem)
// Author: Ari Klopfer / A_Development · MIT
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { loadCore } from './load.mjs';
import { describe, notesToPattern, readSmf } from './smf.mjs';

const TARGETS = ['strudel', 'nubass', 'notation'];
const USAGE = 'usage: pattern-export <input.txt|.json|.mid> --to strudel|nubass|notation [--out file] [--force] [--bpm N] [--name X] [--steps N] [--offset N] [--track N] [--grid-bpm N] [--start SECONDS]';

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--force') a.force = true;
    else if (x.startsWith('--')) {
      if (argv[i + 1] === undefined) throw new Error(x + ' needs a value');
      a[x.slice(2)] = argv[++i];
    } else a._.push(x);
  }
  return a;
}

function run(argv) {
  const a = parseArgs(argv);
  if (a._.length !== 1 || !a.to) throw new Error(USAGE);
  if (!TARGETS.includes(a.to)) throw new Error('unknown target "' + a.to + '": use ' + TARGETS.join(', '));
  const num = (name) => {
    if (a[name] === undefined) return undefined;
    const n = Number(a[name]);
    if (!Number.isFinite(n)) throw new Error('--' + name + ' needs a number');
    return n;
  };
  const { T, X } = loadCore();
  const file = a._[0], ext = extname(file).toLowerCase();
  const raw = readFileSync(file);
  const name = a.name || basename(file, extname(file));
  let pattern, bpm = num('bpm');
  if (ext === '.mid' || ext === '.midi') {
    const m = readSmf(raw, { track: num('track') });
    const gridBpm = num('grid-bpm');
    // basic-pitch (and so notegrab) writes every transcription at 120 bpm and 220 PPQ, whatever the song's tempo
    if (!gridBpm && m.ppq === 220 && m.bpm === 120) console.error('this file has basic-pitch\'s placeholder tempo (120 bpm at 220 PPQ): its ticks do not follow the song; pass --grid-bpm <song bpm>');
    const r = notesToPattern(m.notes, m.ppq, T, { steps: num('steps'), offset: num('offset'), gridBpm, startSec: num('start') });
    pattern = r.pattern;
    bpm = bpm || gridBpm || m.bpm || undefined;
    console.error(describe(r.report));
  } else {
    const text = raw.toString('utf8');
    if (ext === '.json') pattern = T.cleanPattern(JSON.parse(text));
    else {
      // the exported .txt files start with "# ..." comment lines; the first of them says the tempo
      pattern = T.parsePattern(text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).join(' '));
      bpm = bpm || Number((/(\d+) bpm/.exec(text) || [])[1]) || undefined;
    }
  }
  bpm = bpm || 120;

  let out;
  if (a.to === 'strudel') out = X.toStrudel(pattern, { name, bpm });
  else if (a.to === 'notation') out = T.formatPattern(pattern) + '\n';
  else {
    if (!a.out) throw new Error('nubass writes a .mid file: give --out file.mid');
    out = X.toNubassMidi([pattern], bpm, { name, profile: { onFold: (from, to) => console.error('folded MIDI ' + from + ' to ' + to) } });
  }
  if (!a.out) { process.stdout.write(out); return; }
  try { writeFileSync(a.out, out, { flag: a.force ? 'w' : 'wx' }); }
  catch (e) { throw e.code === 'EEXIST' ? new Error(a.out + ' exists: pass --force to overwrite it') : e; }
  console.error('wrote ' + a.out);
}

try { run(process.argv.slice(2)); }
catch (e) { console.error(e.message); process.exit(1); }
