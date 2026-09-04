# Ownly — Task Progress & Review

## Completed: Hotel Opening Year & Renovation Facts Extraction (2026-09-04)
- [x] **1. DOM Extraction & Multilingual Pattern Matching**
  - Analyzed DOM structures across Google Maps (About tab, editorial summaries, JSON-LD), Google Travel (Property overview chips & amenities), and Booking.com (Description fine print & facilities).
  - Implemented `extractHotelPropertyFacts(textOrSnippet?, doc?)` in [`src/extension/utils.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/utils.ts) parsing:
    - `opened_year`: Opening/Built/Established year in Chinese (`2022年全新开业`, `自2021年开始接待客人`, `始建于2019`) and English (`Opened in 2022`, `Built in 2020`, `Established in 1998`, `Welcoming guests since Dec 2019`, JSON-LD `foundingDate`/`dateCreated`).
    - `renovated_year`: Renovation year in Chinese (`2024年重新装修`, `最近装修：2023年`) and English (`Renovated in 2023`, `Refurbished in 2024`).
    - `room_count`: Total room/suite count (`120 间客房`, `85 rooms`, JSON-LD `numberOfRooms`).
    - `check_in` / `check_out`: Times (`15:00` / `12:00`, `Check-in from 14:00, check-out until 11:00`).
- [x] **2. Domain Model & Signal Automation**
  - Defined unified `HotelPropertyFacts` in [`src/domain/planner.ts`](file:///D:/Documents/GitHub/Ownly/src/domain/planner.ts).
  - Preserved `hotel_facts` on `CapturePlace`, `PlannerTripPlace`, `PlannerScheduledPlace`, and `CurrentResearchPlace`.
  - Implemented `deriveHotelSignals(facts)` to automatically generate user-facing badges (e.g. `🆕 2024年开业 (新开业)`, `📅 2019年开业`, `✨ 2025年新装修`, `🔨 2018年装修`).
  - Automatically populated badges into `signals` upon capturing or converting places into Planner candidates.
- [x] **3. UI Presentation in Hotel Comparison Modal**
  - Updated [`src/components/planner/HotelComparisonModal.tsx`](file:///D:/Documents/GitHub/Ownly/src/components/planner/HotelComparisonModal.tsx) to display `📅 ${opened_year} 开业` and `✨ ${renovated_year} 装修` badges in both the Table view (under Category) and the Grid Card view.
- [x] **4. Comprehensive Unit Tests & Validation**
  - Added unit test suite in [`src/extension/utils.test.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/utils.test.ts) covering Chinese, English, Booking.com formats, and signal generation.
  - Validated with `npm run validate:extension` (159/159 tests passed, extension build clean).
  - Validated with `npm run validate:fast` (0 errors, clean lint & types).

