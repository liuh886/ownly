# Changelog

## Unreleased

### Added

- **Flip-to-chart Home cost cards:** the daily usage cost and monthly subscription cost cards in the Home cost section flip in 3D to a snapshot trend chart when tapped — no visual affordance by design, and a second tap flips back. The subscription line uses recorded `monthly_fixed_cost` values; the daily cost line is backcast from current holdings and labelled as such. Rendered with the same animated sparkline style as the asset chart, with an accessible button label for keyboard users.

- **Idle reminder becomes a usage-state control:** every physical object row in the Object insights panel now shows whether it is in use or unused and offers a one-click switch. Marking an item unused stamps `unused_since` and writes a `usage_state` object log; marking it in use clears the unused date and stamps `in_use_since`. Manual marks win over log evidence and stay until switched, so actively used items no longer sit in the idle list. Adds the `usage_state` event type to the Web, CLI, and Obsidian log paths.

- **Liability repayment reminders:** liability account lines can carry an optional due date (e.g. `Credit Card 4200 2027-10-01`; `/`, `.` and `年/月/日` forms normalize to `YYYY-MM-DD`). The Accounts page shows liability ratio, net worth vs the previous snapshot, liabilities sorted by due date, coverage of the next six months, and overdue totals; the Home dashboard surfaces every repayment due within six months. Due dates live on the snapshot's liability balance, so reusing the previous account list carries them forward, and existing data stays valid without a schema bump. The Agent CLI now preserves account detail when a snapshot update leaves totals unchanged.

- **PRO fixed share links:** each trip can publish a permanent link named after the trip that serves the self-contained itinerary HTML. One-tap enable from a mobile-first sheet, with native share and copy fallback; auto-republishes ~30s after itinerary edits and auto-suffixes on name collisions. Expenses are never included, the page is `noindex`, and writes require a device-local write token (the public name is not the authorization secret). Because Supabase rewrites HTML responses from Edge Functions to `text/plain`, the link renders through a static `/s/` viewer on the Ownly web host. Requires the `ownly_trip_shares` migrations and the `trip-share` Edge Function.

### Changed

- Replaced the JSON trip snapshot (`.ownly-trip-snapshot.json`) and the `/trip` read-only viewer with a **single-file HTML itinerary export** (`Export → Itinerary HTML`). The HTML is self-contained (inline CSS, no scripts, no external assets), opens offline on any phone, keeps the same privacy line (expenses opt-in; members/calendar feed/review backlink stripped), and never writes back. Removed the `/trip` route and its bundle-size budget.

## 1.2.3 (2026-09-22)

### Fixed

- Removed an `eslint-disable` for `obsidianmd/prefer-file-manager-trash-file`; that rule cannot be disabled, so it was reported as a review **error**. Deletion now always goes through `FileManager.trashFile()` (the repository requires an App with a FileManager, as production already provides).
- Replaced `createEl('span', …)` with `createSpan(…)` and routed cross-runtime element creation through a shared type-erased helper, clearing the `obsidianmd/prefer-create-el` findings.
- Committed a deterministic `git-sha` module so the type checker resolves `GIT_SHA` without a build.
- Fixed popout-window timer usage in the calendar auto-sync hook.

### Improved

- Upgraded the local `eslint-plugin-obsidianmd` to 0.4.2 to match the community-directory scanner.

The remaining findings are deprecation recommendations (Obsidian settings `display`/`setWarning` and declarative settings require a newer `minAppVersion`) and Obsidian-only rules that cannot apply to modules shared with the Node CLI/MCP runtime (`globalThis`, `fetch`).

## 1.2.2 (2026-09-22)

### Improved

