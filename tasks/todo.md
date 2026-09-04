# Ownly — Task Progress & Review

## Completed: Full-Codebase Quality Elevation & Technical Debt Clearance (2026-09-04)
- [x] **Phase 1: Remove Dead Files & Unreferenced Stubs**
  - [x] Deleted orphaned `src/domain/entities/` (`Place.ts`, `Trip.ts`, `Capture.ts`, `index.ts`)
  - [x] Deleted unreferenced stub re-exports: `src/domain/budget.ts`, `src/domain/stay.ts`
  - [x] Deleted unreferenced stubs: `src/services/PlannerFormatter.ts`, `src/services/PlannerDomainService.ts`, `src/domain/ownly-health.ts`
  - [x] Updated `eslint.config.mjs` to ignore `packages/*/dist/**`
- [x] **Phase 2: Latent Bug Fixes & Edge-Case Arithmetic Safety**
  - [x] **P0 Fix**: Fixed Multi-Collection Sync data contamination and accidental ACK deletions in `src/components/planner/capture-bridge.ts`
  - [x] **P1 Fix**: Fixed `syncCapture` stale closure on `selectedTripId` / `trips` in `PlannerHome.tsx`
  - [x] **P1 Fix**: Fixed Map auto-zoom filter inconsistency and missing `filterModeChanged` trigger in `PlannerMap.tsx`
  - [x] **P1 Fix**: Extracted pure spherical `calculateBounds` with cosine latitude scaling and multi-city tolerance
  - [x] **P1 Fix**: Fixed multi-currency price sorting bug in `HotelComparisonModal.tsx` (`getPlaceConvertedNumericPrice`)
  - [x] **P1 Fix**: Fixed coordinates normalization fallback `(0, 0)` bug in `src/extension/capture-state.ts`
  - [x] **P2 Fix**: Added partial-success reporting (`succeededIds`, `failedIds`) for Planner batch operations
  - [x] Guarded against division-by-zero in `src/domain/expense-payments.ts` and `src/domain/planner.ts`
- [x] **Phase 3: Clean Up Unused Imports & ESLint Warnings**
  - [x] Cleaned up unused variables and imports across domain, extension, services, obsidian, and components
  - [x] Cleaned up test files and unused variables
- [x] **Phase 4: Full Multi-Target Verification**
  - [x] `npm run validate:fast` (TypeScript + ESLint 0 errors + Terminology + Membership)
  - [x] `npm run validate:extension` (Manifest + Extension build + 153 tests)
  - [x] `npm run validate:shared` (Data portability + MCP + CLI + Parity)
  - [x] `npm run validate:obsidian` (Obsidian plugin build & package)
  - [x] `npm run build` (Next.js full production build)

---

## Completed: Interactive Buttons & UI Defect Fixes (2026-09-04)
- [x] **Fix 1: Deduplicate Sidepanel Click Listeners** (`src/extension/sidepanel/handlers.ts`, `src/extension/sidepanel/import-export.ts`)
  - Removed redundant 2nd registration of `btnSelectAllCandidates`, `btnBulkEnrich`, `btnEnrichCandidates`, `btnImportToPlanner`.
- [x] **Fix 2: Scope "Select All" to Filtered Visible Places** (`src/extension/sidepanel/handlers.ts`, `src/extension/sidepanel/ui.ts`)
  - Exported `getVisibleFilteredPlaces()` and ensured `btnSelectAllCandidates` only selects places currently visible under active filter/search query.
- [x] **Fix 3: Optimize Bulk Delete Feedback & Mode Reset** (`src/extension/sidepanel/handlers.ts`)
  - Added confirmation dialog, cleanly exit bulk mode when collection becomes empty, and immediately update UI state.
- [x] **Fix 4: Improve `btnDismissPlace` SPA Navigation Reset** (`src/extension/sidepanel/capture.ts`)
  - Automatically cleared `userDismissedPlaceUrl` when navigating to a distinct place URL on Google Maps SPA.
- [x] **Fix 5: Target Collection Alignment in `btnBatchAdd`** (`src/extension/sidepanel/handlers.ts`)
  - Fixed `btnBatchAdd` to add places to the currently active collection rather than forcing default Inbox.
