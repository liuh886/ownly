# Ownly User Guide

Ownly is a local-first ownership memory and decision ledger. It records possessions, recurring costs, experiences, snapshots, reviews, and object experience logs as Markdown in an **Ownly data folder**.

## 1. Choose an interface

| Interface | Obsidian required? | Purpose |
|---|---:|---|
| Hosted Web app | No | Open Ownly directly from GitHub Pages |
| Installed PWA | No | Use the same Web runtime in a standalone app window |
| Obsidian plugin | Yes | Work with the shared Ownly data inside Obsidian |

Web and PWA have identical data behavior. The PWA adds installation and offline application-shell startup; it does not create a separate database.

## 2. Create or open local data

On first Web/PWA launch, Ownly offers two actions.

### Create new local data

Choose a save location. Ownly initializes the required directory structure automatically.

- Selecting `Documents` creates `Documents/Ownly/...`.
- Selecting an empty folder already named `Ownly` uses it directly.
- Selecting an Obsidian Vault root creates or opens `<Vault>/Ownly/...`.

Obsidian is not required. It is recommended because the Markdown remains directly readable, searchable, and editable.

### Open existing data

Choose an existing Ownly data root or an Obsidian Vault containing Ownly data. The browser requests explicit local read/write permission.

The hosted site does not upload personal Markdown. The PWA service worker caches application resources, not the user's data files.

## 3. Home dashboard

The Home dashboard summarizes:

- **Net worth** from account snapshots;
- **Monthly fixed cost** from active recurring costs;
- **Daily and annualized cost** for relevant records;
- **Pending decisions and reviews**;
- **Quick entry** for creating a new object;
- **Data scale and health**.

A snapshot is a point-in-time fact, not a live bank connection. Ownly does not connect to financial institutions.

## 4. Objects

The Objects tab manages three stable object types.

### Physical items

Typical lifecycle:

```text
seeded → observing → purchased → using → idle → transferred / discarded
```

Use physical items for possessions whose purchase, use, condition, cost, and exit history are worth remembering.

### Recurring costs

Typical lifecycle:

```text
seeded → active → paused / cancelled
```

Use recurring costs for subscriptions and other repeating obligations.

### One-time experiences

Typical lifecycle:

```text
planned → in_progress → completed → reviewed
```

Use one-time experiences for travel, dining, events, and other finite plans.

## 5. Quick entry

Quick Entry accepts one-line input separated by `/`, `／`, `，`, `,`, `|`, or Tab. Always review the parse preview before saving.

### Physical item

```text
title / physical / price / purchase_date / end_date / category / status
```

Example:

```text
Sony A7C / physical / 12000 / 2026-05-01 / / Camera / using
```

### Recurring cost

```text
title / recurring_cost / amount / cycle / billing_day / payment_account / start_date / status / category
```

Example:

```text
Cloud Storage / recurring_cost / 20 / monthly / 1 / Credit Card / 2026-01-01 / active / Software
```

### Travel experience

```text
title / travel / budget / actual_cost / end_date / category / status / country_code / city / latitude / longitude
```

Example:

```text
Tokyo trip / travel / 18000 / 16500 / 2026-05-04 / Travel / completed / JP / Tokyo / 35.6762 / 139.6503
```

Aliases such as `fixed` for `recurring_cost`, `travel` for travel experiences, and Chinese type/status terms remain supported where documented.

## 6. Snapshots

Snapshots record point-in-time account and net-worth facts.

- Add a snapshot for a specific date.
- Record asset and liability balances.
- Review the trend across historical snapshots.

Snapshots are stored in `Ownly/Snapshots/`.

## 7. Reviews

Reviews capture what happened after use, completion, cancellation, transfer, or discard.

- A review may link to an object through `target_id`.
- An object may link back through `review_ref`.
- Experience reviews may include food, scenery, experience, rank, and regret fields.
- Reviews are stored in `Ownly/Reviews/`.

The purpose is to preserve structured facts and reflections that can inform later decisions.

## 8. Object experience logs

Object experience logs are append-only records of meaningful events:

- usage;
- issue;
- maintenance;
- regret;
- lesson;
- comparison;
- exit note.

Logs do not silently change an object's lifecycle status. They are stored under `Ownly/Logs/Object Experiences/`.

## 9. Archive, restore, and permanent deletion

- **Archive** removes a record from active views but keeps a recoverable copy.
- **Restore** returns an archived record to active storage.
- **Permanently delete** irreversibly removes a selected archived record.

Do not treat Archive and Permanently delete as equivalent actions.

## 10. Doctor and data health

Doctor performs deterministic checks such as:

- duplicate IDs;
- unsupported schema versions;
- invalid costs or date order;
- missing review or object references;
- stale snapshots;
- missing data directories.

Doctor does not use AI. It validates local facts and relationships.

## 11. Agent CLI

Scripts and external AI agents should use the documented CLI instead of editing YAML through unvalidated file manipulation.

```bash
npm run wyqd -- --vault <path> object list --json
```

The CLI exposes deterministic facts, validated mutations, JSON output, and documented error codes. Ownly does not include AI chat, embeddings, or model-generated recommendations.

See:

- [Agent CLI Contract](AGENT_CLI_CONTRACT.md)
- [Agent CLI Guide](AGENT_CLI_GUIDE.md)
- [Data Model](DATA_MODEL.md)
- [Terminology Contract](TERMINOLOGY.md)

## 12. Storage terminology

Use these terms consistently:

- **Ownly data folder** — cross-runtime storage term;
- **local data** — Web/PWA user-facing term;
- **Obsidian Vault** — only for an actual Vault or the Obsidian runtime;
- **Archive** — recoverable removal;
- **Permanently delete** — irreversible removal.
