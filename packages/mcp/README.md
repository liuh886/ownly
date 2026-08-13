# Ownly MCP

Ownly MCP is a local-first MCP server for Ownly ownership, recurring-cost, review, and history data. It reads the canonical Markdown directly and can perform explicitly enabled, two-phase writes with a safety backup.

## Data location

`--data-dir` and `OWNLY_DATA_DIR` accept either:

- a parent directory containing the default `Ownly/` data folder; or
- a custom Ownly data root containing `Objects/` directly.

```bash
ownly-mcp --data-dir /path/to/vault
ownly-mcp --data-dir /path/to/custom-data-root
```

The server fails closed when the location is missing, unreadable, or invalid.

## Modes

Read-only is the default:

```bash
npx -y @ownly-app/mcp --data-dir /path/to/vault
```

Enable persistent mutations explicitly:

```bash
npx -y @ownly-app/mcp --data-dir /path/to/vault --allow-write
```

or set `OWNLY_MCP_ALLOW_WRITE=1`.

Every mutation has two phases:

1. Call an `ownly_prepare_*` tool and inspect its `before` / `after` preview.
2. After user confirmation, pass its short-lived `operation_id` to `ownly_commit_operation`.

Commit creates a full Ownly backup in the sibling `Ownly Backups/` directory before changing data. It rejects stale previews if the target file changed and is idempotent when the same operation ID is retried.

## Tools

Read tools:

- `ownly_summary`, `ownly_search`, `ownly_get_object`, `ownly_object_history`
- `ownly_recurring_costs`, `ownly_recurring_due`, `ownly_recurring_by_account`
- `ownly_review_needed`, `ownly_doctor`

Write workflow tools:

- `ownly_prepare_create_object`, `ownly_prepare_update_object`
- `ownly_prepare_retire_object`, `ownly_prepare_cancel_recurring_cost`
- `ownly_prepare_add_object_log`, `ownly_prepare_create_review`
- `ownly_prepare_create_snapshot`
- `ownly_prepare_archive_object`, `ownly_prepare_restore_object`
- `ownly_commit_operation`, `ownly_discard_operation`

## Privacy boundary

The Ownly source-of-truth stays in the user-controlled local folder. Only facts returned by a requested tool enter the connected MCP client context. Ownly MCP does not create a hosted mirror or send analytics, file paths, or background indexes to Ownly services.

## Development

```bash
npm ci
npm run test:mcp
npm run build --prefix packages/mcp
node packages/mcp/dist/index.js --help
(cd packages/mcp && npm pack --dry-run)
```

See [`../../docs/MCP.md`](../../docs/MCP.md) for setup, safety semantics, and examples.
