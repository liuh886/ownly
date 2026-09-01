# Planner + Capture Final Release Readiness

## Scope

This is the final functional-completion pass before the next Ownly release. The goal is not to expand the product. The goal is to make the existing Capture → Planner → Timeline → Maps/exports loop trustworthy, complete, responsive, and testable.

The release is blocked by correctness or broken interaction, not by missing future features.

Explicitly out of scope until after release: AI planner expansion, collaboration/shared editing, booking/payment integrations, additional map/review providers, new discovery surfaces, and major Planner information-architecture redesign.

## P0 — Data integrity and Place Identity

- [x] Establish one Place Identity Authority for automatic entity merge.
- [x] Strong identity evidence is limited to provider identity: Google feature/source ID, normalized CID, and Google Place ID.
- [x] Remove title-based automatic import merge.
- [x] Remove title-based automatic deduplication.
- [x] Do not use title, category, coordinates, or ordinary display URLs as automatic identity.
- [x] Keep title, phone, and proximity as suspected-duplicate evidence only.
- [x] Suppress weak duplicate suggestions when comparable explicit strong identities prove the places are different.
- [x] Remove bulk auto-merge of suspected duplicates. Suspected pairs require explicit per-pair Merge / Ignore review.
- [x] Reject cross-trip manual merges.
- [x] Keep shelved places visible and recoverable instead of silently removing them from the Planner surface.
- [ ] Add sync reconciliation output: captured, created, updated, strong-ID merged, rejected.
- [ ] Warn visibly if Capture acknowledgement count differs from Planner reconciliation count.
- [ ] Add regression fixtures for airports, hotel branches, restaurant branches, same-title/different-ID, and same-CID/different-title.

## P0 — Capture reliability

- [ ] Verify single-place Capture and saved-list Capture emit the same canonical Planner fields.
- [ ] Keep Place ID/CID provenance in diagnostics only; do not expose internal identity in normal cards.
- [x] Enrichment never resolves identity from titles or promotes free-form notes into objective identity/price facts.
- [x] Price and other source extras remain optional; missing price no longer keeps food/stay in perpetual incomplete state.
- [ ] Verify retry, offline, Google session expiry, and extension restart do not lose pending captures.
- [ ] Add real Google Maps regression fixtures for Bangkok/Chiang Mai hotel, food, cafe, attraction, transit, and airport entities.
- [x] Saved-list enrichment attaches returned facts only to verified feature IDs; title-keyed fact scavenging is removed.

## P0 — Planner state model and core interactions

- [x] Scheduled Places remain in Candidate Pool and show visit count.
- [x] Shelved / 暂不考虑 is a first-class filter beside Must / Want.
- [x] Shelved cards provide Restore / 取回 instead of Shelve.
- [x] Schedule, Shelve, and Delete actions live in one compact card footer.
- [x] Phone is icon-only in card UI; number remains available via tooltip and `tel:` target.
- [ ] Verify Candidate → Scheduled → Shelved state restrictions and all user-facing error messages.
- [ ] Verify repeat scheduling of one Place on the same day and across days never duplicates or consumes the Place entity.
- [ ] Verify Drop/Delete cannot orphan Visits, Legs, hotel spans, or exported events.
- [ ] Reconcile all Candidate/Shelved/Scheduled counts with repository state after sync, filter, search, restore, merge, and delete.
- [ ] Verify all empty states accurately explain why no cards are visible.

## P0 — Suspected Duplicate review flow

The formal flow is:

```text
Strong identity match
        ↓
Automatic merge

Known conflicting strong identity
        ↓
Never merge / suppress weak duplicate suggestion

No decisive strong identity + weak similarity
        ↓
Suspected Duplicate Review
        ↓
User chooses Merge or Ignore
```

Release checks:

- [x] No bulk “merge all suspected” path remains.
- [x] Per-pair manual merge remains available.
- [x] Persist Ignore decisions on the Trip; an ignored pair does not reappear after reload.
- [x] Show concise review evidence for each pair: reason, match score, and distance when available.
- [ ] Ensure a merge preserves the preferred primary Place, facts, all Visits, and canonical identity.
- [ ] Add tests for one Place appearing in multiple weak pairs so review cannot create stale pair references after a merge.

## P1 — Planner card and mobile interaction completion

