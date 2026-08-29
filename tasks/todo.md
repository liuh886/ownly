# Planner Timing UX — PR #129

## Completed

- [x] Add manual `scheduled_start` + `duration_minutes` editing without creating a second time authority.
- [x] Keep all exact timing validation and overlap detection in `src/domain/planner-schedule.ts`.
- [x] Detect nested/all-pair overlaps, not only adjacent sorted intervals.
- [x] Reuse the same overlap facts in Web and MCP trip diagnostics.
- [x] Reject invalid time/duration and ordinary cross-midnight manual writes at repository boundary.
- [x] Re-read canonical Planner/Vault state before writing `.itinerary.md`.
- [x] Keep iCal Pro as one-way projection; calendar client refresh timing is external.
- [x] Make the timing modal usable on small/mobile viewports.
- [x] Keep scenario prompts as preferences; do not fabricate sunset time or missing schedule facts.

## Authority

```text
Capture facts → Planner/Vault → planner-schedule.ts → MCP/User proposal → commit → iCal projection
```

Planner/Vault owns schedule facts. `planner-schedule.ts` owns deterministic time rules. `ical-pro.ts` owns projection formatting.
