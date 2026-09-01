# Planner Research Pool Tri-Layering & Shelve/Restore (暂不考虑 / 重新考虑)

## Todo

- [x] 1. Repository & MCP: Add `restorePlace(placeId)` in `PlannerRepository` and `prepareRestorePlannerPlace(placeId)` in `OwnlyWriteService`
- [x] 2. MCP Registration: Register `ownly_planner_prepare_restore_place` tool in MCP server
- [x] 3. Hotel Comparison UX: Update wording from "移出比选" to "暂不考虑" in `HotelComparisonModal.tsx`
- [x] 4. Research Pool Tri-Layering: Implement 3 visual layers in `PlannerHome.tsx` (待安排, 已安排 N ▸, 暂不考虑 N ▸) with "暂不考虑" and "重新考虑" actions
- [x] 5. Unit Tests: Add test cases for restore in `PlannerRepository.schedule.test.ts` and `ownly-write-service.test.ts`
- [x] 6. Verification: Run `validate:fast`, `test:mcp`, and `validate:extension` to ensure 100% green suites

## Review

### Research Pool Tri-Layering & Shelve/Restore (暂不考虑 / 重新考虑):
1. **Zero Schema Migration & State Invariants**:
   - Persisted states remain strictly `candidate` vs `dropped`.
   - `已安排` (Scheduled) is 100% derived from `visits.some(v => v.place_id === place.id)` without mutating the reusable `Place` fact.
2. **Tri-Layer Research Pool Visual Hierarchy**:
   - **Layer 1: 待安排 (Pending Scheduling)**: Active candidate cards grid (`state === 'candidate' && scheduledCount === 0`) with `+ 当天` and `暂不考虑` (Shelve) buttons.
   - **Layer 2: 已安排地点 (Scheduled Places)**: Collapsible section (`isScheduledCollapsed`, default collapsed) showing scheduled places with `✓ 已排 N 次` badge and `+ 当天` button for multi-day scheduling.
   - **Layer 3: 暂不考虑 (Shelved Places)**: Collapsible section (`isDroppedCollapsed`, default collapsed) preserving all facts in Vault and providing a one-click `↩️ 重新考虑` (Restore) button.
3. **Unified Vocabulary & Hotel Comparison**:
   - Replaced all legacy "移出比选" / "drop" user wording with "暂不考虑" (Shelve / Skip for now).
   - In `HotelComparisonModal`, selecting a hotel creates Stay Visits without touching or auto-dropping any other hotels. Shelving a hotel removes it from comparison while preserving it in the Vault.
4. **Authoritative Persistence & MCP Support**:
   - Added `restorePlace(placeId)` in `PlannerRepository` and `prepareRestorePlannerPlace(placeId)` in `OwnlyWriteService`.
   - Registered `ownly_planner_prepare_restore_place` tool in MCP server.
5. **Testing & Verification**:
   - Added unit test cases for shelving and restoring in `PlannerRepository.schedule.test.ts` and `ownly-write-service.test.ts`.
   - All validation suites (`validate:fast`, `validate:shared`, `test:mcp`, `validate:extension`) passed 100% green.

## Authority

```text
Capture facts → Planner/Vault → planner-schedule.ts → MCP/User proposal → commit → iCal projection
```

Planner/Vault owns schedule facts. `planner-schedule.ts` owns deterministic time rules. `ical-pro.ts` owns projection formatting.
