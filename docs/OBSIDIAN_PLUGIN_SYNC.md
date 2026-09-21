# Obsidian Plugin Sync

How the Ownly Obsidian plugin is kept in sync with this monorepo.

## Why a separate repository

The Obsidian community directory scans the **whole submitted repository** with
`eslint-plugin-obsidianmd`. This monorepo also contains a Next.js web app
(`src/app`) and a Chrome extension (`src/extension`), which the plugin-only
rules flag and which cannot use Obsidian-only APIs. The plugin therefore
publishes from a dedicated repository that contains only the plugin and the
source it depends on:

- Source of truth: `liuh886/ownly` (this repository)
- Published plugin: `liuh886/ownly-obsidian` (generated — do not edit by hand)

## What is synced

`scripts/export-obsidian-repo.mjs` runs esbuild against `src/obsidian/main.ts`
with a metafile, reads the exact dependency graph, and copies **only** those
files. It never copies `src/app`, `src/extension`, tests, or unrelated tooling.

It also generates a standalone `package.json`, `tsconfig.json`, `.gitignore`,
and `README.md`, and copies `manifest.json`, `versions.json`, `LICENSE`, the
esbuild config, and the release scripts.

## The contract

The plugin repository mirrors a **release**, not raw development commits:

> The `manifest.json` at the default-branch HEAD always equals the latest
> released version, and a GitHub release with a matching tag provides
> `main.js`, `manifest.json`, and `styles.css`.

This is exactly what the Obsidian directory reads, so the two never diverge.

## Trigger

`.github/workflows/release.yml`, group `obsidian-plugin-sync` (never runs two
syncs at once):

| Trigger | Effect |
|---|---|
| Push a tag | Full pipeline: gate → build → export → push source → publish release |
| Manual (`workflow_dispatch`) | Same pipeline; source-only |
| Manual with `dry_run: true` | Build and export only; **nothing is pushed** |

## Pipeline

1. `npm ci`
2. **Version guard** — a tag must equal `manifest.json` version, else fail fast.
3. `npm run validate` and `npm run test:runtime-parity` — the gate.
4. `npm run package:obsidian` — builds `dist/obsidian/ownly/{main.js,styles.css,manifest.json,versions.json}`.
5. `npm run export:obsidian-repo` — generates `dist/obsidian-repo`.
6. **Export self-check** — builds and validates the exported tree in place.
7. **Sync** — force-pushes the exported tree to `liuh886/ownly-obsidian` `main`.
8. **Publish** — creates/updates the release in `liuh886/ownly-obsidian` with the three assets (tags only).

## Required secret

Add `OBSIDIAN_REPO_TOKEN` to this repository (Settings → Secrets and variables →
Actions):

- A fine-grained personal access token with **Contents: Read and write** on
  `liuh886/ownly-obsidian`.

If the secret is absent, the sync and publish steps **skip gracefully** (the
build still runs and passes), so a tag never produces a failed run.

## Releasing

```bash
# 1. Align the version in package.json, manifest.json, versions.json, src/core/runtime.ts
# 2. Update CHANGELOG.md
# 3. Validate locally
npm run validate

# 4. Tag and push — the workflow does the rest
git tag 1.2.0
git push origin 1.2.0
```

## Manual sync / preview

Actions → **Release Obsidian Plugin** → **Run workflow**:

- leave `dry_run` unchecked to refresh the plugin repo source without a release
  (use only when the manifest version already has a release, otherwise HEAD and
  the latest release will disagree);
- check `dry_run` to build and export without touching the remote.

## Local equivalent

```bash
npm run package:obsidian
npm run export:obsidian-repo   # writes dist/obsidian-repo
```

## Failure behavior

- Gate or build failures block everything; the plugin repo is untouched.
- The force-push happens only after the exported tree builds and validates, so a
  broken export can never reach the plugin repo.
- Re-running the same tag is safe: the push is idempotent.