## Completed: Google Travel Provider & In-Page Quick Capture FAB (2026-09-04)
- [x] **1. Clarify `.bz` ccTLD & Google Travel Architecture**
  - Clarified that `.bz` is Belize's ccTLD (Google regional portal), where Google Travel hotel searches often route.
  - Authored [`docs/CAPTURE_PRODUCT_RFC.md`](file:///D:/Documents/GitHub/Ownly/docs/CAPTURE_PRODUCT_RFC.md) formally defining the mental model: "Inbox 是案板 (Staging Area for raw scraping & grooming) -> Planner 是下锅 (Trip Itinerary & Budget)".
  - Logged tracking RFC issues (#CAPTURE-RFC-01 ~ 04) for future sync decoupling without breaking current single-source-of-truth invariants.
- [x] **2. Implement Google Travel Place Extractor**
  - Updated [`extension/manifest.json`](file:///D:/Documents/GitHub/Ownly/extension/manifest.json) `host_permissions` and `content_scripts` to cover `google.com/travel/*`, `google.com.bz/*`, `google.co.th/travel/*`, and major regional ccTLDs.
  - Added `'google_travel'` to [`src/domain/planner.ts`](file:///D:/Documents/GitHub/Ownly/src/domain/planner.ts) `PlannerPlaceSourceProvider` and `inferSourceProvider()`.
  - Added `'google_travel'` to [`src/domain/capture.ts`](file:///D:/Documents/GitHub/Ownly/src/domain/capture.ts) `CaptureSourceProvider`.
  - Added `google_travel: { emoji: '✈️', label: 'Google Travel' }` to [`src/extension/sidepanel/ui.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/sidepanel/ui.ts).
  - Implemented `extractGoogleTravelPlace()` in [`src/extension/content.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/content.ts) parsing hotel title, rating, review count, nightly pricing, currency detection, address/neighborhood, coordinates, entity ID, and amenities.
- [x] **3. Implement In-Page Quick Capture Floating Ball (FAB)**
  - Injected Shadow-DOM encapsulated floating pill button (`#ownly-quick-capture-fab-root`) in [`src/extension/content.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/content.ts) on all supported travel/map sites.
  - Added states: `idle` (`📌 放入案板`), `loading` (`⏳ 采集中...`), `success` (`✓ 已放入案板`), `error` (`⚠️ 未检测到地点`).
  - Implemented atomic worker storage handler `OWNLY_QUICK_SAVE_PLACE` in [`src/extension/background.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/background.ts) saving directly into the active Inbox collection ("案板") with background badge feedback (`✓`).
- [x] **4. Verification & Validation**
  - Added unit test cases for `google_travel` in [`src/domain/planner.test.ts`](file:///D:/Documents/GitHub/Ownly/src/domain/planner.test.ts).
  - Validated with `npm run validate:extension` (155/155 tests passed, extension build clean).
  - Validated with `npm run validate:fast` (0 errors, clean lint & types).
  - Validated with `npm run validate:shared` (100% contracts & MCP passing).

---

## Completed: UI Polish & Unified Recognition/Edit Experience (2026-09-04)
- [x] **1. Save Button Visual Polish & High Contrast**
  - Updated `--primary` from dark black (`#1c1917`) to vibrant Ownly emerald green (`#047857` / `#059669`) in [`extension/sidepanel.css`](file:///D:/Documents/GitHub/Ownly/extension/sidepanel.css).
  - Ensured white text (`#ffffff`) has crisp, sharp contrast and subtle shadow so button labels ("➕ 加入候选池", "✓ 更新地点信息") are immediately readable.
- [x] **2. Unify Card Editing into Single Authoritative Panel**
  - Removed confusing duplicate inline edit box (`buildInlineEditor`) inside Inbox cards.
  - Clicking ✏️ on any card in Inbox now loads the place into the top `#placePanel` / `#captureForm`, opens `#addPanel`, scrolls to it, and gives the user ONE single authoritative Save button (`#btnCaptureSubmit`).
  - Active card in Inbox receives `.is-active-editing` highlight badge (`✏️ 编辑中`) with clean emerald border.
- [x] **3. Code Cleanup & Verification**
  - Cleaned up obsolete inline action listeners (`save-inline`, `cancel-inline`) and unused helper functions.
  - Verified with `npm run validate:extension` (155/155 tests passed) and `npm run validate:fast` (0 errors).

---

## Completed: Currency Detection & Override Propagation Fix (2026-09-04)
- [x] **1. Root Cause Analysis & Confirmation**
  - Clarified why Google Maps hotel pages in English UI output bare `$84` without explicit `SGD` token in the DOM.
  - Identified that `extractGoogleMapsPlace()` in `content.ts` did not pass `overrideCurrency` / `targetCurrency` into `detectCurrencyFromPage()`.
  - Discovered that bare `$` with non-dollar regional coordinates (e.g. Pattaya, Thailand) defaulted to `'USD'` in `currency-detector.ts`.
  - Found that `sidepanel/capture.ts` line 134 ternary bypassed user override if place had existing `detectedCurrency`.
- [x] **2. Implement Fixes**
  - Updated `src/extension/content.ts` to pass `overrideCurrency` and `targetCurrency` through `currentPlace()`, `extractGoogleMapsPlace()`, and `enrichFromPlaceHtml()`.
  - Updated `src/extension/sidepanel/capture.ts` to ensure `store.mapCurrencyOverride` takes top precedence in `store.currentPlace` and `store.detectedSavedList`.
  - Updated `src/extension/sidepanel/handlers.ts` to ensure `store.mapCurrencyOverride` is prioritized in `buildPlaceFromDetected` and price normalizers.
- [x] **3. Write Tests & Verification**
  - Added test cases in `src/extension/currency-detector.test.ts` for bare `$84` in Pattaya with `overrideCurrency: 'SGD'` and `hintCurrency: 'SGD'`.
  - Validated with `npm run validate:extension` (155/155 passed), `npm run validate:fast` (0 errors), and `npx vitest run` (512/512 passed across 59 test suites).

---

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
