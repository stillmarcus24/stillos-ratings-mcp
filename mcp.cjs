'use strict';
/*
 * MCP stdio server for stillos-ratings-mcp. Newline-delimited JSON-RPC 2.0, zero deps.
 * All stdio wiring lives here and not in index.cjs, so requiring the tool logic (from a
 * test or the CLI) never has the side effect of attaching stdin listeners.
 *
 * The version is READ FROM THE MANIFEST, never written as a literal: the sibling
 * stillos-notary-mcp shipped a hardcoded '1.2.0' and introduced itself to every client
 * as the wrong version for a full release cycle.
 */
const { TOOLS, callTool } = require('./index.cjs');
const { version: PKG_VERSION } = require('./package.json');

const SERVER = { name: 'stillos-ratings-mcp', version: PKG_VERSION };
const PROTOCOL = '2024-11-05';

function write(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
function reply(id, result) { write({ jsonrpc: '2.0', id, result }); }
function replyError(id, code, message) { write({ jsonrpc: '2.0', id, error: { code, message } }); }

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') return reply(id, { protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: SERVER });
  if (method === 'notifications/initialized' || method === 'initialized') return;
  if (method === 'tools/list') return reply(id, { tools: TOOLS });
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/call') {
    try {
      const out = await callTool(params.name, params.arguments || {});
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
    } catch (e) {
      // A failed lookup is an ERROR, not an empty-but-successful answer. A tool that
      // returns "{}" on failure invites a client to read it as "nothing found", which
      // for a safety check is the one wrong direction to fail in.
      return replyError(id, -32000, e.message);
    }
  }
  if (id !== undefined) return replyError(id, -32601, `method not found: ${method}`);
}

let buf = '', inflight = 0, ended = false;
function track(p) { inflight++; Promise.resolve(p).finally(() => { inflight--; if (ended && inflight === 0) process.exit(0); }); }
process.stdin.on('data', (chunk) => {
  buf += chunk.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (line) { try { track(handle(JSON.parse(line))); } catch { /* ignore malformed */ } }
  }
});
process.stdin.on('end', () => { ended = true; if (inflight === 0) process.exit(0); });
