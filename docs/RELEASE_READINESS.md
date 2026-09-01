# Ownly Release Readiness — Final Functional Completion Plan

## Release principle

This release is a completion pass, not a feature expansion. Scope is limited to making the existing Capture → Planner → Timeline → Maps/exports loop trustworthy, understandable, responsive, and testable. AI planning expansion, collaboration, booking, additional providers, and new product surfaces are deferred until after release.

## P0 — Data integrity and identity authority

- [x] Establish one strong Place Identity Authority.
- [x] Remove title-based automatic import merge and title-based automatic deduplication.
- [x] Keep title/phone/proximity similarity as review evidence only.
- [x] Suppress weak duplicate suggestions when explicit comparable Place IDs conflict.
- [x] Remove bulk auto-merge of suspected duplicates; keep per-pair Merge / Ignore review.
- [x] Keep shelved places visible and recoverable instead of silently disappearing.
- [ ] Add sync reconciliation: captured records, created places, updated places, strong-ID merges, rejected records.
- [ ] Show a visible warning when Capture acknowledgement differs from Planner reconciliation.
- [ ] Add golden fixtures for airport, hotel branch, restaurant branch, same-title/different-ID, same-CID/different-title.

## P0 — Capture reliability

- [ ] Verify single-place capture and saved-list capture produce the same canonical fields.
- [ ] Keep identity provenance in diagnostics, never normal cards.
- [ ] Confirm enrichment never promotes title, free-form notes, or arbitrary payload strings into objective price/identity facts.
- [ ] Treat optional Google facts as optional, not perpetual incomplete state.
- [ ] Exercise retry/offline/session-expiry behavior without losing pending captures.
- [ ] Run extension fixtures across Bangkok/Chiang Mai hotels, food, cafes, attractions, transit/airports.

## P0 — Planner state model and core interactions

- [x] Candidate pool retains scheduled places and marks visit count.
- [x] Shelved places sit beside Must/Want as a first-class filter and support Restore.
- [x] Schedule / Shelve / Delete share one compact card footer; phone is icon-only with tooltip.
- [ ] Verify Candidate → Scheduled → Shelved restrictions and error messages for every state transition.
- [ ] Verify repeated visits on same day and across days never duplicate or consume the Place entity.
- [ ] Verify delete/drop cannot orphan visits, legs, hotel spans, or exports.
- [ ] Audit all empty states, counts, filter counts, search results, and notices against repository state.

## P1 — Planner UI completion and mobile interaction

- [ ] Test 360/390/430 px widths: no clipped titles, action overflow, horizontal scroll, or unreachable controls.
- [ ] Ensure card tap, drag, buttons, links, and multi-select do not conflict on touch devices.
- [ ] Normalize tooltips/accessibility labels for phone, map, menu, reserve, schedule, shelve, restore, delete.
- [ ] Keep source category, user tags, signals, risks, rating, and price distinct and non-redundant.
- [ ] Verify map highlight ↔ card highlight ↔ timeline selection after filters and state changes.
- [ ] Verify modal focus/close behavior for Import, Timing, Hotel Compare, Calendar, Create Trip, Duplicate Review.

## P1 — Timeline, routing, hotel and schedule correctness

- [ ] Verify visit ordering, insert/remove/reorder, locked visits, timing edits, repeated occurrences.
- [ ] Verify opening-hours warnings and travel conflicts do not block valid schedules with missing optional facts.
- [ ] Verify hotel stay spans, transfer days, and hotel replacement leave no stale visits.
- [ ] Verify map projection deduplicates repeated visits while timeline keeps every occurrence.
- [ ] Verify route links/segmentation for walking, transit, and driving.

## P1 — Export, local-first persistence and parity

- [ ] Round-trip Trip / Place / Visit / Leg / Expense Markdown without field loss.
- [ ] Verify CSV, KML, Markdown, ICS exports with multilingual text and formula-safe CSV cells.
- [ ] Verify web local storage, Obsidian, extension, CLI/MCP share canonical data semantics.
- [ ] Verify backup/restore and reload preserve trips, shelved state, visits, expenses, and pending capture queue.

## Release gates

Release only when all are green:

1. `npm run validate:fast`
2. `npm run validate:shared`
3. `npm run validate:web`
4. `npm run validate:obsidian`
5. `npm run validate:extension`
6. Thailand golden path plus Place Identity regression fixtures
7. Manual desktop + mobile golden path: Capture mixed POIs → reconcile sync → filter/shelve/restore → repeated schedule → route/map → export → reload
8. No silent record loss, no title-based auto-merge, no unresolved P0 issue

## Explicitly deferred until after release

- AI proposal/planner expansion
- Collaboration/shared editing
- Booking/payment integrations
- Additional map/review providers
- New recommendation/discovery surfaces
- Major Planner information-architecture redesign