- [x] **Fix 6: Guard Trip Switcher & Multi-Select Locks** (`src/components/planner/PlannerHome.tsx`)
  - Cleared selection state when switching trips; added `isBatchOperating` and `isScheduling` locks to prevent duplicate visit creations and spam-clicks.
- [x] **Fix 7: Reset File Input in Upload Modal & Repair Error Handling** (`src/components/planner/ImportCandidatesModal.tsx`, `src/components/planner/PlannerDoctorSection.tsx`)
  - Added `target.value = ''` reset on file read; added error reporting banner for failed doctor orphan repair.
- [x] **Fix 8: Verify Test Suites & Rebuild Extension** (`npm run build:extension && npm run validate:extension`)
  - All 132 extension tests and 488 total test suites pass with 0 errors; extension bundle compiled cleanly in `dist/extension/`.

---

# Systematic Technical Debt & Next Steps

### 1. Schema Version + Migration Framework
**Why:** Place model evolved from single-entity (schedule inside Place) to dual-entity (Place + Visit). All core entities lack version tracking. Old data from Obsidian vaults, imports, bundles, and Capture will break silently.

**Current state:** All entities have `schema_version: '0.1'` but no migration logic.

**What to build:**
- Add `schema_version` field to Trip, Place, Visit, Expense, Bundle
- Create `src/domain/migrations/` directory:
  - `trip_v1_to_v2.ts` — if any Trip shape changes
  - `place_v1_to_v2.ts` — move schedule fields → Visit
  - `visit_v1_to_v2.ts` — future-proof
  - `expense_v1_to_v2.ts` — add member_id references
  - `bundle_v1_to_v2.ts` — add checksum, version
- Migration runner: reads entity → checks version → applies transforms → writes back
- Wire into `PlannerRepository.list*()` — auto-migrate on read
- Tests: old-format fixture → migration → new-format assertion

**Acceptance criteria:**
- `plannerRepository.listPlaces()` auto-migrates v1 places to v2
- `parseTripBundle()` handles v1 bundles gracefully
- Test fixture with v1-format Place imports without error

---

### 2. Projection Audit (Post-Visit Architecture)
**Why:** #135 moved scheduling from Place to Visit. Every projection (Timeline, Map, Export, iCal, Stats) now needs to consume Visit correctly. Same Place visited twice = one Map marker but two Timeline entries.

**Current state:** #137 fixed Map dedup. Other projections may still duplicate.

**Audit matrix:**

| Projection | Should be based on | Dedup needed? | Status |
|---|---|---|---|
| Timeline | Visit (each occurrence) | No | ✅ |
| Map | Place + Visit filter | Yes — collapse repeated | ✅ #137 |
| Calendar/iCal | Visit | No | ✅ |
| Route/legs | Visit sequence | No | ✅ |
| Statistics | Place unique | Yes | ⚠️ check |
| Export PDF/Markdown | Visit | No | ⚠️ check |
| Budget estimates | Place (per-visit pricing) | Context-dependent | ⚠️ check |

**Action:** Go through each consumer of `scheduledAll` / `materializePlannerScheduledPlaces` and verify it handles repeated Place correctly.

---

### 3. Golden Dataset Regression Tests
**Why:** Recent model changes (Place→Visit, expense payments, bundle share) are covered by unit tests but lack an end-to-end regression fixture. AI-generated code changes risk breaking the full pipeline.

**What to build:**
```
test-fixtures/thailand-2026/
  ├── raw-capture.json        # Capture extension output
  ├── places.json             # Expected Place entities
  ├── visits.json             # Expected Visit entities
  ├── expenses.json           # Expected Expense entities
  ├── bundle.json             # Expected shareable bundle
  └── expected-ics.ics        # Expected iCal output
```

**Test script:**
```
Capture import → Planner ingest → Schedule visits → Add expenses → Export iCal → Bundle share → Re-import
```

Each step asserts output matches fixture. Runs on every CI.

**Acceptance criteria:**
- `npm run validate:golden` passes
- Test catches: Place model regression, Visit ordering bug, iCal UID breakage, Bundle import ID collision

