# Planner Invariant Hardening & Full Lifecycle Authority

## Todo

- [x] 1. Lifecycle Authority: Repository `addVisit` shifts `sort_order` on insertion, `removeVisit` re-indexes `0..N-1`, and `setStaySpan` inserts at 0 with shifting
- [x] 2. Date Range & Existence Invariants: Extract `assertTripDate` / `assertTripDates` helper; enforce in BOTH `PlannerRepository` and MCP `OwnlyWriteService`
- [x] 3. Sort Order Isolation: Scope `validatePlannerDaySortOrders` strictly by `trip_id` to eliminate cross-trip pollution
- [x] 4. Planner Trip Authority: Require valid existing `trip_id` in `importCapturedPlaces` / `importResearchPlaces` and remove legacy "从 Capture 同步" button on zero-trip screen
- [x] 5. UX & State Reset: Remount / reset state in `CreateTripModal` on close/open
- [x] 6. Verification & Phase 3 Golden Path: Created automated `PlannerRepository.thailand-golden-path.test.ts` executing end-to-end trip creation, stay spans, routing, day assessment, and iCal projection; all validation suites 100% green.

## Review

### Lifecycle Authority & Invariant Hardening:
1. **Repository Sort Order Lifecycle**: `addVisit` shifts existing visits with `sort_order >= order` by `+1` on insertion, default appends at `dayVisits.length`. `removeVisit` re-indexes remaining daily visits contiguous `0..N-1`.
2. **Unified Trip Date Assertions**: Implemented `assertTripDate` and `assertTripDates` in `src/domain/planner.ts`. Enforced uniformly in `PlannerRepository` (`upsertVisit`, `addVisit`, `setStaySpan`) and MCP `OwnlyWriteService` (`prepareAddVisit`, `prepareSetStaySpan`).
3. **Cross-Trip Sort Validation Isolation**: Scoped `validatePlannerDaySortOrders` with optional `tripId` parameter and filtered accordingly in `evaluatePlannerScheduleProposal`.
4. **Authoritative Trip Requirement**: `importResearchPlaces` strictly ignores/rejects incoming places whose `trip_id` does not exist in local trips. Removed "从 Capture 同步" on zero-trip screen in `PlannerHome.tsx`.
5. **Modal Reset**: Added `key={isCreateTripOpen ? 'open' : 'closed'}` to `CreateTripModal` to cleanly remount and reset form fields on open/close.
6. **Thailand 2026 Golden Path Automated E2E**: Created `src/services/PlannerRepository.thailand-golden-path.test.ts` simulating the complete multi-city itinerary lifecycle (Bangkok + Chiang Mai, 8 places, 2 stay spans, transfer day detection, daily visit scheduling, routing legs, day feasibility evaluation, and iCal export).

## Authority

```text
Capture facts → Planner/Vault → planner-schedule.ts → MCP/User proposal → commit → iCal projection
```

Planner/Vault owns schedule facts. `planner-schedule.ts` owns deterministic time rules. `ical-pro.ts` owns projection formatting.
