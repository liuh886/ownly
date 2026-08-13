# Ownly Product Governance

Updated: 2026-08-13

## Product boundary

Ownly is a local-first ownership memory and decision ledger built on portable Markdown and **user-controlled storage**. The product may read and write an Ownly data folder on the current device or inside a local filesystem folder synchronized by a provider the user controls.

This does **not** make Ownly a cloud-storage product. Ownly does not host the user's personal ledger, authenticate to personal cloud providers, or operate a synchronization backend.

Canonical storage architecture:

```text
Ownly Core
  ↓
canonical Ownly Markdown folder
  ↓
user-selected filesystem location
  ├─ local folder
  └─ personal cloud-synced local folder
```

The immediate product goal remains to make data setup, recovery, continued use, and agent access understandable and trustworthy across Web/PWA, Obsidian, Agent CLI, and MCP.

## Current governed baseline

The maintained contract includes:

- one portable Markdown data model shared across runtimes;
- one filesystem-backed Ownly data folder as the source of truth;
- user-controlled storage: local folder or personal cloud-synced local folder;
- no provider-specific storage backend for Dropbox, Google Drive, OneDrive, or iCloud Drive;
- create, update, archive, restore, and permanent-delete lifecycle protection;
- strict typed CLI and stable machine-readable error behavior;
- read-only local MCP access over the same canonical evidence store;
- versioned backup, validation, restore preflight, rollback, and migration;
- first-real-object onboarding without silently writing demo data;
- terminology and runtime-parity gates;
- installable offline PWA application shell;
- local data contents excluded from GitHub Pages and Ownly analytics.

## Storage boundary

Supported now:

- an Ownly data folder stored in a normal local filesystem location;
- an Ownly data folder stored inside a local folder synchronized by the user's own provider;
- the existing browser directory picker, filesystem repository, Obsidian filesystem access, CLI, and MCP reading the same data model.

Explicit rule:

> **One Ownly data folder, one sync provider.**

Ownly does not attempt to detect, authenticate, configure, or merge third-party synchronization services. When a user selects a personal cloud folder, the provider is responsible for synchronization and provider-level conflicts. Where the provider supports online-only placeholders, product guidance should recommend keeping the Ownly folder available offline.

## Next decision gates

### Gate 1 — browser capability and data-safety check

The Web/PWA should explain its actual operating state:

- installed PWA versus browser tab;
- local-folder API support;
- current read/write authorization state;
- permission renewal required after restart;
- persistence/storage status where available;
- connected data-folder health;
- most recent verified backup status;
- precise offline capabilities and limitations;
- the user-controlled storage boundary;
- for personal cloud folders, the recommendation to keep files available offline and use only one sync provider for the folder.

Technical failures must map to clear recovery actions rather than generic browser errors.

Doctor remains a deterministic Ownly data-integrity and filesystem-accessibility checker. It must not become a Dropbox / Google Drive / OneDrive / iCloud account-health checker.

### Gate 2 — guided recovery drill

A backup feature is not sufficient until recovery is demonstrably usable. Provide a non-destructive guided drill that:

- creates or uses a disposable fixture outside real user records;
- exports a backup;
- validates inventory and hashes;
- restores into an isolated temporary target;
- compares the restored result;
- reports a clear pass/fail outcome;
- removes drill data safely.

The drill must never overwrite the active data folder.

### Gate 3 — privacy-bounded activation evidence

Measure whether users reach the core value loop without collecting personal records:

- onboarding opened;
- data folder created or connected;
- first real object saved;
- first archive and restore;
- first backup and successful validation;
- PWA installation;
- later return to the application.

Never send object titles, Markdown, filenames, local paths, amounts, form values, backup contents, selected-folder metadata, provider names inferred from paths, or MCP tool results.

## Deferred work

The following remain out of scope:

- Ownly-managed cloud synchronization;
- direct Dropbox / Google Drive / OneDrive / iCloud APIs;
- OAuth or provider refresh-token storage;
- Ownly-hosted personal-data mirrors;
- account-based multi-device synchronization;
- an Ownly conflict-resolution or merge engine;
- multiple simultaneous sync providers for one Ownly data folder;
- AI assistant, recommendations, embeddings, or automatic enrichment;
- additional object types without demonstrated workflow need;
- a separate PWA data model or PWA-only application shell.

A user-controlled personal cloud folder is **not** part of this deferred list because Ownly continues to operate on a normal local filesystem folder; the external provider performs synchronization.

## Release rules

Every product PR must preserve:

1. readable and portable Markdown as the source format;
2. one canonical filesystem-backed Ownly data folder across runtimes;
3. Web/PWA/Obsidian/CLI/MCP behavioral parity except documented platform capabilities;
4. validation before destructive restore or migration;
5. recoverability on partial failure;
6. no personal content in analytics;
7. no hidden Ownly cloud dependency for core data access;
8. no provider SDK or account requirement merely to use a personal cloud-synced folder;
9. accurate privacy language: Ownly does not host personal records, while a user-selected sync provider or external MCP client may process data under its own policy.
