# Ownly — Systematic Technical Debt & Next Steps

> Analysis date: 2026-09-02. Generated from architecture review of recent重构 (#135–#147).

---

## P0 — Must Fix Now

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
