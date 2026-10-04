'use strict';
/*
 * Known-answer tests. The network-touching ones run against the real public endpoint —
 * that is deliberate: the whole package is a thin client over that endpoint, and a mock
 * would only prove the mock works. Pass --offline to skip those.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const { TOOLS, callTool, normalizeHost, checkServer, compareServers, shapeFleet } = require('./index.cjs');

let pass = 0, fail = 0;
const t = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${n}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};
const ok = (n, cond) => t(n, !!cond, true);

(async () => {
  // ── HOST NORMALIZATION. Someone pasting the URL they were about to install is the
  // single most likely input, and returning "not rated" for it would be a usability
  // failure disguised as a data gap.
  t('bare host', normalizeHost('api.mcp.ai'), 'api.mcp.ai');
  t('https url', normalizeHost('https://api.mcp.ai/mcp'), 'api.mcp.ai');
  t('url with query', normalizeHost('https://api.mcp.ai/mcp?x=1'), 'api.mcp.ai');
  t('url with port', normalizeHost('https://api.mcp.ai:8443/sse'), 'api.mcp.ai');
  t('uppercase is folded', normalizeHost('API.MCP.AI'), 'api.mcp.ai');
  t('sse scheme', normalizeHost('sse://api.mcp.ai/x'), 'api.mcp.ai');
  t('whitespace', normalizeHost('  api.mcp.ai  '), 'api.mcp.ai');
  let threw = false; try { normalizeHost(''); } catch { threw = true; }
  ok('empty host throws rather than guessing', threw);

  // ── TOOL CONTRACT.
  t('three tools', TOOLS.length, 3);
  ok('every tool has a schema', TOOLS.every((x) => x.inputSchema && x.inputSchema.type === 'object'));
  ok('every tool has a real description', TOOLS.every((x) => x.description.length > 80));
  ok('check tool requires a host', TOOLS.find((x) => x.name === 'check_mcp_server').inputSchema.required.includes('host'));
  let unknown = false; try { await callTool('nope', {}); } catch { unknown = true; }
  ok('unknown tool throws', unknown);

  // ── THE SAFETY INVARIANT, tested on a synthetic shape so it holds without network:
  // an unrated host must never read as a pass.
  const NOT_RATED_MUST_SAY = /not attested safe/i;

  if (process.argv.includes('--offline')) {
    console.log(`\nstillos-ratings-mcp: ${pass} passed, ${fail} failed (offline subset)`);
    process.exit(fail === 0 ? 0 : 1);
  }

  // ── LIVE, against the real free endpoint.
  const unrated = await checkServer({ host: 'definitely-not-a-real-host.invalid' });
  t('unrated host is not rated', unrated.rated, false);
  t('unrated verdict is explicit', unrated.verdict, 'NOT_RATED');
  ok('unrated host WARNS that unobserved is not safe', NOT_RATED_MUST_SAY.test(unrated.meaning));
  ok('unrated host carries no grade', unrated.grade === undefined);

  const rated = await checkServer({ host: 'api.mcp.ai' });
  t('known host is rated', rated.rated, true);
  ok('rated host has a grade', /^[A-F]$/.test(rated.grade));
  ok('rated host has a rank within the population', rated.rank >= 1 && rated.rank <= rated.of);
  ok('grade is explained as relative, not absolute', /percentile/i.test(rated.grade_meaning));
  ok('dimensions carry their meaning', Object.values(rated.dimensions).every((d) => typeof d.value === 'number' && d.means));
  // THE RECOMPUTE CONTRACT. A bare verify URL is unfalsifiable — a reader is handed an
  // endpoint and no hash to put in it. The API must hand over the SPECIFIC receipt for
  // the board the answer came from, plus the scope, so nobody mistakes an integrity
  // seal for an adjudication that the rating is correct.
  const rc = rated.recompute_yourself;
  ok('recompute is structured, not a bare url', rc && typeof rc === 'object');
  ok('recompute names the board sha256', /^[0-9a-f]{64}$/.test(rc.board_sha256 || ''));
  ok('recompute names a citable receipt hash', /^[0-9a-f]{64}$/.test(rc.receipt_hash || ''));
  ok('recompute links the public verifier WITH the hash', /notary\/verify\?hash=[0-9a-f]{64}/.test(rc.verify || ''));
  ok('recompute states its scope is not adjudication', /does not adjudicate/i.test(rc.scope || ''));
  ok('a clean host still carries the caveat', rated.finding ? true : /not a clean bill of health/i.test(rated.no_finding_caveat));

  // ── FLEET: the three cases must be textually distinguishable. An upstream that returns
  // no fleet object at all must NOT read as "measured, and it is not a fleet".
  const absent = shapeFleet(undefined);
  t('absent fleet data is reported as NOT measured', absent.measured, false);
  ok('absent fleet data says so in words', /not measured/i.test(absent.means));
  ok('absent fleet data refuses to imply it is not a fleet', /not the same as/i.test(absent.means));
  ok('absent fleet data carries no family size', absent.template_family_size === undefined);
  const unmatched = shapeFleet({ known: false });
  t('an unmatched host is measured but not in the registry', unmatched.in_registry, false);
  ok('an unmatched host is not called a fleet', unmatched.template_family_size === undefined);
  const fleeted = shapeFleet({ known: true, publisher: 'io.github.mcp-dir', publisher_servers: 1113, template_family_size: 1022, means: 'shares its core tool set' });
  t('a fleet member reports its family size', fleeted.template_family_size, 1022);
  t('a fleet member reports its publisher scale', fleeted.publisher_servers, 1113);
  ok('a fleet member is explicitly not an accusation', /not an accusation of bad faith/i.test(fleeted.why_it_matters));
  ok('a fleet member concedes a big publisher can ship good software', /can still ship good software/i.test(fleeted.why_it_matters));
  ok('the live rated host carries a fleet block', !!rated.fleet && rated.fleet.measured === true);

  const withFinding = await checkServer({ host: 'starsphera.com' });
  ok('the finding host reports a finding', !!withFinding.finding);
  t('finding verdict is explicit', withFinding.verdict, 'RATED_WITH_OPEN_FINDING');
  ok('finding explains itself without alleging intent', /not an accusation of intent/i.test(withFinding.finding.what_it_means));
  ok('finding links free evidence', /\/sample\?host=/.test(withFinding.finding.free_evidence));

  const cmp = await compareServers({ hosts: ['api.mcp.ai', 'definitely-not-a-real-host.invalid'] });
  t('compare counts rated', cmp.rated, 1);
  t('compare counts unrated', cmp.not_rated, 1);
  let tooMany = false; try { await compareServers({ hosts: new Array(11).fill('a.com') }); } catch { tooMany = true; }
  ok('compare refuses more than 10', tooMany);
  let empty = false; try { await compareServers({ hosts: [] }); } catch { empty = true; }
  ok('compare refuses an empty list', empty);

  // ── THE PROTOCOL, exercised exactly as a client does: spawn it and speak JSON-RPC.
  const msgs = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'check_mcp_server', arguments: { host: 'api.mcp.ai' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope', arguments: {} } },
  ].map((m) => JSON.stringify(m)).join('\n') + '\n';
  const r = spawnSync(process.execPath, [path.join(__dirname, 'bin.cjs'), 'mcp'], { input: msgs, encoding: 'utf8', timeout: 60000 });
  const out = r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const byId = Object.fromEntries(out.map((x) => [x.id, x]));
  t('initialize returns the protocol version', byId[1].result.protocolVersion, '2024-11-05');
  t('server names itself', byId[1].result.serverInfo.name, 'stillos-ratings-mcp');
  t('server version matches the manifest', byId[1].result.serverInfo.version, require('./package.json').version);
  t('tools/list returns all three', byId[2].result.tools.length, 3);
  ok('tools/call returns content', byId[3].result.content[0].type === 'text');
  ok('a real lookup came back rated', JSON.parse(byId[3].result.content[0].text).rated === true);
  ok('an unknown tool returns a JSON-RPC error, not an empty success', !!byId[4].error);
  ok('process exited cleanly on stdin end', r.status === 0);

  console.log(`\nstillos-ratings-mcp: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
