# Ownly MCP Guide

Ownly MCP lets local MCP clients query the same validated Ownly evidence used by the Web/PWA, Obsidian runtime and Agent CLI.

It is intentionally a **read-only local adapter**, not a cloud service and not a second Ownly database.

## 1. Mental model

```text
Ownly data folder (Markdown + YAML)
        ↓ local filesystem reads
Ownly MCP server (local stdio process)
        ↓ MCP tool results
Codex / Claude Code / compatible client
        ↓
model reasoning and user-facing answer
```

The MCP client starts `ownly-mcp` as a local subprocess. Users do not need to keep a separate server window running.

The configured path must be the directory containing the canonical `Ownly/` folder:

```text
Documents/
  Ownly/
    Objects/
    Snapshots/
    Reviews/
    Logs/
```

For this example, configure `/Users/me/Documents`, not `/Users/me/Documents/Ownly/Objects`.

## 2. Current scope

Ownly MCP v0.1 is read-only.

Available tools:

| Tool | Purpose |
|---|---|
| `ownly_summary` | Compact dataset and health overview |
| `ownly_search` | Search validated objects by title, category or local note text |
| `ownly_get_object` | Get bounded structured facts for one stable object ID |
| `ownly_object_history` | Get object facts plus linked reviews and chronological experience logs |
| `ownly_recurring_costs` | List recurring-cost facts with optional active/category/account filters |
| `ownly_recurring_due` | List calculable upcoming renewals within 0–365 days |
| `ownly_recurring_by_account` | Group active recurring costs by payment account, keeping currencies separate |
| `ownly_review_needed` | List records that deterministically need review |
| `ownly_doctor` | Run read-only schema, duplicate-ID and reference checks |

Not available in v0.1:

- creating records;
- changing prices or billing data;
- cancelling subscriptions;
- archiving or restoring records;
- deleting records;
- changing reviews, snapshots or experience logs.

Those mutations remain outside the MCP contract until a separate explicit permission and confirmation model is designed.

## 3. Install / run

The publish-ready package is located at `packages/mcp` and is named `@ownly/mcp`.

After the first package release, the intended command is:

```bash
npx -y @ownly/mcp --data-dir /Users/me/Documents
```

For a source checkout before the first package release:

```bash
git clone https://github.com/liuh886/ownly.git
cd ownly
npm ci
npm install --prefix packages/mcp --ignore-scripts --no-audit --no-fund
npm run build --prefix packages/mcp
node packages/mcp/dist/index.js --data-dir /Users/me/Documents
```

The equivalent environment-variable form is:

```bash
OWNLY_DATA_DIR=/Users/me/Documents node packages/mcp/dist/index.js
```

There are no legacy MCP path aliases. Use `OWNLY_DATA_DIR` or `--data-dir`.

## 4. Connect to Codex

Codex supports local STDIO MCP servers that are started by a command.

After `@ownly/mcp` is published:

```bash
codex mcp add ownly -- npx -y @ownly/mcp --data-dir /Users/me/Documents
```

Verify:

```bash
codex mcp list
```

Inside the Codex terminal UI, `/mcp` shows connected servers.

Equivalent `~/.codex/config.toml` configuration:

```toml
[mcp_servers.ownly]
command = "npx"
args = ["-y", "@ownly/mcp", "--data-dir", "/Users/me/Documents"]
```

Or keep the local path in an environment variable passed to the server:

```toml
[mcp_servers.ownly]
command = "npx"
args = ["-y", "@ownly/mcp"]

[mcp_servers.ownly.env]
OWNLY_DATA_DIR = "/Users/me/Documents"
```

Codex's local ChatGPT desktop app, CLI and IDE extension use the same Codex MCP configuration. ChatGPT web is a hosted surface and does not read the user's local Codex configuration file, so a local Ownly `stdio` server is not automatically available in a normal web chat.

For source-checkout testing, replace the `npx` command with the built local executable:

```toml
[mcp_servers.ownly]
command = "node"
args = ["/absolute/path/to/ownly/packages/mcp/dist/index.js", "--data-dir", "/Users/me/Documents"]
```

## 5. Connect to Claude Code

Claude Code supports local STDIO MCP servers as local subprocesses.

After `@ownly/mcp` is published:

```bash
claude mcp add --transport stdio --scope user ownly -- \
  npx -y @ownly/mcp --data-dir /Users/me/Documents
```

Verify:

```bash
claude mcp list
```

Inside Claude Code, `/mcp` shows server status and exposed tool count.

For source-checkout testing:

```bash
claude mcp add --transport stdio --scope user ownly -- \
  node /absolute/path/to/ownly/packages/mcp/dist/index.js \
  --data-dir /Users/me/Documents
```

