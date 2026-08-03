# Ownly Product Governance

Updated: 2026-08-03

## Product boundary

Ownly is a local-first ownership memory and decision ledger built on portable Markdown. The immediate product goal is not more object types, cloud synchronization, or AI. It is to make local data setup, recovery, and continued use understandable and trustworthy across Web/PWA, Obsidian, and the Agent CLI.

## Current governed baseline

The maintained contract includes:

- one portable Markdown data model shared across runtimes;
- create, update, archive, restore, and permanent-delete lifecycle protection;
- strict typed CLI and stable machine-readable error behavior;
- versioned backup, validation, restore preflight, rollback, and migration;
- first-real-object onboarding without silently writing demo data;
- terminology and runtime-parity gates;
- installable offline PWA application shell;
- local data contents excluded from GitHub Pages and analytics.

## Next decision gates

### Gate 1 — browser capability and data-safety check

Before adding new features, the Web/PWA should explain its actual operating state:

- installed PWA versus browser tab;
- local-folder API support;
- current read/write authorization state;
- permission renewal required after restart;
- persistence/storage status where available;
- connected data-folder health;
- most recent verified backup status;
- precise offline capabilities and limitations.

Technical failures must map to clear recovery actions rather than generic browser errors.

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
- local data created or connected;
- first real object saved;
- first archive and restore;
- first backup and successful validation;
- PWA installation;
- later return to the application.

Never send object titles, Markdown, filenames, local paths, amounts, form values, backup contents, or selected-folder metadata.

## Deferred work

The following remain out of scope until the three gates above are reviewed:

- account system;
- cloud synchronization or conflict merging;
- AI assistant, recommendations, embeddings, or automatic enrichment;
- additional object types without demonstrated workflow need;
- a separate PWA data model or PWA-only application shell.

## Release rules

Every product PR must preserve:

1. readable and portable Markdown as the source format;
2. Web/PWA/Obsidian/CLI behavioral parity except documented platform capabilities;
3. validation before destructive restore or migration;
4. recoverability on partial failure;
5. no personal content in analytics;
6. no hidden cloud dependency for core data access.