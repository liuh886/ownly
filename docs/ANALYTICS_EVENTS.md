# Ownly Analytics Event Dictionary

Governance: Gate 3 of `docs/PRODUCT_GOVERNANCE.md` (issue #48).
Enforcement: `src/lib/analytics.ts` (runtime allowlist) +
`scripts/validate-analytics.mjs` (static guard, runs in `validate:fast`).

## Allowed events (aggregate only)

| Event | Params | Fires when |
|---|---|---|
| `onboarding_opened` | — | Onboarding surfaces (first-run or after disconnect) |
| `local_data_connected` | `action: create \| connect` | Data folder created or connected |
| `demo_started` | `surface: web` | User enters demo mode |
| `first_object_saved` | `source: import` | First real object saved (import success with created > 0). First-ever only |
| `object_archived` | — | A place is shelved/dropped. First-ever only |
| `object_restored` | — | A shelved place is restored. First-ever only |
| `backup_exported` | `files: number` | Backup file exported. First-ever only |
| `backup_validated` | — | An imported backup validates. First-ever only |
| `pwa_installed` | — | `appinstalled` fires |
| `app_return` | `gap: 1d \| 7d \| 30d \| 90d+` | Returning visit; gap bucket computed locally from last-visit date |

First-ever semantics are enforced with a `localStorage` flag (`ownly_ev_*`)
that never leaves the device.

## Prohibited (never collected)

Object titles, Markdown, filenames, local paths, amounts, dates, form
values, backup contents or inventory, selected-folder metadata, Obsidian
vault names, stable identifiers derived from local data (`collectionId`,
`placeId`, workspace UUIDs, …), provider names inferred from paths, MCP
tool results.

## Defensive behavior

- `trackOwnlyEvent` / `trackFirstEver` never throw and never surface UI.
- Non-allowlisted event names are dropped (dev console warns).
- Non-allowlisted params are stripped; over-long strings (>64 chars) dropped.
- Kill switch: `localStorage.ownly_analytics_disabled = '1'` stops all events.
- No analytics code runs when `gtag` is absent (ad blockers, offline).

## GA4 funnel definition (admin console, no code)

1. Create custom events for each name above (they arrive via `gtag`).
2. Funnel exploration, ordered steps:
   `onboarding_opened` → `local_data_connected` → `first_object_saved` →
   `backup_exported` → `app_return`.
3. Secondary path: `demo_started` → `local_data_connected`.
4. Breakdowns: `action` (create vs connect), `gap` (return recency),
   `surface`. No user-scoped dimensions — analysis stays aggregate.
