# Changelog

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
- Updated the Obsidian workspace alpha to embed the Web UI through a configurable Web app URL.
- Kept native Obsidian quick actions for draft creation and Doctor diagnostics.
- Reworked Obsidian settings into Ownly-styled hero, grouped panels, and membership summary.

Known gaps:

- The Obsidian workspace depends on a running Web app URL for full Web-style UI parity.
- Full native object edit forms are not complete.
- Native account, snapshot, and review detail operation flows are not complete.
- Doctor repair preview and rollback are not implemented.
- Real license validation is not connected.
- Public Obsidian community plugin submission in progress.
