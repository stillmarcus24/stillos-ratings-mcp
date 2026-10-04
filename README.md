# stillos-ratings-mcp

**Check an MCP server before you install it.**

Installing an MCP server means handing a stranger's code a tool surface inside your
client. There is no standard way to ask "should I?" — this is one. It answers from a
public census of **7,000+ MCP operators**, refreshed every 6 hours, rated from the outside, unasked, the way
a credit bureau rates a borrower rather than the way a badge rates whoever applied for it.

Free. No key, no signup, no account. Every figure is independently recomputable.

```bash
npx stillos-ratings-mcp check api.mcp.ai
npx stillos-ratings-mcp findings
npx stillos-ratings-mcp compare api.mcp.ai some-other-host.com
```

## As an MCP server

```json
{
  "mcpServers": {
    "stillos-ratings": { "command": "npx", "args": ["-y", "stillos-ratings-mcp", "mcp"] }
  }
}
```

### Tools

| Tool | What it answers |
|---|---|
| `check_mcp_server` | Grade, rank, five scored dimensions, rail position, publisher/fleet concentration, and any dated finding for one host |
| `list_tool_surface_findings` | Every operator currently carrying a dated tool-surface finding |
| `compare_mcp_servers` | Up to 10 candidates side by side |

## What a finding actually means

The headline signal is **a tool surface that changed while the version string did not**.

Two anonymous `tools/list` enumerations of the same endpoint, at different times. The
`serverInfo.version` string was byte-identical in both. The tool set was not. Any client
that pinned that version and approved its tool list **was never asked to re-approve what
it now exposes** — and if one of the added tools takes an action (writes, sends, moves
money, deletes), that matters.

This is an **observation about change**. It is not an accusation of malice, and this tool
will never phrase it as one.

## One of a fleet, or one someone built?

The public registry is far more concentrated than it looks. Measured 2026-10-04 across
39,321 registry entries from 23,281 publishers: the **top 10 publishers control 19.0%** of
it, one GitHub account alone publishes **2,365** servers, and **34.8%** of tool-bearing
servers share a boilerplate tool set with a template fleet — while 20,980 publishers have
exactly one server.

So every answer carries a `fleet` block: who publishes it, how many servers that publisher
has, and how many others share its core tool set. A server that is 1 of 1,022 running the
same template is a different proposition from a one-off, and that was the most
decision-relevant fact nobody was reporting.

It is a structural observation about how a server was produced — **not** an accusation of
bad faith, and a large publisher can still ship good software. Where the registry does not
cover a host, the block says concentration was **not measured**, which is deliberately not
the same sentence as "not a fleet".

## What this is not

- **Not an audit.** A grade is percentile standing within the measured population, not a
  security certification. The whole ecosystem scores low on these dimensions today.
- **Not a pass when a host is missing.** An unrated host returns `NOT_RATED` with an
  explicit warning. We enumerate **41.8%** of the distinct remote-declaring hosts in the
  public registry (measured, as of 2026-10-04) — so absence is a statement about our reach,
  **not** about that operator. **Unobserved is not attested safe.**
- **Not a clean bill of health when there is no finding.** It means we did not observe
  that specific failure mode on that host.
- **Not self-reported.** No operator supplies its own numbers, and no operator can change
  its grade by asking us.

## Disputing a number

Recompute it. The board is sealed and public, the method is published in full, and the
dimensions are arithmetic over a public census — so there is no judgement call to argue
with and no appeal to make to us.

- Method: <https://stillosdigitalholdings.com/ratings/methodology>
- Any operator's record: `https://stillosdigitalholdings.com/ratings/n/<host>`
- Verify a receipt: `https://stillosdigitalholdings.com/notary/verify?hash=<receipt_hash>` —
  every `check_mcp_server` answer carries the `receipt_hash` and a ready-made link in its
  `recompute` block ([live example](https://stillosdigitalholdings.com/notary/verify?hash=d5719ec4abc4ef610568da3db48f4beddda839e84b8caea16613ad4185a3fbfa)).
  Scope is integrity and timestamp only — it proves the board you are reading is the board
  that was sealed, not that any rating is "correct".

## Data source

`GET https://stillosdigitalholdings.com/ratings/node?host=<host>` — free and unmetered.
This package is a thin client over that endpoint, holds no credential, and can therefore
leak none. Every answer it gives can be reproduced with `curl`.

MIT · Still OS Digital Holdings LLC, Wyoming
