// tools/load.mjs — runs the page's two pure scripts in node:vm the way the page loads them. Returns { T: TB303, X: TB303Targets }.
// Author: Ari Klopfer / A_Development · MIT
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadCore() {
  const sandbox = { TextEncoder };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of ['acidbass.js', 'targets.js']) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
  return { T: sandbox.TB303, X: sandbox.TB303Targets };
}
