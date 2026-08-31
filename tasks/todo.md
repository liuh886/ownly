# Planner Travel Core & Invariants — Phase 1

## Todo

- [x] 1. Correctness: Fix timeline stop `item.visit_id === place.visit_id` in `PlannerHome.tsx` + regression test
- [x] 2. Trip Authority: Add native "Create Trip" product entry in Planner Web UI and sync activeContext to Capture
- [x] 3. Invariants: Enforce Visit date and StaySpan dates within Trip `start_date..end_date` at Repository boundary
- [x] 4. Invariants: Enforce daily `sort_order` strictly forms contiguous `0..N-1` sequence in schedule proposals & repository
- [x] 5. Cleanup: Remove deprecated Bookings concept from MCP & repository; delete dead `migrations.ts`
- [x] 6. Verification: Run unit tests, fast validation, and regression suites

## Review

Planner Phase 1 Correctness & Hard Invariants Completed:
1. TimelineStop ID Correlation: Fixed `PlannerHome.tsx` to match timeline stops by `visit_id` / `visit occurrence identity`, correctly displaying execution times for repeat visits.
2. Planner Trip Authority: Implemented native `CreateTripModal.tsx`, providing a full "Create Trip" entry point from empty vaults and top bar, with automatic projection sync to Capture.
3. Trip Date-Range Invariants: Enforced at Repository boundary in `addVisit`, `setStaySpan`, and `upsertVisit` that visit dates must belong to the trip's `start_date..end_date`.
4. Daily Sort Order Invariant: Added domain-level validation ensuring `sort_order` forms a contiguous `0..N-1` sequence per trip day in schedule proposals.
5. Deprecated Code Cleanup: Removed legacy `Bookings` concept across MCP, CLI storage, and docs; deleted dead `migrations.ts`.
6. Verification: 119 extension tests, 49 MCP/schedule tests, and fast validation suites passed with 100% green status.

## Authority

```text
Capture facts → Planner/Vault → planner-schedule.ts → MCP/User proposal → commit → iCal projection
```

Planner/Vault owns schedule facts. `planner-schedule.ts` owns deterministic time rules. `ical-pro.ts` owns projection formatting.
