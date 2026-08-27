# Ownly User Guide

Ownly is a local-first ownership memory and decision ledger. It records possessions, recurring costs, experiences, snapshots, reviews, and object experience logs as Markdown in an **Ownly data folder** that you control.

Ownly does not host your personal ledger. You choose where the filesystem folder lives.

## 1. Choose an interface

| Interface | Obsidian required? | Purpose |
|---|---:|---|
| Hosted Web app | No | Open Ownly directly from GitHub Pages |
| Installed PWA | No | Use the same Web runtime in a standalone app window |
| Obsidian plugin | Yes | Work with the shared Ownly data inside Obsidian |
| Agent CLI | No | Deterministic scripting and validated local mutations |
| Local MCP | No | Read-only Ownly evidence for compatible local agents |

Web and PWA have identical data behavior. The PWA adds installation and offline application-shell startup; it does not create a separate database.

## 2. Choose where your Ownly data lives

On first Web/PWA launch, Ownly asks for a storage location and then lets you create new data or open an existing Ownly data folder.

### On this device

Choose a normal local filesystem folder. Ownly reads and writes that folder directly. Nothing is synchronized unless you configure synchronization outside Ownly.

### In your personal cloud folder

You may choose a local folder already synchronized by a provider you control, such as Dropbox, Google Drive, OneDrive, iCloud Drive, or another filesystem-sync service.

This does not create a cloud backend inside Ownly:

- Ownly still reads and writes normal local Markdown files;
- Ownly does not use provider APIs or OAuth;
- Ownly does not store provider credentials;
- the provider handles uploading, downloading, synchronization, retention, and provider-level conflicts under its own policies;
- when the provider supports online-only placeholders, keep the Ownly folder available offline;
- use **one sync provider per Ownly data folder** to reduce conflicting copies.

Both storage choices use the same Ownly repository, schema, and directory picker.

### Create new data

Choose a save location. Ownly initializes the required directory structure automatically.

- Selecting `Documents` creates `Documents/Ownly/...`.
- Selecting an empty folder already named `Ownly` uses it directly.
- Selecting an Obsidian Vault root creates or opens `<Vault>/Ownly/...`.
- Selecting a Dropbox / Google Drive / OneDrive / iCloud Drive local folder works the same way from Ownly's point of view.

Obsidian is not required. It is useful when you want the Markdown directly readable, searchable, and editable inside Obsidian.

### Open existing data

Choose an existing Ownly data root or an Obsidian Vault containing Ownly data. The browser requests explicit read/write permission for the selected filesystem folder.

The hosted site does not receive the personal Markdown merely because you selected it. The PWA service worker caches application resources, not the user's data files. If the selected folder is synchronized by a third-party provider, that provider may transfer those files under its own privacy and security policy.

## 3. Create your first real object

When Ownly connects to a readable data folder containing no objects, it offers a short first-object chooser:

- **Physical item** — a possession you are considering, using, or preparing to exit;
- **Recurring cost** — a subscription or other repeating obligation;
- **Experience or plan** — a trip, event, course, meal, or other finite experience.

Selecting a type opens the existing Object Composer with the corresponding canonical template. The record is saved through the normal repository and serializer, so it is indistinguishable from any object created later.

Important behavior:

- Ownly does **not** automatically write sample objects, snapshots, or reviews into a real user data folder.
- No onboarding-specific frontmatter fields are added.
- Onboarding is marked complete only after the normal Markdown save succeeds.
- The chooser can be dismissed without changing the dataset.
- When the dataset remains empty, a small banner allows the chooser to be reopened later.
- Existing datasets are not interrupted by the first-object prompt.

Demo mode remains available before a real data folder is connected, but demo records are not silently copied into real data.

## 4. Home dashboard

The Home dashboard summarizes:

- **Net worth** from account snapshots;
- **Monthly subscription cost** from active recurring costs;
- **Daily usage and annualized cost** for relevant records;
- **Pending decisions and reviews**;
- **Quick entry** for creating a new object;
- **Data scale and health**.

A snapshot is a point-in-time fact, not a live bank connection. Ownly does not connect to financial institutions.

## 5. Objects

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

## 6. Quick entry

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

## 7. Snapshots

Snapshots record point-in-time account and net-worth facts.

- Add a snapshot for a specific date.
- Record asset and liability balances.
- Review the trend across historical snapshots.

Snapshots are stored in `Ownly/Snapshots/`.

## 8. Reviews

Reviews capture what happened after use, completion, cancellation, transfer, or discard.

- A review may link to an object through `target_id`.
- An object may link back through `review_ref`.
- Experience reviews may include food, scenery, experience, rank, and regret fields.
- Reviews are stored in `Ownly/Reviews/`.

The purpose is to preserve structured facts and reflections that can inform later decisions.

## 9. Object experience logs

Object experience logs are append-only records of meaningful events:

- usage;
- issue;
- maintenance;
- regret;
- lesson;
- comparison;
- exit note.

Logs do not silently change an object's lifecycle status. They are stored under `Ownly/Logs/Object Experiences/`.

## 10. Archive, restore, and permanent deletion

- **Archive** removes a record from active views but keeps a recoverable copy.
- **Restore** returns an archived record to active storage.
- **Permanently delete** irreversibly removes a selected archived record.

Do not treat Archive and Permanently delete as equivalent actions.

## 11. Doctor and data health

Doctor performs deterministic checks such as:

- duplicate IDs;
- unsupported schema versions;
- invalid costs or date order;
- missing review or object references;
- stale snapshots;
- missing data directories;
- filesystem accessibility needed to read the selected Ownly data folder.

Doctor does not use AI and does not inspect Dropbox, Google Drive, OneDrive, iCloud, or other provider accounts. Provider sync health remains the provider's responsibility.

## 12. Agent CLI and MCP

Scripts and external AI agents should use documented Ownly interfaces instead of editing YAML through unvalidated file manipulation.

The Agent CLI exposes deterministic facts, validated mutations, JSON output, and documented error codes. The local MCP server exposes a read-only tool surface over the same Ownly data folder.

The selected data folder remains the source of truth whether it is stored in a normal local location or a personal cloud folder. Facts explicitly returned through MCP can enter the connected agent/provider context.

See:

- [Agent CLI Contract](AGENT_CLI_CONTRACT.md)
- [Agent CLI Guide](AGENT_CLI_GUIDE.md)
- [Agent / MCP Guide](MCP.md)
- [Data Model](DATA_MODEL.md)
- [Terminology Contract](TERMINOLOGY.md)

## 13. Storage terminology

Use these terms consistently:

- **Ownly data folder** — canonical cross-runtime storage term;
- **user-controlled storage** — the principle that the user chooses where the folder lives;
- **local folder** — normal filesystem folder on the current device;
- **personal cloud folder** — local filesystem folder synchronized by the user's own provider;
- **Obsidian Vault** — only for an actual Vault or the Obsidian runtime;
- **Archive** — recoverable removal;
- **Permanently delete** — irreversible removal.

The product principle is:

> **Ownly doesn't host your data. You choose where your files live.**
