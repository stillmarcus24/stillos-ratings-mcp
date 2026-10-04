#!/usr/bin/env node
'use strict';
/*
 * Entry point. `stillos-ratings-mcp mcp` runs the stdio MCP server (how a client starts
 * it); with no args, or with a hostname, it runs as a plain CLI so a human can get the
 * same answer without an MCP client at all.
 *
 * The stdio server is required LAZILY and only in mcp mode — requiring it eagerly would
 * attach stdin listeners during a CLI run and hang the process.
 */
const mode = process.argv[2];

if (mode === 'mcp') {
  require('./mcp.cjs');
} else if (mode === '--help' || mode === '-h') {
  console.log(`stillos-ratings-mcp — check an MCP server before you install it

  stillos-ratings-mcp mcp                 run as an MCP stdio server
  stillos-ratings-mcp check <host>        rate one host
  stillos-ratings-mcp findings            list every open tool-surface finding
  stillos-ratings-mcp compare <h1> <h2>   compare candidates

Free, no key, no signup. Data: https://stillosdigitalholdings.com/ratings
An unrated host is reported NOT RATED — unobserved is not attested safe.`);
} else {
  const { checkServer, listFindings, compareServers } = require('./index.cjs');
  (async () => {
    try {
      let out;
      if (mode === 'findings') out = await listFindings();
      else if (mode === 'compare') out = await compareServers({ hosts: process.argv.slice(3) });
      else out = await checkServer({ host: mode === 'check' ? process.argv[3] : mode });
      console.log(JSON.stringify(out, null, 2));
    } catch (e) {
      // Exit non-zero on failure. A safety check that fails silently with status 0 is
      // worse than one that is absent, because a script will treat it as a pass.
      console.error('error: ' + e.message);
      process.exit(1);
    }
  })();
}
