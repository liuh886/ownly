# Ownly MCP

Ownly MCP is a **read-only local MCP server** for Ownly ownership, recurring-cost and evidence data.

It runs as a local `stdio` process. The canonical Ownly Markdown stays in the user-controlled local data folder; the MCP server reads only the local records needed for each tool call and returns bounded structured facts to the connected MCP client.

## Requirements

- Node.js 20 or newer.
- An existing Ownly data location containing an `Ownly/` folder.
- An MCP client that supports local `stdio` servers, such as Codex or Claude Code.

## Configuration

Ownly MCP accepts exactly one current data-location contract:

```bash
ownly-mcp --data-dir /path/to/location-containing-Ownly
```

or:

```bash
OWNLY_DATA_DIR=/path/to/location-containing-Ownly ownly-mcp
```

The path is the directory **containing** `Ownly/`, not `Ownly/Objects` itself.

The server fails closed when the location is missing, unreadable or not an Ownly data location.

## Public package

The package manifest is prepared as `@ownly/mcp`. After the first package release, the intended direct launch is:

```bash
npx -y @ownly/mcp --data-dir /path/to/location-containing-Ownly
```

Until that package release exists, build and run the package from an Ownly source checkout:

```bash
npm ci
npm install --prefix packages/mcp --ignore-scripts --no-audit --no-fund
npm run build --prefix packages/mcp
node packages/mcp/dist/index.js --data-dir /path/to/location-containing-Ownly
```

The source checkout is only a development/distribution step. The MCP runtime still reads the user's normal local Ownly data folder and does not create a second database.

## Tools

Ownly MCP v0.1 exposes nine read-only tools:

- `ownly_summary`
- `ownly_search`
- `ownly_get_object`
- `ownly_object_history`
- `ownly_recurring_costs`
- `ownly_recurring_due`
- `ownly_recurring_by_account`
- `ownly_review_needed`
- `ownly_doctor`

Every tool is annotated as read-only and non-destructive.

The MCP layer does not expose create, update, cancel, archive, restore or delete operations in v0.1.

## Privacy boundary

The precise privacy claim is:

> **The Ownly source-of-truth stays local. Only facts requested through an agent session are returned to that MCP client.**

Ownly MCP does not:

- upload the whole data folder to an Ownly service;
- run a hosted Ownly database;
- send MCP telemetry to GA4 or Cloudflare;
- return local absolute paths as normal tool data;
- return whole Markdown bodies when structured fields are sufficient;
- continuously index or scan the data folder in the background.

A fact returned to Codex, Claude Code or another MCP client may become part of that client's/model's context. Do not interpret local source-of-truth as a claim that no selected facts can ever leave the device during an external agent session.

## Currency safety

`ownly_recurring_by_account` keeps monetary totals separated by currency. Ownly MCP never silently adds USD, CNY, EUR or other currencies into one synthetic monthly total.

## Development

From the repository root:

```bash
npm run test:mcp
npm install --prefix packages/mcp --ignore-scripts --no-audit --no-fund
npm run build --prefix packages/mcp
npm pack --prefix packages/mcp --dry-run
```

See [`../../docs/MCP.md`](../../docs/MCP.md) for Codex and Claude Code setup, example prompts, architecture and troubleshooting.
