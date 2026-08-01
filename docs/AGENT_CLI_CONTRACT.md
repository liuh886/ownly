# Agent CLI Contract

Ownly's Agent CLI is a deterministic, strictly typed read/write surface over the local Markdown data model. It is designed for scripts and external agents that need fact-ready data without scraping the UI.

The CLI does not provide AI chat, model calls, embeddings, natural-language interpretation, or generated recommendations.

## Setup

Pass a local location containing the `Ownly/` data folder:

```bash
export OWNLY_VAULT=/path/to/local/location
npm run --silent wyqd -- object list --json
```

Or pass the compatibility flag explicitly:

```bash
npm run --silent wyqd -- --vault /path/to/local/location object list --json
```

`OWNLY_VAULT`, `WYQD_VAULT`, and `--vault` remain backward-compatible names. The path may be an Obsidian Vault or another local directory containing `Ownly/`.

## Process contract

- Success exits with code `0`.
- Failure exits non-zero.
- JSON success output is written to stdout.
- With `--json`, errors are written to stderr as:

```json
{
  "error": "Missing required option --title",
  "code": "MISSING_OPTION"
}
```

- Human-readable output remains available when `--json` is omitted.
- Markdown writes use validated, atomic file replacement.
- New, archived, and restored records use collision-safe filenames and do not silently overwrite valid files.

## Stable object row

Commands that return object facts use the exported `AgentObjectRow` contract.

```json
{
  "id": "obj_20260801_1234567890",
  "title": "Sony A7C",
  "object_type": "physical",
  "status": "using",
  "category": "Camera",
  "fileName": "2026-08-01--sony-a7c.md",
  "created_at": "2026-08-01",
  "updated_at": "2026-08-01",
  "review_ref": null,
  "has_review": false,
  "needs_review": false,
  "purchase_price": 12000,
  "total_acquisition_cost": 12000,
  "purchased_at": "2026-08-01"
}
```

Stable fields:

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Unique entity ID |
| `title` | string | Display title |
| `object_type` | string | `physical`, `recurring_cost`, or `one_time_experience` |
| `status` | string | Type-specific lifecycle status |
| `category` | string, optional | User category |
| `fileName` | string | Source Markdown filename |
| `created_at` | string | ISO date |
| `updated_at` | string, optional | ISO date |
| `review_ref` | string or null | Linked review ID |
| `has_review` | boolean | Whether a linked or targeting review exists |
| `needs_review` | boolean | Deterministic review-needed rule result |

Type-specific fields appear only when applicable:

- physical: purchase/acquisition/sale price and lifecycle dates;
- recurring cost: billing amount/cycle, annualized cost, payment account, start date;
- one-time experience: budget, actual cost, subtype, end date, and compact location facts.

## Object read commands

### `object list [--status <status>] --json`

Returns `AgentObjectRow[]`.

### `object get --id <id> --json`

Returns one `AgentObjectRow`.

### `object search --query <text> --json`

Searches title, category, and Markdown body. Returns `AgentObjectRow[]`.

### `object review-needed --json`

Returns objects that deterministically require review:

- physical: `idle`, `transferred`, or `discarded`;
- recurring cost: `cancelled`;
- one-time experience: `completed` without a review.

### `object history --id <id> --json`

Returns the object, targeting reviews, and chronological object experience logs.

### `object due [--days 30] --json`

Returns active recurring costs with a calculable billing date inside the requested horizon.

### `object accounts --json`

Groups active recurring costs by payment account and reports monthly cost facts.

### `recurring list [--active] --json`

Returns recurring-cost object rows. `--active` limits results to active records.

### `summary --json`

```json
{
  "total_objects": 25,
  "physical": 12,
  "active_recurring_costs": 5,
  "travel_experiences": 3,
  "needs_review_count": 2,
  "data_folder": "/local/location/Ownly/Objects"
}
```

## Object write commands

### `object add`

```bash
npm run --silent wyqd -- --vault <path> object add \
  --title "Sony A7C" \
  --amount 12000 \
  --object-type physical \
  --category Camera \
  --json
```

Required: `--title`, `--amount`.

Supported object types:

- `physical` (default)
- `recurring_cost`
- `one_time_experience`

Returns a full `AgentObjectRow` with `--json`.

### `object update --id <id> [options] --json`

Updates validated fields and returns the reloaded `AgentObjectRow`.

### `object retire --id <id> [--ended-at YYYY-MM-DD] --json`

Physical objects only. Sets status to `idle`.

### `object cancel --id <id> [--reason <text>] --json`

Recurring costs only. Sets status to `cancelled`.

### `object delete --id <id> --yes --json`

Performs a recoverable archive, not permanent deletion.

```json
{
  "archived": true,
  "archiveFileName": "2026-08-01T12-34-56-789Z--2026-08-01--sony-a7c.md",
  "object": {}
}
```

### `object restore --id <id> --json`

Restores an archived object. Active filename collisions are resolved without overwrite.

### `object link --object-id <id> --review-id <id> [--force] --json`

Links `object.review_ref` and `review.target_id`. Conflicting links are rejected unless `--force` is explicit.

Underscore forms such as `--object_id` remain accepted for compatibility.

### `object batch-review-needed --json`

Processes review-needed objects without changing their lifecycle status. It only fills `review_ref` when an existing review already targets the object.

## Object experience logs

### `object log add`

```bash
npm run --silent wyqd -- --vault <path> object log add \
  --id <object-id> \
  --type usage \
  --summary "Used throughout a weekend trip" \
  --lesson "Compact size matters" \
  --json
```

Allowed event types:

- `usage`
- `issue`
- `maintenance`
- `regret`
- `lesson`
- `comparison`
- `exit_note`

The target object must exist.

### `object log list --id <object-id> --json`

Returns logs ordered by `occurred_at`, then `created_at`.

## Snapshot commands

Supported commands:

- `snapshot list [--json]`
- `snapshot get --id <id>`
- `snapshot add --assets <number> [--liabilities <number>] [--date YYYY-MM-DD]`
- `snapshot update --id <id> [--assets <number>] [--liabilities <number>]`
- `snapshot delete --id <id> --yes`
- `snapshot restore --id <id>`

Delete is recoverable archive behavior.

## Review commands

Supported commands:

- `review list [--json]`
- `review get --id <id>`
- `review add --summary <text> [--review-type monthly] [--target-id <id>]`
- `review update --id <id> [options]`
- `review delete --id <id> --yes`
- `review restore --id <id>`

`object_review` and `exit_record` require `--target-id` when created.

## Doctor

```bash
npm run --silent wyqd -- --vault <path> doctor --json
```

Doctor validates:

- entity schemas;
- duplicate IDs across supported entity types;
- object-log target references.

Doctor is deterministic data validation, not an AI feature.

## Error codes

| Code | Meaning |
|---|---|
| `MISSING_OPTION` | Required flag, selector, or confirmation is missing |
| `NOT_FOUND` | Requested active or archived entity was not found |
| `INVALID_INPUT` | Invalid type, status, number, lifecycle operation, or schema |
| `VAULT_NOT_FOUND` | No local data location was supplied through compatibility path options |
| `IO_ERROR` | Local file read/write/remove operation failed |

## Type and test guarantees

- CLI code compiles under repository-wide `strict: true` TypeScript.
- No `@ts-nocheck` or CLI type suppression is used.
- Domain schemas are imported from the shared Ownly model.
- YAML and argv values enter as untrusted data and are narrowed or validated.
- `npm run test:cli` executes the real CLI in child processes against disposable Ownly folders.
- The full `npm run validate` gate includes CLI process tests.