- [ ] Test 360 px, 390 px, and 430 px widths: no clipped title/action area, horizontal scroll, or unreachable control.
- [ ] Verify card tap, drag, external links, action buttons, and multi-select do not conflict on touch devices.
- [ ] Normalize tooltip and accessible-label behavior for phone, map, menu, reserve, schedule, shelve, restore, and delete.
- [ ] Keep `source_category`, Planner `kind`, user tags, signals, risks, rating, and price visually distinct and non-redundant.
- [ ] Verify filtered Shelved cards cannot be accidentally dragged or scheduled before Restore.
- [ ] Verify map hover/highlight ↔ card highlight ↔ timeline selection remains consistent after filter/state changes.

## P1 — Timeline, routing, hotel, and schedule correctness

- [ ] Verify add/remove/reorder, locked Visits, timing edits, and repeated occurrences.
- [ ] Verify opening-hours warnings and travel conflicts do not treat missing optional facts as hard failures.
- [ ] Verify hotel stay spans, check-out/check-in transfer days, and hotel replacement leave no stale Visits.
- [ ] Verify map projection collapses repeated Visits for one Place while the timeline retains every occurrence.
- [ ] Verify route links and segmentation for walking, transit, cycling, and driving where supported.
- [ ] Verify timing modal changes persist after reload and exports use Visit timing rather than Place defaults.

## P1 — Persistence, export, and runtime parity

- [ ] Round-trip Trip / Place / Visit / Leg / Expense Markdown without field loss.
- [ ] Verify CSV, KML, Markdown, and ICS exports with multilingual text and formula-safe CSV cells.
- [ ] Verify Web local data, Obsidian workspace, extension Capture, CLI, and MCP read the same canonical Place/Visit semantics.
- [ ] Verify backup/restore and browser reload preserve Trips, shelved state, Visits, expenses, and pending Capture queue.
- [ ] Verify a strong-identity merge does not leave duplicate Markdown Place files or stale Visit references.

## P1 — Existing modal and auxiliary-feature completion

No new modal/features should be introduced for this release. Existing ones must be completed:

- [ ] Import Candidates: duplicate handling, counts, cancellation, and retry.
- [ ] Place Timing: validation, persistence, repeated Visit targeting.
- [ ] Hotel Comparison: select/drop behavior and stay-span consistency.
- [ ] Calendar Subscription: Free/Pro state, publish/rotate/disable, and generated ICS consistency.
- [ ] Create Trip: validation, default selection, and immediate Capture context update.
- [ ] Duplicate Review: Merge/Ignore, evidence clarity, stale-pair refresh.
- [ ] Budget/ledger: reload persistence, member updates, currency conversion, and deletion.

## P2 — Release polish only

These are allowed only after P0/P1 correctness is green:

- [ ] Copy consistency in Chinese/English.
- [ ] Tooltip wording and icon consistency.
- [ ] Loading/disabled/busy states for all mutations.
- [ ] Error notices should identify the failed action and preserve previous state.
- [ ] Remove dead UI state, obsolete comments, unused helpers, and duplicate semantic validators encountered during completion work.
- [ ] Keep PlannerHome modularization limited to extraction that reduces risk; do not trigger a broad redesign before release.

## Automated release gates

All must be green before tagging:

1. `npm run validate:fast`
2. `npm run validate:shared`
3. `npm run validate:web`
4. `npm run validate:obsidian`
5. `npm run validate:extension`
6. Planner Thailand golden path
7. Place Identity Authority regression tests
8. Capture saved-list / enrichment regression tests

## Manual golden path

Run on desktop and mobile viewport before release:

1. Create/select a trip.
2. Capture a mixed Google Maps set containing hotel, restaurant, cafe, attraction, airport/transit, and at least two same-name/different-branch places.
3. Sync and reconcile Capture count against Planner result.
4. Confirm no place silently disappears and no title-only entity is automatically merged.
5. Review suspected duplicates: Merge one true duplicate, Ignore one false positive.
6. Schedule one Place multiple times, including across days.
7. Shelve and Restore places from the first-class Shelved filter.
8. Edit timing and reorder Visits.
9. Exercise hotel stay-span and a transfer day.
10. Check map projection and route links.
11. Export Markdown / CSV / KML / ICS.
12. Reload/reopen workspace and confirm state parity.

## Release decision rule

Do not release while any of the following remains:

- Silent record loss or unexplained Capture/Planner count mismatch.
- Any title-based automatic merge path.
- Weak suspected duplicates that can auto-merge without explicit user action.
- Orphaned Visits or stale Place references after merge/delete/drop.
- Broken Candidate/Shelved/Scheduled state transitions.
- A reproducible mobile interaction blocker in the core Planner flow.
- Any failing P0 regression or release gate.