- Reduced the Obsidian community-review findings from 2340 to 22. The bulk was a single root cause: the generated plugin repository omitted type-only modules, so the type checker degraded and reported thousands of unsafe-access warnings. The export now resolves type-only imports with the TypeScript resolver.
- Added the plugin's `package-lock.json` and a deterministic build stamp so the published `main.js` is byte-for-byte reproducible from the committed source (the directory's build verification now passes).
- Removed redundant type assertions, wrapped floating/void-returning handlers, replaced inline styles with CSS classes, and adopted the app's confirm dialog instead of native `confirm`.

The remaining 22 findings are either deprecation recommendations (Obsidian settings `display`/`setWarning` require a newer `minAppVersion`) or Obsidian-only rules that cannot apply to modules shared with the Node CLI/MCP runtime (`globalThis`, bare timers, `fetch`).

## 1.2.1 (2026-09-21)

### Fixed

- Obsidian: raised `minAppVersion` to 1.8.7. The plugin uses `App.loadLocalStorage`/`saveLocalStorage` for the language preference, which Obsidian added in 1.8.7; the previous 1.8.0 declaration triggered the community directory's "uses APIs newer than minAppVersion" error.

### Packaging

- The generated Obsidian plugin repository now pins its dependencies to exact versions instead of semver ranges.

## 1.2.0 (2026-09-21)

### Added

- **Planner trip retrospective:** a finished trip generates a travel-experience review draft (auto stats for places/visits/legs, transport mix, converted spend, top-rated place) that saves through the normal review path and feeds Travel Insights. Nothing is written until you confirm.
- **Trip snapshot + mobile read-only view:** export a trip as `.ownly-trip-snapshot.json` and open it in the PWA on iOS Safari (timeline, candidate pool, map, staleness badge). Expenses are opt-in; the view has no write path.
- **Object insights (Pro):** annualized subscription cost ranking per currency, net-worth trend, and an "unused for X days" list — the "Own less" outlet.
- **Calendar feed is now a Pro feature:** continuous subscription feeds require membership; one-time `.ics` export stays free.
- **Trust center:** browser capability and data-safety status panel (ten local checks) plus a guided, non-destructive recovery drill.
- **Capture/Planner:** strong-identity place merge, suspected-duplicate review (Merge/Ignore, persisted), a first-class Shelved filter, hotel transfer-day detection, and mobile-safe multi-day route segmentation.
- **Agent/MCP:** opt-in writes for objects, lifecycle actions, logs, reviews, snapshots, and recoverable archive/restore, with two-phase preview/commit, safety backups, idempotent retries, and stale-write conflict detection.

### Improved

- Unified CLI and MCP data-root resolution: `Ownly/` remains the default folder, while a custom root containing `Objects/` can be passed directly.
- Fixed local-date formatting so positive-offset time zones do not report recurring billing dates one day early.
- Obsidian filename collision suffix now matches the Web runtime (`--n`), backed by a shared adapter mutation contract.
- Added controlled coverage for File System Access recovery states (permission loss, picker cancellation, moved folders, reconnect).

### Fixed

- Trip retrospective draft is now always schema-valid; a trip with no destinations degrades to a location-less experience instead of an invalid travel record.
- Index cache purges deleted files and classifies `trip_visit` correctly.
- Planner CSV export neutralizes every spreadsheet formula trigger; the map collapses repeated visits while the timeline keeps each occurrence; candidate/scheduled/shelved counts stay reconciled after merge, delete, and restore.

### Packaging

- The Obsidian plugin now publishes from a generated standalone repository (`liuh886/ownly-obsidian`) that contains only the plugin dependency closure, so the community review no longer scans the Web app or the Chrome extension. Release tags sync it automatically.

## 1.1.0 (2026-06-23)

### Added
- Added Object Experience Logs for recording usage, issues, maintenance, regrets, lessons, comparisons, and exit notes.
- Added `object log add` and `object log list` CLI commands.
- `object history --json` now includes `logs[]` alongside `reviews[]`.
- Doctor now checks object log references and object log directories.
- Added schema validation for object log event types.

### Improved
- Expanded Agent CLI documentation and data model documentation.

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
