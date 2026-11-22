// tools/rack.test.mjs — the Rack client against a fake Rack MCP (node:http, JSON-RPC tools/call, in-memory modules and cables).
// Author: Ari Klopfer / A_Development · MIT
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createServer as netServer } from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let mods, state, cables, writes, junk, nextCable;
function reset() {
  mods = [['AcidBass', 1], ['Roll', 2], ['Triple', 3]].map(([slug, id]) => ({ id, plugin: 'MyLil', slug, model: slug, version: '2' }));
  state = {
    1: { id: 1, plugin: 'MyLil', model: 'AcidBass', version: '2', params: [], data: { patterns: Array.from({ length: 32 }, (_, i) => ({ own: i })) } },
    2: { id: 2, plugin: 'MyLil', model: 'Roll', version: '2', params: [], data: { key: 'C', patterns: Array.from({ length: 16 }, (_, i) => 'mine ' + (i + 1)) } },
  };
  cables = [{ id: 10, outputModuleId: 9, outputId: 0, inputModuleId: 3, inputId: 0 }, null, { id: 11, outputModuleId: 9, outputId: 1, inputModuleId: 3, inputId: 1 }];
  writes = 0; junk = false; nextCable = 100;
}
const tools = {
  vcvrack_list_modules: () => mods,
  vcvrack_list_cables: () => cables,
  vcvrack_get_module_state: (a) => structuredClone(state[a.id]),
  vcvrack_set_module_state: (a) => { if (!a.state.plugin || !a.state.model) throw new Error('"plugin" property not found'); writes++; state[a.id].data = structuredClone(a.state.data); },
  vcvrack_add_cable: (a) => { writes++; cables.push({ id: nextCable++, ...a }); },
  vcvrack_delete_cable: (a) => { writes++; cables = cables.filter((c) => !c || c.id !== a.id); },
};
const srv = createServer((req, res) => {
  let body = ''; req.on('data', (d) => { body += d; });
  req.on('end', () => {
    if (junk) return res.end('<html>nope</html>');
    const { id, params } = JSON.parse(body);
    let r; try { r = { content: [{ text: JSON.stringify(tools[params.name](params.arguments) ?? 'ok') }] }; } catch (e) { r = { isError: true, content: [{ text: e.message }] }; }
    res.end(JSON.stringify({ jsonrpc: '2.0', id, result: r }));
  });
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
process.env.RACK_MCP_URL = 'http://127.0.0.1:' + srv.address().port + '/mcp';
const { rack, loadIntoRack, restoreRack } = await import('./rack.mjs');
after(() => { srv.closeAllConnections(); srv.close(); });

const root = () => mkdtempSync(join(tmpdir(), 'rack-test-'));
const section = (r, name, files) => { const d = join(r, name); mkdirSync(d); for (const [f, t] of Object.entries(files)) writeFileSync(join(d, f), t); return d; };
const snap = () => JSON.stringify([state, cables.filter(Boolean).map((c) => [c.outputModuleId, c.outputId, c.inputModuleId, c.inputId].join()).sort()]);

test('rack: no Rack MCP listening -> "open the patch in Rack first"', async () => {
  const s = netServer();
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  const port = s.address().port;
  await new Promise((ok) => s.close(ok));   // the port is now free: connecting is refused
  await assert.rejects(rack('vcvrack_list_modules', {}, 'http://127.0.0.1:' + port + '/mcp'), /open the patch in Rack first/);
});

test('rack: a reply that is not JSON -> a clear error, not a SyntaxError', async () => {
  reset(); junk = true;
  await assert.rejects(rack('vcvrack_list_modules'), /vcvrack_list_modules: Rack MCP sent something that is not JSON/);
});

test('load: only this run\'s parts are pushed; a stale guitar-roll.txt is left out', async () => {
  reset();
  const r = root(), d = section(r, 'c-04', { 'bass-acid.json': '{"n":"stem"}', 'guitar-roll.txt': 'stale' });
  await loadIntoRack(d, new Set(['bass']), r);
  assert.deepEqual(state[1].data.patterns[4], { n: 'stem' });
  assert.equal(state[2].data.patterns[15], 'mine 16');
  assert.equal(state[1].data.patterns.length, 32);
  assert.deepEqual(cables.filter(Boolean).map((c) => [c.outputModuleId, c.outputId, c.inputId].join()).sort(), ['2,0,0', '2,1,1']);   // Roll feeds Triple
});

test('load: one backup in the root survives a second section; restore returns the state before the first', async () => {
  reset();
  const r = root(), x = section(r, 'c-04', { 'bass-acid.json': '{"n":"x"}', 'other-roll.txt': 'X' }), y = section(r, 'c-05', { 'bass-acid.json': '{"n":"y"}', 'guitar-roll.txt': 'Y' });
  const before = snap();
  await loadIntoRack(x, new Set(['bass', 'other']), r);
  await loadIntoRack(y, new Set(['bass', 'guitar']), r);
  assert.notEqual(snap(), before);
  assert.ok(readdirSync(r).includes('before.json'));
  await restoreRack(r);
  assert.equal(snap(), before);
  assert.ok(readdirSync(r).some((f) => f.startsWith('before.restored-')) && !readdirSync(r).includes('before.json'));
});

test('restore: only Acid Bass slot I-A5 and Roll patterns 15 and 16 go back; edits elsewhere and Roll\'s key stay', async () => {
  reset();
  const r = root(), d = section(r, 'c-04', { 'bass-acid.json': '{"n":"x"}', 'other-roll.txt': 'X', 'guitar-roll.txt': 'G' });
  await loadIntoRack(d, new Set(['bass', 'other', 'guitar']), r);
  state[1].data.patterns[0] = { edited: true }; state[2].data.patterns[0] = 'edited'; state[2].data.key = 'D';
  await restoreRack(r);
  assert.deepEqual(state[1].data.patterns[0], { edited: true });
  assert.equal(state[2].data.patterns[0], 'edited');
  assert.equal(state[2].data.key, 'D');
  assert.deepEqual(state[1].data.patterns[4], { own: 4 });
  assert.deepEqual([state[2].data.patterns[14], state[2].data.patterns[15]], ['mine 15', 'mine 16']);
});

test('modules: two of one kind -> an error, before any write', async () => {
  reset(); mods.push({ ...mods[1], id: 7 });
  const r = root(), d = section(r, 'c-04', { 'bass-acid.json': '{}' });
  await assert.rejects(loadIntoRack(d, new Set(['bass']), r), /more than one Roll in the open patch/);
  assert.equal(writes, 0);
  assert.deepEqual(readdirSync(r), ['c-04']);
});
