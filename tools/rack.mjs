// tools/rack.mjs — the stem test's Rack side, over the Rack MCP's HTTP endpoint (JSON-RPC tools/call). loadIntoRack writes the
// test parts into fixed slots (Acid Bass slot index 4 = I-A5, Roll patterns 15 and 16) and patches Roll into Triple, after saving
// what it changes to before.json (one file in the stem-test folder, shared by all sections); restoreRack puts back only those
// slots and Triple's inputs. No other slot or cable is touched.
// Spec: docs/superpowers/specs/2026-11-22-stem-test-design.md
// Author: Ari Klopfer / A_Development · MIT
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const RACK_URL = process.env.RACK_MCP_URL || 'http://127.0.0.1:2600/mcp';
const ACID_SLOT = 4, ROLL_SLOT = { other: 15, guitar: 16 };

export async function rack(name, args = {}, url = RACK_URL) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST', signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    });
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Error(name + ': Rack did not answer in 30 s');
    throw new Error('open the patch in Rack first (no Rack MCP at ' + url + ')');
  }
  let j;
  try { j = JSON.parse(await res.text()); } catch { throw new Error(name + ': Rack MCP sent something that is not JSON'); }
  const text = j.result && j.result.content && j.result.content[0] ? j.result.content[0].text : '';
  if (j.error || (j.result && j.result.isError)) throw new Error(name + ' failed: ' + (text || JSON.stringify(j.error) || 'see the Rack log'));
  try { return JSON.parse(text); } catch { return text; }
}

async function modules() {
  const mods = await rack('vcvrack_list_modules');
  const id = (slug) => {
    const ms = mods.filter((x) => x.slug === slug);
    if (ms.length > 1) throw new Error('more than one ' + slug + ' in the open patch');
    if (!ms.length) throw new Error('no ' + slug + ' module in the open patch');
    return ms[0].id;
  };
  return { acid: id('AcidBass'), roll: id('Roll'), triple: id('Triple') };
}
const tripleInputs = async (ids) => (await rack('vcvrack_list_cables')).filter((c) => c && c.inputModuleId === ids.triple && c.inputId <= 1);
// Rack's moduleFromJson needs plugin and model; sending data alone leaves the knobs as they are
const setData = (m, data) => rack('vcvrack_set_module_state', { id: m.id, state: { id: m.id, plugin: m.plugin, model: m.model, version: m.version, data } });

// out: this section's folder; parts: the parts this run produced (older files in out are not pushed); root: the stem-test folder,
// which holds the one before.json shared by every section
export async function loadIntoRack(out, parts, root) {
  const ids = await modules(), before = join(root, 'before.json');
  const acid = await rack('vcvrack_get_module_state', { id: ids.acid }), roll = await rack('vcvrack_get_module_state', { id: ids.roll });
  if (!existsSync(before)) writeFileSync(before, JSON.stringify({ ids, acid, roll, tripleInputs: await tripleInputs(ids) }));   // the first backup is the real one
  const bass = join(out, 'bass-acid.json');
  if (parts.has('bass') && existsSync(bass)) {
    const patterns = acid.data.patterns.slice();   // every slot, in order: a missing slot would load empty
    patterns[ACID_SLOT] = JSON.parse(readFileSync(bass, 'utf8'));
    await setData(acid, { ...acid.data, patterns });
  }
  const patterns = roll.data.patterns.slice();
  for (const [part, slot] of Object.entries(ROLL_SLOT)) {
    const f = join(out, part + '-roll.txt');
    if (parts.has(part) && existsSync(f)) patterns[slot - 1] = readFileSync(f, 'utf8');
  }
  await setData(roll, { ...roll.data, patterns });
  const now = await tripleInputs(ids);
  for (const c of now) if (c.outputModuleId !== ids.roll || c.outputId !== c.inputId) await rack('vcvrack_delete_cable', { id: c.id });
  for (const i of [0, 1])   // Roll V/OCT -> Triple V/OCT, Roll GATE -> Triple GATE
    if (!now.some((c) => c.outputModuleId === ids.roll && c.outputId === i && c.inputId === i))
      await rack('vcvrack_add_cable', { outputModuleId: ids.roll, outputId: i, inputModuleId: ids.triple, inputId: i });
  console.error('loaded: Acid Bass I-A5, Roll 15 (other) and 16 (guitar), Roll patched into Triple. Undo with --restore.');
}

export async function restoreRack(root) {
  const before = join(root, 'before.json');
  if (!existsSync(before)) throw new Error('nothing to restore: no ' + before);
  const saved = JSON.parse(readFileSync(before, 'utf8')), ids = await modules();
  if (['acid', 'roll', 'triple'].some((k) => ids[k] !== saved.ids[k])) throw new Error('the open patch is not the one in ' + before + ' (module ids differ)');
  // only the test slots go back: edits to any other slot, and Roll's key and mode, stay as they are now
  const acid = await rack('vcvrack_get_module_state', { id: ids.acid }), roll = await rack('vcvrack_get_module_state', { id: ids.roll });
  const ap = acid.data.patterns.slice(), rp = roll.data.patterns.slice();
  ap[ACID_SLOT] = saved.acid.data.patterns[ACID_SLOT];
  for (const slot of Object.values(ROLL_SLOT)) rp[slot - 1] = saved.roll.data.patterns[slot - 1];
  await setData(acid, { ...acid.data, patterns: ap });
  await setData(roll, { ...roll.data, patterns: rp });
  for (const c of await tripleInputs(ids)) await rack('vcvrack_delete_cable', { id: c.id });
  for (const c of saved.tripleInputs)
    await rack('vcvrack_add_cable', { outputModuleId: c.outputModuleId, outputId: c.outputId, inputModuleId: c.inputModuleId, inputId: c.inputId });
  renameSync(before, join(root, 'before.restored-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'));
  console.error('restored the test slots (Acid Bass I-A5, Roll 15 and 16) and Triple\'s inputs from ' + before);
}
