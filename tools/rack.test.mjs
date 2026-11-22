// tools/rack.test.mjs — the Rack client's one case that needs no Rack: nothing listening.
// Author: Ari Klopfer / A_Development · MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { rack } from './rack.mjs';

test('rack: no Rack MCP listening -> "open the patch in Rack first"', async () => {
  const srv = createServer();
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const port = srv.address().port;
  await new Promise((ok) => srv.close(ok));   // the port is now free: connecting is refused
  await assert.rejects(rack('vcvrack_list_modules', {}, 'http://127.0.0.1:' + port + '/mcp'), /open the patch in Rack first/);
});
