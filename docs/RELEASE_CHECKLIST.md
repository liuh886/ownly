# Ownly Release Checklist

Use this checklist for every Ownly release. Web/PWA, Obsidian, CLI, schemas, and documentation are parts of one product and must be reviewed together.

## 1. Confirm release scope

- Identify user-facing changes, data/schema changes, runtime-specific changes, and compatibility risks.
- Confirm the release does not introduce an undocumented parallel data model.
- Record any intentional Web/PWA/Obsidian capability difference.
- Confirm fact-ready Agent CLI changes preserve documented JSON and error contracts, or clearly mark a breaking change.

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
- data migration or compatibility notes;
- known runtime exceptions;
- recovery instructions for any storage-affecting change.

## 4. Terminology consistency

Review user-facing copy against [TERMINOLOGY.md](TERMINOLOGY.md).

Confirm:

- Web/PWA uses **local data** and **Ownly data folder**, not “Vault” as a generic storage term;
- **Obsidian Vault** is used only for an actual Vault or Obsidian runtime;
- **Create or open data**, **Connect local data**, and **Local data connected** match implemented behavior;
- **Archive** is recoverable and **Permanently delete** is irreversible;
- English and Chinese wording is aligned and idiomatic;
- retained legacy identifiers such as `OWNLY_VAULT` are documented as compatibility names;
- product copy describes deterministic **fact-ready data**, not built-in AI chat or recommendations.

Run:

```bash
npm run validate:terminology
```

## 5. Full validation

```bash
npm ci
npm run validate
npm run test
npm run test:e2e:data
```

The full gate must include TypeScript, lint, repository mutation contracts, Web build/static export, PWA validation, and Obsidian package validation.

## 6. Web/PWA manual check

Using current desktop Chrome or Microsoft Edge:

1. Open the GitHub Pages build or a production-equivalent preview.
2. Verify first-use choices: **Create new local data** and **Open existing data**.
3. Verify an empty folder named `Ownly` does not become `Ownly/Ownly`.
4. Create and reload a real object.
5. Archive, restore, and permanently delete a disposable test record.
6. Install the PWA where supported and confirm it reads the same selected local data.
7. Confirm personal Markdown is not uploaded or included in the service-worker cache.
8. Confirm permission cancellation or renewal produces a clear, non-destructive state.

## 7. Obsidian validation

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
- Obsidian-specific copy accurately uses Vault terminology.

See [OBSIDIAN_REVIEWER_CHECKLIST.md](OBSIDIAN_REVIEWER_CHECKLIST.md).

## 8. Data safety and migration

For any storage or schema change:

- run migration fixtures and round-trip tests;
- verify unknown compatible fields are preserved;
- verify failed migration leaves the original dataset recoverable;
- document schema and backup-format versions;
- test restore into a clean location;
- do not silently overwrite an existing valid file.

Until versioned backup/migration work in #34 is complete, avoid destructive in-place transformations.

## 9. Agent CLI contract

Run representative success and error commands against a disposable dataset:

```bash
npm run --silent wyqd -- --vault <path> object list --json
npm run --silent wyqd -- --vault <path> summary --json
```

Confirm stdout JSON, stderr JSON, exit codes, and persisted Markdown match [AGENT_CLI_CONTRACT.md](AGENT_CLI_CONTRACT.md).

Ownly exposes facts and validated mutations; do not add model APIs, embeddings, AI chat, or generated recommendations as part of routine release work.

## 10. Publish

1. Create a tag matching the release version.
2. Draft the GitHub Release.
3. Attach Obsidian release assets when applicable: `main.js`, `manifest.json`, `styles.css`.
4. Link the hosted Web app and relevant migration/recovery notes.
5. Publish only after required CI and manual checks pass.
