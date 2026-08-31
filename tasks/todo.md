# Capture & Planner Full-Stack UX Synergies

## Todo

- [x] 1. Capture Sidepanel UI: Friendly coverage stats (differentiating lodging prices vs non-pricing attractions)
- [x] 2. Capture Sidepanel UI: Clean candidate card badges (Google category badge, currency conversion pill, menu/reserve badges)
- [x] 3. Capture Sidepanel UI: User-selectable `kind` override in place edit modal
- [x] 4. Planner Web UI: Place card action links (call phone, menu preview, reservation, plus code) in timeline and candidate items
- [x] 5. Planner Web UI: Enhance Hotel Comparison Modal with live room rates, contact actions, and spatial metrics
- [x] 6. Comprehensive verification (`validate:extension`, `validate:fast`, build tests)

## Review

All 6 full-stack UX improvements have been successfully completed:
1. Capture Sidepanel: Coverage string explicitly clarifies lodging pricing (e.g., `价格 20/46 (含住宿 20/20)`), removing false ambiguity.
2. Candidate Cards: Official Google category badges displayed; phone number kept in data object and hidden from list for clean aesthetics.
3. User Decision Authority: Preserved user `kind` choices; enrichment remains strictly facts-only.
4. Planner Web UI: Added native action badges (phone call, official menu, table reservation, Google Maps link) across timeline stop items and candidate pool items.
5. Hotel Comparison Modal: Added hotel address, direct contact calling, reservation and maps links alongside multi-night proximity metrics.
6. All fast validation checks and extension test suites passed with 100% green status.

## Authority

```text
Capture facts → Planner/Vault → planner-schedule.ts → MCP/User proposal → commit → iCal projection
```

Planner/Vault owns schedule facts. `planner-schedule.ts` owns deterministic time rules. `ical-pro.ts` owns projection formatting.
