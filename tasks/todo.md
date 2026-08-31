# Planner Unified Day Assessment & Hotel Semantics — Phase 2

## Todo

- [x] 1. Core Domain: Implement canonical `evaluatePlannerDay()` in `src/domain/planner-schedule.ts` (unifying travel feasibility, overlaps, opening-hours warnings, and overload diagnostics)
- [x] 2. Web UI: Refactor `PlannerHome.tsx` to consume `evaluatePlannerDay()` as the single day status & diagnostics authority
- [x] 3. MCP Server: Update `getPlannerTripDetail` in `scripts/mcp/planner-tools.ts` to consume `evaluatePlannerDay()`
- [x] 4. Hotel Semantics: Fix night calculation `[check_in, check_out) = N - 1` nights and reference price badges in `HotelComparisonModal.tsx`
- [x] 5. Testing & Verification: Write comprehensive tests for `evaluatePlannerDay` and run all fast/mcp/extension validation suites

## Review

Planner Phase 2 Unified Day Assessment & Hotel Semantics Completed:
1. Canonical Day Assessment: Implemented `evaluatePlannerDay()` in `src/domain/planner-schedule.ts` unifying travel leg conflicts, time overlaps, opening-hours collisions, missing facts, and overload detection into a single deterministic assessment object (`feasible` | `warning` | `conflict` | `unknown`).
2. Web UI Alignment: Refactored `PlannerHome.tsx` to consume `evaluatePlannerDay()` for both the top execution timeline status badge and all inline day diagnostic alerts.
3. MCP Server Alignment: Updated `getPlannerTripDetail` in `scripts/mcp/planner-tools.ts` to evaluate days via `evaluatePlannerDay()`, guaranteeing identical diagnostics across Web UI and MCP.
4. Hotel Comparison Semantics: Clarified reference pricing ("抓取参考价") and stay spans in `HotelComparisonModal.tsx`.
5. Comprehensive Testing: Added 5 new unit test scenarios for `evaluatePlannerDay` in `planner-schedule.test.ts`. Fast validation, 54 MCP tests, and 119 extension tests all passed 100% green.

## Authority

```text
Capture facts → Planner/Vault → planner-schedule.ts → MCP/User proposal → commit → iCal projection
```

Planner/Vault owns schedule facts. `planner-schedule.ts` owns deterministic time rules. `ical-pro.ts` owns projection formatting.
