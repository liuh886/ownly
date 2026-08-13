# Ownly Release Checklist

Use this checklist for every Ownly release. Web/PWA, Obsidian, CLI, MCP, schemas, and documentation are parts of one product and must be reviewed together.

## 1. Confirm release scope

- Identify user-facing changes, data/schema changes, runtime-specific changes, and breaking changes.
- Confirm the release does not introduce an undocumented parallel data model or storage backend.
- Review [RUNTIME_COMPATIBILITY.md](RUNTIME_COMPATIBILITY.md) and record every intentional Web/PWA/Obsidian capability difference.
- Confirm fact-ready Agent CLI and MCP changes preserve their documented contracts or clearly mark a breaking change.

## 2. Synchronize versions

Keep version numbers aligned where applicable:

- `package.json`
- `manifest.json`
- `versions.json`
- runtime/version constants used by Web/PWA or Obsidian

Add the minimum supported Obsidian version to `versions.json` when the plugin version changes.

## 3. Update the changelog

Update `CHANGELOG.md` with:

- version and release date;
- user-facing features and fixes;
- data-contract changes where applicable;
- known runtime exceptions;
- recovery instructions for any storage-affecting change.

## 4. Terminology consistency

Review user-facing copy against [TERMINOLOGY.md](TERMINOLOGY.md).

Confirm:

- the canonical cross-runtime term is **Ownly data folder**;
- **user-controlled storage** means the user chooses where that filesystem folder lives;
- **local folder** and **personal cloud folder** are both normal filesystem locations from Ownly's point of view;
- **Obsidian Vault** is used only for an actual Vault or Obsidian runtime;
- Web/PWA uses **Choose data folder**, **Connect data folder**, and **Data folder connected** where applicable;
- personal cloud folder copy does not imply an Ownly cloud backend, provider SDK, OAuth flow, or provider account integration;
- the one-folder / one-sync-provider rule and offline-availability guidance are present where synchronization is explained;
- device-only claims such as “every file stays only on this device” are not used where inaccurate;
- **Archive** is recoverable and **Permanently delete** is irreversible;
- English and Chinese wording is aligned and idiomatic;
- product copy describes deterministic **fact-ready data**, not built-in AI chat or recommendations.

Run:

```bash
npm run validate:terminology
```

## 5. Runtime parity

Review the typed capability contract in `src/core/runtime-capabilities.ts` and the committed [runtime compatibility matrix](RUNTIME_COMPATIBILITY.md).

Confirm:

- hosted Web and installed PWA still share one browser data runtime;
- local folder and personal cloud folder choices both converge on the same directory picker and repository path;
- no provider-specific repository, serializer, schema, migration core, remote filesystem abstraction, or application shell has been introduced;
- shared entity schemas, calculations, lifecycle rules, Doctor checks, and portability services remain runtime-independent;
- Doctor remains provider-agnostic and does not inspect Dropbox / Google Drive / OneDrive / iCloud accounts;
- any new platform exception is visible in the matrix and covered by a test or explicit manual check;
- unsupported human editing surfaces fail visibly or remain documented rather than silently disappearing.

Run:

```bash
npm run validate:runtime-parity
npm run test:runtime-parity
```

## 6. Full validation

```bash
npm ci
npm run validate
npm run test
npm run test:e2e:data
```

The full gate must include TypeScript, lint, terminology, runtime parity, repository mutation contracts, CLI/MCP contracts, onboarding, portability, Web build/static export, PWA validation, and Obsidian package validation.

## 7. Web/PWA manual check

Using current desktop Chrome or Microsoft Edge:

1. Open the GitHub Pages build or a production-equivalent preview.
2. Verify storage choices: **On this device** and **In your personal cloud folder**.
3. Confirm both storage intents lead to the same create/open directory picker behavior.
4. Verify **Create new data** and **Open existing data** still work for a normal local folder.
5. Verify an empty folder named `Ownly` does not become `Ownly/Ownly`.
6. When a personal cloud-synced local folder is available, verify Ownly treats it as an ordinary filesystem folder and does not request provider authentication.
7. Confirm the Data Safety dialog explains the Ownly/server boundary, offline recommendation, and one-folder / one-sync-provider rule.
8. Create and reload a real object.
9. Archive, restore, and permanently delete a disposable test record.
10. Install the PWA where supported and confirm it reads the same selected Ownly data folder.
11. Confirm personal Markdown is not uploaded to GitHub Pages or included in the service-worker cache.
12. Confirm permission cancellation or renewal produces a clear, non-destructive state.

## 8. Obsidian validation

```bash
npm run build:obsidian
npm run validate:obsidian
```

Then install the generated `main.js`, `manifest.json`, and `styles.css` from `dist/obsidian/ownly` into a disposable test Vault:

```text
<Test Vault>/.obsidian/plugins/ownly/
```

Verify:

- plugin enables and opens;
- configured Ownly data folder is respected;
- create/update/archive/restore behavior matches shared rules;
- Markdown remains readable directly in Obsidian;
- Obsidian-specific copy accurately uses Vault terminology;
- an Obsidian Vault inside a personal cloud-synced local folder does not require provider-specific Ownly code.

See [OBSIDIAN_REVIEWER_CHECKLIST.md](OBSIDIAN_REVIEWER_CHECKLIST.md).

## 9. Data safety

For any storage or schema change:

- run portability fixtures and round-trip tests;
- verify failed restore leaves the original dataset recoverable;
- document schema and backup-format versions;
- test restore into a clean location;
- do not silently overwrite an existing valid file;
- confirm backups are not uploaded to an Ownly server;
- confirm provider-sync behavior is described as the provider's responsibility rather than an Ownly feature;
- confirm simultaneous multi-device edits are not presented as conflict-free.

Use the shared backup and restore services. Do not implement runtime-specific or provider-specific storage rules.

## 10. Agent CLI and MCP contracts

Run representative CLI success/error commands and MCP contract tests against a disposable dataset.

Confirm stdout/stderr contracts, exit codes, persisted Markdown, MCP tool results, and read-only MCP boundaries match their documentation.

The selected Ownly data folder remains the source of truth whether it is in a normal local location or a personal cloud-synced local folder.

Ownly exposes facts and validated mutations through explicit interfaces; do not add model APIs, embeddings, AI chat, or generated recommendations as part of routine release work.

## 11. Publish

1. Create a tag matching the release version.
2. Draft the GitHub Release.
3. Attach Obsidian release assets when applicable: `main.js`, `manifest.json`, `styles.css`.
4. Link the hosted Web app and relevant storage/recovery notes.
5. Publish only after required CI and manual checks pass.
