'use strict';
/*
 * stillos-ratings-mcp — tool logic. No stdio wiring here (see mcp.cjs), so requiring
 * this file never attaches stdin listeners.
 *
 * THE QUESTION THIS ANSWERS. Every MCP client is one `npx` away from granting a
 * stranger's code a tool surface, and there is no "should I install this" check in the
 * ecosystem. We already run the 6-hourly census that can answer it — 7,070 rated operators
 * and 18 carrying a dated tool-surface finding — and it was reachable only as a web page
 * and a REST call. This exposes it where the decision is actually made: inside the client
 * that is about to install something.
 *
 * ZERO DEPENDENCIES, and it holds no secret. Every call hits the FREE public endpoint
 * (no key, no signup), so this package can never leak a credential and a user can verify
 * every answer by curling the same URL themselves.
 *
 * HONESTY RULES THIS FILE ENFORCES, because the whole product is worthless if it lies in
 * the comfortable direction:
 *   - An unrated host returns rated:false with a reason. Unobserved is NOT attested safe
 *     — we enumerate 41.8% of distinct remote-declaring hosts, measured, not estimated —
 *     and this tool must never let an absence read as a pass.
 *   - A grade is a PERCENTILE within the measured population, not an absolute audit.
 *   - A finding says "this changed while the version string did not". It is not an
 *     accusation of malice, and the text never implies one.
 */
const https = require('https');

const BASE = process.env.STILLOS_RATINGS_BASE || 'https://stillosdigitalholdings.com/ratings';
const UA = 'stillos-ratings-mcp/' + require('./package.json').version;

