# Changelog

## 1.0.6 (2026-06-23)

- Agent CLI Write Surface: added write commands (object add/update/retire/cancel/delete, review link, batch-review-needed).
- Extended AGENT_CLI_CONTRACT with write chapter and JSON error codes.
- Hardened write surface semantics and cleaned up unused variables.

## 1.0.5 (2026-06-22)

- Minor CLI printHelp fix for review add parameters.
- Re-ran validation pipelines successfully.

## 1.0.4 (2026-06-21)

- Documentation consistency updates (Version alignment and naming cleanup).

## 1.0.0 (2026-05-31)

### Highlights

First stable public release of the Ownly Obsidian plugin.

### Features

- Object list sorting: by date (default), price, and title.
- Object list pagination: "Show more" button when list exceeds 10 items.
- Auto-seed demo data into empty Vault on first connect (web runtime).
- Gumroad license activation for Obsidian Pro (first-activation + local permanent unlock).
- Real travel world map with d3-geo + topojson rendering and city search.
- 11 sample objects, 2 snapshots, 5 reviews with travel experiences.

### Fixes

- P0-P5 audit fixes: accessibility, i18n, memoization, code quality, design consistency.
- Fixed README version references and plugin output paths.

## 0.2.6 (2026-05-29)

- Added Gumroad license activation system for Obsidian Pro (first-activation + local permanent unlock).
- Added real travel world map with d3-geo + topojson rendering and city search input.
- Added richer demo data: 11 sample objects, 2 snapshots, 5 reviews with travel experiences.
- Added auto-seed demo data into Vault on first connect for new users (web runtime).
- P0+P1 audit fixes for release readiness.
- P2 i18n and accessibility improvements.
- P3 memoize expensive derived calculations.
- P4 code quality improvements.
- P5 design consistency improvements.
- Fixed travel map stability and label accuracy.

## 0.2.5 (2026-05-28)

- Added PRO activation system with local key format validation.
- Added Ownly plugin identity and branding.

## 0.2.4-alpha (2026-05-27)

- Added the first Pro travel insight surface with shared Web/Obsidian React components.
- Added structured travel location fields, sample travel data, lightweight local map rendering, travel statistics, and timeline.
- Kept the Pro gate local-first through the existing membership state while preserving Free access to base travel records.

## 0.2.3-alpha

- Refined Ownly's visual system toward a quieter, more premium Obsidian-native workspace.
- Softened borders, shadows, spacing, and focus states across dashboard, objects, accounts, archive, and review surfaces.
- Added Obsidian runtime CSS primitives for action, insight, and watchlist cards so shared React components render correctly inside Obsidian.
- Kept the shared Web/Obsidian workspace architecture intact while preparing the next Pro travel insight surface.

## 0.2.0-alpha

- Added Obsidian private plugin package files: `manifest.json`, `versions.json`, `main.js`, `styles.css`.
- Added shared core modules for runtime metadata, repository contracts, object console modeling, Doctor diagnostics, and membership state.
- Added Obsidian Vault Repository for Ownly Markdown data.
- Added Ownly Workspace view, ribbon entry, command palette commands, and settings tab.
- Added object console summary inside Obsidian.
- Added object detail preview, source Markdown opening, minimal field saving, status advancement, archive, and restore flows.
- Added local Free / Pro Annual / Lifetime Early Supporter membership-state alpha.
- Added `validate:obsidian` and `validate` release checks.
- Preserved Web App build and PM2 static serving path.
- Added Web dark mode via system color preference and Obsidian theme-aware slogan placement.
- Added product positioning around the slogan: "Own less, Live more, Decide better."
- Added `npm run wyqd` as the documented Agent CLI entry.
- Added `CONTRIBUTING.md` and a repeatable sample Vault fixture under `samples/wyqd-vault`.
- Added MIT license metadata and real Vault installation instructions.
- Added `npm run deps:reset` and documentation for Windows/Docker `esbuild` platform mismatch recovery.
- Added visible Web Vault reconnect control.
- Replaced the Obsidian iframe workspace with a native React-mounted `ItemView` that reuses the shared Ownly workspace UI.
- Split the Web runtime into a `WebShell` and introduced a shared workspace context for Web and Obsidian adapters.
- Kept native Obsidian quick actions for draft creation and Doctor diagnostics.
- Reworked Obsidian settings into Ownly-styled hero, grouped panels, and membership summary.

Known gaps:

- Full mobile polish inside Obsidian still needs dedicated QA.
- Doctor repair preview and rollback are not implemented.
- Real license validation is not connected.
- Public Obsidian community plugin submission in progress.