---

## P1 — Should Fix Soon

### 4. Identity Debug / Merge History
**Why:** Place Identity Authority (#142) prevents bad merges but provides no user-facing explanation. Users will ask "why weren't these merged?" or "why are these two places?"

**What to build:**
- Dev-mode overlay on Place card:
  ```
  Identity
  ├── Google Place ID: ChIJ_xxx
  ├── Matched by: Google ID
  ├── Confidence: 100%
  └── Alternative candidates: [list]
  ```
- Merge history on Trip: log of `mergePlaces()` calls with before/after
- Similar to Git merge conflict UI

**Why now:** Capture data volume is increasing. Debugging identity issues without this tool will be painful.

---

### 5. Capture Enrichment Status
**Why:** Places have different levels of completeness depending on enrichment source. Users can't tell why one Place has ratings/prices and another doesn't.

**Current Place states:** `candidate`, `captured`, `planned`, `shelved`, `duplicate`, `ignored`

**Proposed enrichment pipeline:**
```
Captured → Enriched → Verified → Planned
```

**UI indicators per Place:**
```
Google Maps ✓  |  Rating ✓  |  Price ✓  |  Address ✓
```

**What to build:**
- Add `enrichment_status` field to Place: `'raw' | 'enriched' | 'verified'`
- Track which enrichment sources have been applied (Google detail, reviews, etc.)
- Show enrichment completeness badge on Place card
- Wire into Capture import flow: mark as `raw` on import, `enriched` after detail fetch

---

### 6. TripMember Model
**Why:** Expense payments reference member by string name. "小明", "Xiao Ming", "xm" could be 3 different people. No canonical member identity.

**Current state:**
- `Trip.members: string[]`
- `Expense.payments: [{member: string, amount: number}]`

**Proposed:**
```typescript
interface TripMember {
  id: string;
  name: string;
  avatar?: string;
}

interface Trip {
  members: TripMember[];
}

interface TripExpenseItem {
  payer_id: string;
  payments: Array<{ member_id: string; amount: number }>;
}
```

**Migration path:** Keep backward compat — if `members` is string[], auto-convert to `TripMember[]` with generated IDs.

---

## P2 — Nice to Have

### 7. Share Bundle Checksum + Version
**Why:** URL sharing (`#ownly-trip=xxxx`) is fragile. Chat apps truncate long URLs. Bundle files can be corrupted.

**What to build:**
- Add to bundle:
  ```json
  {
    "bundle_version": 2,
    "checksum": "sha256:xxx",
    "created_at": "2026-09-02T..."
  }
  ```
- On import: verify checksum, check version compatibility
- On URL import: detect truncation (expected length vs actual)
- Show warning: "Bundle may be truncated" if size mismatch

---

### 8. State Simplification UI
**Why:** State explosion across Place/Trip/Expense creates confusing badges and filters.

**Current states (user-visible):**

| Entity | States |
|---|---|
| Place | candidate, captured, planned, shelved, duplicate, ignored |
| Trip | draft, planning, completed, shared, imported |
| Expense | pending, settled, partial |

**Proposed simplification (user-facing only):**

| Entity | User sees | Internal |
|---|---|---|
| Place | 未规划 / 已加入行程 | candidate, captured, planned, shelved, ... |
| Trip | 规划中 / 已完成 | draft, planning, completed, shared, imported |
| Expense | 待结算 / 已结清 | pending, settled, partial |

Keep full state internally; simplify in filter chips and badges.

---

## Priority Summary

| Priority | Item | Effort | Impact |
|---|---|---|---|
| **P0** | Schema version + migration | Medium | Prevents data loss |
| **P0** | Projection audit | Low | Correctness |
| **P0** | Golden dataset regression | Medium | Prevents regressions |
| **P1** | Identity debug tool | Medium | Developer experience |
| **P1** | Capture enrichment status | Low | User clarity |
| **P1** | TripMember model | Medium | Data integrity |
| **P2** | Bundle checksum/version | Low | Share robustness |
| **P2** | State simplification UI | Low | UX clarity |