function get(pathname) {
  return new Promise((resolve, reject) => {
    const url = BASE + pathname;
    const req = https.get(url, { timeout: 15000, headers: { 'user-agent': UA, accept: 'application/json' } }, (res) => {
      let b = '';
      res.on('data', (c) => { if (b.length < 4000000) b += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`${url} returned HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(b)); } catch (e) { reject(new Error(`${url} did not return JSON: ${e.message}`)); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error(`${url} timed out after 15s — reported as unreachable, not as a pass`)); });
    req.on('error', (e) => reject(new Error(`${url} failed: ${e.message}`)));
  });
}

// Accepts anything an MCP user is likely to paste: a bare host, a full endpoint URL, or
// a registry name like `io.github.someone/their-server`. Returning "not rated" because
// someone pasted a URL would be a usability failure dressed as a data gap.
function normalizeHost(input) {
  let h = String(input || '').trim();
  if (!h) throw new Error('a host is required, e.g. api.mcp.ai');
  h = h.replace(/^[a-z+]+:\/\//i, '');
  h = h.split('/')[0].split('?')[0].split('#')[0];
  h = h.replace(/:\d+$/, '').toLowerCase();
  return h;
}

const DIM_MEANING = {
  reach: 'share of the measured tool surface this operator serves',
  payment_ready: 'advertises a machine-payable x402 rail',
  surface_stability: 'tool surface did NOT change while the served version string stayed the same',
  maturity: 'serves a coherent version string at all',
  self_identified: 'names itself in its own server info',
};

// Is this one server someone built, or one of thousands a single account mass-published?
// Absence of the upstream `fleet` object means NOT MEASURED — never render that as
// "measured, and it is not a fleet". A missing measurement wearing a clean answer is the
// false-zero failure mode, so the two cases are kept textually distinct.
function shapeFleet(f) {
  if (!f || typeof f !== 'object') {
    return { measured: false, means: 'this endpoint did not return fleet data — publisher concentration was NOT measured for this host, which is not the same as "it is not a fleet"' };
  }
  if (!f.known) {
    return { measured: true, in_registry: false, means: 'this host does not match a registry publisher we hold, so publisher concentration is unknown for it' };
  }
  return {
    measured: true,
    in_registry: true,
    publisher: f.publisher || null,
    publisher_servers: f.publisher_servers,
    template_family_size: f.template_family_size,
    means: f.means || null,
    why_it_matters: 'A server that is 1 of thousands from one account running a shared boilerplate tool set is a different proposition from a one-off someone maintains. This is a structural observation about how it was produced, NOT an accusation of bad faith — and a large publisher can still ship good software.',
  };
}

async function checkServer({ host }) {
  const h = normalizeHost(host);
  const d = await get('/node?host=' + encodeURIComponent(h));
  if (!d.found) {
    return {
      host: h, rated: false,
      verdict: 'NOT_RATED',
      // The single most important sentence in this package.
      meaning: `This host is not in our enumerable census. UNOBSERVED IS NOT ATTESTED SAFE — we enumerate 41.8% of the distinct remote-declaring hosts in the public MCP registry (measured 2026-10-04), so this is a statement about our reach, not about this operator. Do not read it as a pass.`,
      what_to_do: 'Judge it on its own merits: who publishes it, whether the source is inspectable, and what tools it asks for.',
      source: `${BASE}/node?host=${h}`,
    };
  }
  const finding = d.exposure && d.exposure.finding ? {
    severity: d.exposure.finding,
    version_served_unchanged: d.exposure.version_served,
    tools_added: d.exposure.tools_added,
    action_taking_tools_added: (d.exposure.action_tools || []).length,
    first_observed: d.exposure.observed,
    what_it_means: `Between two enumerations this operator's advertised tool set grew by ${d.exposure.tools_added} while the version string it serves stayed byte-identical at ${d.exposure.version_served}. Any client that pinned that version and approved its tool list was never asked to re-approve what it now exposes. This is an OBSERVATION about change, not an accusation of intent.`,
    free_evidence: `${BASE}/sample?host=${h}`,
  } : null;
  return {
    host: h, rated: true,
    grade: d.grade, rank: d.rank, of: d.of, score: d.score,
    grade_meaning: `Percentile standing within ${d.of} rated operators — A is the top 5%, F the bottom 15%. This is RELATIVE standing, not an absolute security audit, and the whole ecosystem scores low on these dimensions today.`,
    verdict: finding ? 'RATED_WITH_OPEN_FINDING' : 'RATED_NO_FINDING',
    dimensions: Object.fromEntries(Object.entries(d.dimensions || {}).map(([k, v]) => [k, { value: v, means: DIM_MEANING[k] || null }])),
    payment_ready_x402: d.payment_ready_x402,
    declares_version: d.declares_version,
    self_identifies: d.self_identifies,
    endpoints: d.endpoints,
    fleet: shapeFleet(d.fleet),
    finding,
    no_finding_caveat: finding ? null : 'No dated tool-surface finding at or above CLASS_SUSPENDED_CRITICAL on this host. That is not a clean bill of health — it means we did not observe that specific failure mode.',
    recompute_yourself: d.recompute,
    dossier: `${BASE}/n/${h}`,
    census_captured: d.captured,
  };
}

async function listFindings() {
  const feed = await new Promise((resolve, reject) => {
    const req = https.get(BASE + '/feed.xml', { timeout: 15000, headers: { 'user-agent': UA } }, (res) => {
      let b = ''; res.on('data', (c) => { if (b.length < 4000000) b += c; });
      res.on('end', () => (res.statusCode >= 400 ? reject(new Error('feed HTTP ' + res.statusCode)) : resolve(b)));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('feed timed out')); });
    req.on('error', reject);
  });
  const entries = [...feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => {
    const b = m[1];
    const pick = (tag) => { const x = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return x ? x[1].trim() : null; };
    const link = b.match(/href="([^"]+)"/);
    return { title: pick('title'), observed: pick('updated'), dossier: link ? link[1] : null, detail: pick('summary') };
  });
  return {
    findings: entries.length, as_of: entries.length ? entries[0].observed : null,
    what_this_is: 'Operators whose advertised tool set changed while the version string they serve did not. An observation about change, not an accusation.',
    entries,
    feed: `${BASE}/feed.xml`,
  };
}

async function compareServers({ hosts }) {
  if (!Array.isArray(hosts) || !hosts.length) throw new Error('hosts must be a non-empty array of hostnames');
  if (hosts.length > 10) throw new Error('compare at most 10 hosts per call');
  const out = [];
  for (const h of hosts) {
    try { out.push(await checkServer({ host: h })); }
    catch (e) { out.push({ host: String(h), rated: null, error: e.message, note: 'LOOKUP FAILED — this is a failure of our check, not a finding about this host' }); }
  }
  return {
    compared: out.length,
    rated: out.filter((x) => x.rated === true).length,
    not_rated: out.filter((x) => x.rated === false).length,
    lookup_failed: out.filter((x) => x.rated === null).length,
    with_open_finding: out.filter((x) => x.finding).length,
    in_a_template_fleet: out.filter((x) => x.fleet && x.fleet.template_family_size > 1).length,
    results: out,
  };
}

const TOOLS = [
  {
    name: 'check_mcp_server',
    description: 'Before installing or trusting an MCP server, check it. Returns an outside-in trust rating for that host from a public census of 7,000+ MCP operators refreshed every 6 hours: percentile grade, rank, five scored dimensions, whether it advertises a machine-payable rail, how many other servers its publisher mass-published and whether it shares a boilerplate tool set with a template fleet, and — critically — any DATED finding that its advertised tool set changed while the version string it serves did not. An unrated host is reported as NOT_RATED with an explicit warning that unobserved is not attested safe. Nothing here is self-reported by the operator and every figure is independently recomputable.',
    inputSchema: { type: 'object', properties: { host: { type: 'string', description: 'Hostname, endpoint URL, or registry name — e.g. api.mcp.ai, https://api.mcp.ai/mcp' } }, required: ['host'] },
  },
  {
    name: 'list_tool_surface_findings',
    description: 'List every MCP operator currently carrying a dated tool-surface finding — a case where the advertised tool set grew while the served version string stayed identical, meaning clients that pinned that version were never asked to re-approve what it now exposes. Includes when each was first observed and a link to free redacted evidence.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'compare_mcp_servers',
    description: 'Compare up to 10 candidate MCP servers side by side on rating, rank, rail position and open findings — for choosing between alternatives that do the same job. A host we failed to look up is reported as a lookup failure, never as a clean result.',
    inputSchema: { type: 'object', properties: { hosts: { type: 'array', items: { type: 'string' }, description: 'Hostnames to compare (max 10)' } }, required: ['hosts'] },
  },
];

async function callTool(name, args) {
  if (name === 'check_mcp_server') return checkServer(args || {});
  if (name === 'list_tool_surface_findings') return listFindings();
  if (name === 'compare_mcp_servers') return compareServers(args || {});
  throw new Error(`unknown tool: ${name}`);
}

module.exports = { TOOLS, callTool, checkServer, listFindings, compareServers, normalizeHost, shapeFleet, BASE };
