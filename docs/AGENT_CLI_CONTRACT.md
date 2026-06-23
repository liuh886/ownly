# Agent CLI Contract

Ownly's CLI provides a stable JSON read surface for AI agents. All read commands with `--json` produce deterministic, typed output.

## Setup

```bash
export OWNLY_VAULT=/path/to/vault
npm run --silent wyqd -- object list --json
```

The CLI exits `0` on success and non-zero on error. Errors write to stderr as `{ "error": "message", "code": "ERROR_CODE" }`.

## Read Commands

### `object list --json`

Returns all objects. Each object includes type-specific cost fields.

```json
[
  {
    "id": "obj_20260623_123",
    "title": "Sony A7C",
    "object_type": "physical",
    "status": "using",
    "category": "Camera",
    "fileName": "2026-05-01--sony-a7c.md",
    "created_at": "2026-05-01",
    "updated_at": "2026-06-15",
    "review_ref": null,
    "has_review": false,
    "needs_review": false,
    "purchase_price": 12000,
    "total_acquisition_cost": 13200,
    "purchased_at": "2026-05-01"
  }
]
```

### `object get --id <id> [--json]`

Returns a single object. Same shape as list items.

### `object search --query <text> [--json]`

Full-text search across title, category, and body. Returns array of matching objects (same shape as list).

### `object review-needed [--json]`

Objects that need review: idle/transferred/discarded physical, cancelled recurring, completed (unreviewed) experiences.

### `object history --id <id> [--json]`

```json
{
  "object": { /* standard object row */ },
  "reviews": [
    {
      "id": "review_20260615_456",
      "title": "复盘 Sony A7C",
      "review_type": "exit_record",
      "reviewed_at": "2026-06-15",
      "summary": "Great camera...",
      "food_score": null,
      "scenery_score": null,
      "experience_score": 85,
      "fileName": "2026-06-15--review-sony-a7c.md"
    }
  ]
}
```

### `recurring list --active --json`

Active recurring costs only. Same object row shape.

### `summary --json`

```json
{
  "total_objects": 25,
  "physical": 12,
  "active_recurring_costs": 5,
  "travel_experiences": 3,
  "needs_review_count": 2,
  "data_folder": "/vault/Ownly/Objects"
}
```

## Stable Fields

Every object row includes these fields regardless of type:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique object ID |
| `title` | string | Display name |
| `object_type` | string | `physical`, `recurring_cost`, or `one_time_experience` |
| `status` | string | Lifecycle status |
| `category` | string? | User-assigned category |
| `fileName` | string | Markdown file name in vault |
| `created_at` | string | ISO date |
| `updated_at` | string? | ISO date |
| `review_ref` | string? | ID of linked review, or null |
| `has_review` | boolean | Whether a review exists for this object |
| `needs_review` | boolean | Whether this object should be reviewed |

Type-specific fields appear only when applicable (e.g. `purchase_price` on physical, `billing_amount` on recurring_cost, `budget_total` on one_time_experience).

## Write Commands

## Write Commands

All write commands accept `--json` for standardized output. They return the full `AgentObjectRow` shape (same as read commands) after persisting to disk.

### `object add --json`

Create a new object. Required: `--title`, `--amount`. Optional: `--object-type` (default `physical`), `--category`, `--purchased-at`, `--ended-at`, `--billing-cycle`, `--billing-day`, `--payment-account`, `--status`.

Returns: full `AgentObjectRow`.

### `object update --id <id> --json`

Update fields on an existing object. Returns: full `AgentObjectRow` with updated fields.

### `object retire --id <id> --json`

Set a physical object to `status: idle`. Returns: full `AgentObjectRow`.

### `object cancel --id <id> --json`

Cancel a recurring cost. Only works on `recurring_cost` objects. Returns: full `AgentObjectRow`.

### `object delete --id <id> --yes --json`

Archive an object. Returns: `{ archived: true, archiveFileName, object: AgentObjectRow }`.

### `object restore --id <id> --json`

Restore from archive. Returns: `{ restored: true, object: AgentObjectRow }`.

### `object link --object_id <id> --review_id <id> --json`

Explicitly link an object and review bidirectionally. Sets `object.review_ref` and `review.target_id`. Rejects conflicting links unless `--force` is provided.

Returns: `{ linked: true, object: AgentObjectRow, review: { id, title, review_type, target_id, fileName } }`.

### `object batch-review-needed --json`

Mark all objects needing review (sets `review_ref` if a review already targets the object). Does not overwrite lifecycle status.

Returns: `{ processed: number, updated: AgentObjectRow[], skipped: number, items: AgentObjectRow[] }`.

## Error Format

```json
{ "error": "Object not found: abc123", "code": "NOT_FOUND" }
```

Error codes: `MISSING_OPTION`, `NOT_FOUND`, `INVALID_INPUT`, `VAULT_NOT_FOUND`.
