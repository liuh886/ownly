# Ownly Versioning Policy

Ownly follows [Semantic Versioning](https://semver.org/) (SemVer).

## Format

```
MAJOR.MINOR.PATCH
```

- **MAJOR** — Breaking changes to the data schema, plugin API, or user-facing behavior that require manual migration.
- **MINOR** — New features, improvements, or changes that are backward-compatible.
- **PATCH** — Bug fixes, performance improvements, and minor polish that are backward-compatible.

## What Constitutes a Breaking Change

- Changes to the YAML frontmatter schema (field renames, type changes, required field additions).
- Changes to the `Ownly/` directory structure.
- Removal of a feature that users may depend on.
- Changes to the minimum Obsidian version requirement (`minAppVersion`).

## Release Process

1. Update version in all three locations:
   - `package.json` → `version`
   - `manifest.json` → `version`
   - `src/core/runtime.ts` → `WYQD_CORE_TARGET_VERSION`
2. Add an entry to `versions.json` mapping the new version to its `minAppVersion`.
3. Add a changelog entry to `CHANGELOG.md`.
4. Create a git tag matching the version (e.g., `v1.0.0`).
5. Push the tag — GitHub Actions automatically builds and publishes the release.

## Obsidian Plugin Updates

After the initial community plugin submission, new versions are picked up automatically by Obsidian's update mechanism. Users do not need to re-submit for each version.

## Pre-release Versions

Pre-release versions use the format `MAJOR.MINOR.PATCH-alpha` (e.g., `0.2.0-alpha`). These are not published to the Obsidian community plugin directory.
