# Ownly MCP Guide

Ownly MCP lets Codex, Claude Code, and compatible local MCP clients read and maintain the same validated Markdown used by Ownly Web/PWA, Obsidian, and the Agent CLI. It is a local `stdio` adapter, not a hosted database.

## Data-root resolution

The configured location may be either:

```text
<selected parent>/
  Ownly/                 ← default data-folder name
    Objects/
    Snapshots/
    Reviews/
    Logs/
```

or a custom data root:

```text
<selected custom root>/
  Objects/               ← presence of this directory identifies the root
  Snapshots/
  Reviews/
  Logs/
```

Therefore both `--data-dir D:\Documents\MyVault` (default `Ownly`) and `--data-dir D:\Data\MyOwnlyLedger` (custom root) are valid. Do not pass `Objects/` itself.

## Install and run

Read-only, which is the default:

```bash
npx -y @ownly-app/mcp --data-dir /path/to/vault-or-data-root
```

For a source checkout:

```bash
npm ci
npm run build --prefix packages/mcp
node packages/mcp/dist/index.js --data-dir /path/to/vault-or-data-root
```

Equivalent environment configuration:

```bash
OWNLY_DATA_DIR=/path/to/vault-or-data-root node packages/mcp/dist/index.js
```

## Connect to Codex

```bash
codex mcp add ownly -- npx -y @ownly-app/mcp --data-dir /path/to/vault-or-data-root
codex mcp list
```

Equivalent Codex configuration:

```toml
[mcp_servers.ownly]
command = "npx"
args = ["-y", "@ownly-app/mcp", "--data-dir", "/path/to/vault-or-data-root"]
```

For a local source build, use `node` as the command and the absolute path to `packages/mcp/dist/index.js` as the first argument.

## Connect to Claude Code

```bash
claude mcp add --transport stdio --scope user ownly -- \
  npx -y @ownly-app/mcp --data-dir /path/to/vault-or-data-root
claude mcp list
```

## Read tools

| Tool | Purpose |
|---|---|
| `ownly_summary` | Dataset and health overview |
| `ownly_search` | Search objects by title, category, or note text |
| `ownly_get_object` | Read bounded facts for one stable object ID |
| `ownly_object_history` | Read an object with reviews and chronological logs |
| `ownly_recurring_costs` | Filter recurring-cost facts |
| `ownly_recurring_due` | List upcoming renewals within 0–365 days |
| `ownly_recurring_by_account` | Group by payment account without mixing currencies |
| `ownly_review_needed` | List records needing lifecycle review |
| `ownly_doctor` | Run read-only integrity checks |
| `ownly_planner_summary` | Trips overview with reusable-place, Visit-occurrence and expense counts |
| `ownly_planner_get_trip` | Full trip context: reusable places, repeatable visits, budget, conflicts, travel legs, execution timeline, bookings, expenses |
| `ownly_planner_budget_estimate` | Scheduled-day budget converted into the trip base currency |
| `ownly_planner_get_ical_markdown` | Project confirmed Planner/Vault schedule facts into obsidian-ical-plugin-pro Markdown |

## Opt-in write mode

Writes remain disabled unless the server is started with one of:

```bash
ownly-mcp --data-dir /path/to/data --allow-write
OWNLY_MCP_ALLOW_WRITE=1 ownly-mcp --data-dir /path/to/data
```

Enabling write mode does not allow immediate blind writes. Each mutation uses two phases:

```text
ownly_prepare_* → validated before/after preview + expiring operation_id
        ↓ explicit user confirmation
ownly_commit_operation(operation_id)
        ↓
safety backup → conflict check → atomic Markdown write → audit log → Doctor result
```

Prepared operations expire after ten minutes, are held only in the local MCP process, and may be discarded. A commit is idempotent for its operation ID. If the target changed after preparation, commit returns `CONFLICT` instead of overwriting newer content.

Safety backups are written outside the data root in a sibling `Ownly Backups/` directory. Archive operations remain recoverable; the MCP surface provides no permanent-delete tool.

Write tools:

