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

Write commands (`add`, `update`, `retire`, `cancel`, `delete`, `restore`) always output JSON with at minimum `{ id, title }`. These are documented in `AGENT_CLI_GUIDE.md`.

## Error Format

```json
{ "error": "Object not found: abc123", "code": "NOT_FOUND" }
```

Error codes: `MISSING_OPTION`, `NOT_FOUND`, `INVALID_INPUT`, `VAULT_NOT_FOUND`.