Use `--scope user` for Ownly because it is a personal evidence store that should normally be available across the user's local projects rather than committed into one repository's `.mcp.json`.

## 6. Example prompts

### Subscription renewals

> Which subscriptions renew in the next 30 days? Use Ownly rather than guessing from memory.

Expected evidence path:

```text
ownly_recurring_due(days=30)
  → renewal facts
  → agent answer
```

### Annual software cost

> Show my active software subscriptions and annualized cost. Do not add different currencies together.

Expected evidence path:

```text
ownly_recurring_costs(active_only=true)
  → structured billing facts
  → grouping/calculation by the agent
```

### Evidence-grounded review

> Which subscriptions look worth reviewing first? Separate recorded Ownly facts from your recommendation.

Expected evidence path:

```text
ownly_recurring_costs
  → selected ownly_object_history calls
  → cost + review + usage/issue evidence
  → explicit agent inference
```

Ownly MCP itself does not contain a hidden recommendation model.

### Why did I cancel this?

> Why did I cancel Adobe? Use my Ownly history and tell me what is recorded versus inferred.

Expected evidence path:

```text
ownly_search(query="Adobe")
  → stable object ID
  → ownly_object_history(id=...)
  → recorded cancellation/review/log evidence
```

### Validate before analysis

> Check my Ownly data health first. Only analyze my subscriptions if the dataset is valid enough to use.

Expected path:

```text
ownly_doctor
  → if acceptable: ownly_recurring_costs
  → analysis
```

## 7. Privacy boundary

The correct promise is:

> **The Ownly source-of-truth stays local. Only facts requested through an agent session are returned to that MCP client.**

This means:

- the canonical Markdown files remain in the user-controlled Ownly data folder;
- Ownly does not create a hosted mirror just to support MCP;
- the MCP process reads records on demand;
- no MCP telemetry is sent to Ownly, GA4 or Cloudflare;
- normal tool results omit local absolute filesystem paths;
- normal tools return structured facts instead of dumping entire Markdown documents;
- there is no background upload/index job.

It does **not** mean that a fact selected by an MCP tool can never reach the external model provider. Tool results returned to Codex, Claude Code or another client can become part of that agent session's model context under that provider's own data-handling terms.

## 8. Evidence semantics

Ownly MCP is designed to make the distinction between evidence and reasoning explicit:

```text
Ownly recorded facts
  → MCP structured result
  → external agent interpretation
```

A tool can report:

- billing amount and cycle;
- annualized cost already recorded by Ownly;
- payment account;
- lifecycle state;
- review summary;
- regret score;
- usage / issue / maintenance / lesson logs;
- cancellation reason;
- timestamps and evidence source fields.

The agent may then infer that a subscription is poor value, but that recommendation is not silently written back as an Ownly fact.

## 9. Currency rule

Never infer one synthetic cost total across different currencies without an explicit conversion operation outside Ownly MCP.

`ownly_recurring_by_account` therefore returns totals like:

```json
{
  "account": "Visa",
  "monthly_costs": [
    { "currency": "CNY", "monthly_cost": 100 },
    { "currency": "USD", "monthly_cost": 20 }
  ]
}
```

instead of returning a meaningless `120/month` total.

## 10. Failure behavior

Ownly MCP fails with typed, bounded errors for:

- missing data-directory configuration;
- configured path without an Ownly data folder;
- filesystem permission/read failure;
- invalid tool input;
- missing object;
- invalid local record/schema;
- generic local I/O failure.

The MCP runtime should not return stack traces or arbitrary local filesystem contents to the model as normal tool errors.

`ownly_doctor` is also strictly read-only: missing required data directories are reported as integrity errors rather than being created as a side effect of inspection.

## 11. Development and validation

From the repository root:

```bash
npm run test:mcp
npm install --prefix packages/mcp --ignore-scripts --no-audit --no-fund
npm run build --prefix packages/mcp
node packages/mcp/dist/index.js --help
npm pack --prefix packages/mcp --dry-run
```

The MCP CI path is scoped separately so MCP SDK installation/build work runs only when MCP-specific source or package files change. Shared Ownly domain changes still run the lightweight MCP adapter tests so the contract cannot silently drift away from the canonical data model.

## 12. Product onboarding follow-up

Repository documentation is not the final onboarding surface.

The product should expose an **Agent / MCP** help surface that explains, in normal user language:

1. what MCP gives the user;
2. that Ownly data stays as local Markdown;
3. how to select/identify the Ownly data location;
4. how to connect Ownly to Codex;
5. how to connect Ownly to Claude Code;
6. how to verify the connection;
7. several useful example questions;
8. the boundary that selected tool results may enter the external agent's context;
9. that v0.1 MCP is read-only.

This product-facing onboarding remains tracked in GitHub Issue #77 after the MCP runtime implementation lands.