| Tool | Purpose |
|---|---|
| `ownly_prepare_create_object` | Preview a physical, recurring-cost, or experience record |
| `ownly_prepare_update_object` | Preview changes without changing stable ID/type |
| `ownly_prepare_retire_object` | Preview retiring a physical item to `idle` |
| `ownly_prepare_cancel_recurring_cost` | Preview cancellation with date and reason |
| `ownly_prepare_add_object_log` | Preview an append-only evidence log |
| `ownly_prepare_create_review` | Preview an object, exit, monthly, or annual review |
| `ownly_prepare_create_snapshot` | Preview a net-worth snapshot |
| `ownly_prepare_archive_object` | Preview recoverable archive |
| `ownly_prepare_restore_object` | Preview archive restoration |
| `ownly_planner_prepare_add_visit` | Preview adding one occurrence of a reusable place to a day |
| `ownly_planner_prepare_remove_visit` | Preview removing one occurrence while keeping the reusable place and other visits |
| `ownly_planner_prepare_reorder_day` | Preview moving one Visit occurrence ±1 within its day |
| `ownly_planner_prepare_optimize_day_travel_time` | Query an ephemeral ORS matrix, minimize actual travel minutes, keep the first/locked/anchored Visit occurrences fixed, and preview one atomic order + final-leg commit |
| `ownly_planner_prepare_set_stay_span` | Preview hotel stay-span Visit anchors (replaces stale hotel visits on those dates) |
| `ownly_planner_prepare_drop_place` | Preview marking a place dropped |
| `ownly_planner_prepare_add_expense` | Preview appending an AA-ledger expense |
| `ownly_planner_prepare_set_fx_rates` | Preview persisting trip FX-rate overrides |
| `ownly_planner_prepare_apply_schedule_proposal` | Validate and preview an MCP client/LLM schedule proposal without changing locked/anchored Visit occurrences; repeated `place_id` values create separate visits |
| `ownly_planner_prepare_save_ical_markdown` | Preview regenerating the derived iCal Pro Markdown projection from canonical Planner facts |
| `ownly_commit_operation` | Back up and persist a confirmed preview |
| `ownly_discard_operation` | Remove a preview without touching files |

Recommended agent request:

> Add this subscription to Ownly. Show me the exact preview and wait for my confirmation before committing it.

## CLI and MCP roles

The Agent CLI remains the deterministic automation and recovery foundation. MCP adds tool discovery, bounded reads, agent-friendly schemas, and interactive two-phase confirmation. Both use the same data model, atomic Markdown storage, archive behavior, backup format, and audit log; MCP does not create a second database.

Use CLI for scripts, bulk work, migrations, and explicit terminal pipelines. Use MCP for conversational inspection and small confirmed maintenance actions.

## Privacy and sync boundary

The canonical Markdown remains in the user-controlled local data folder. A selected MCP result can enter the external agent's context under that provider's terms. Ownly does not upload a hosted mirror, send MCP analytics, or continuously index the folder.

If the selected local folder is synchronized by OneDrive, Dropbox, Google Drive, iCloud, Syncthing, Git, or another provider, that provider—not MCP—performs cloud synchronization. To reduce conflicts:

- keep the folder available offline;
- use one sync mechanism per data root;
- let sync finish before committing a prepared mutation;
- prepare again if MCP reports `CONFLICT`;
- do not use Git to publish personal Vault contents to a public repository.

## Errors

In addition to read/configuration errors, write mode returns stable codes:

- `WRITE_DISABLED` — server was not started with write permission;
- `OPERATION_NOT_FOUND` — unknown/discarded operation ID;
- `OPERATION_EXPIRED` — preview confirmation window elapsed;
- `CONFLICT` — target changed since preview;
- `INVALID_INPUT` — lifecycle or schema validation failed.

Tool errors do not include stack traces or arbitrary filesystem contents.

## Validation

```bash
npm run test:mcp
npm run build --prefix packages/mcp
node packages/mcp/dist/index.js --help
(cd packages/mcp && npm pack --dry-run)
```
