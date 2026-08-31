# Capture & Planner Full-Stack UX Synergies

## Todo

- [x] 1. Capture Sidepanel UI: Friendly coverage stats (differentiating lodging prices vs non-pricing attractions)
- [x] 2. Capture Sidepanel UI: Clean candidate card badges (Google category badge, currency conversion pill, menu/reserve badges)
- [x] 3. Capture Sidepanel UI: User-selectable `kind` override in place edit modal
- [x] 4. Planner Web UI: Place card action links (call phone, menu preview, reservation, plus code) in timeline and candidate items
- [x] 5. Planner Web UI: Enhance Hotel Comparison Modal with live room rates, contact actions, and spatial metrics
- [x] 6. Comprehensive verification (`validate:extension`, `validate:fast`, build tests)
- [x] 7. Smart Sync: Unify existing place update via `mergeCapturedPlaceResearch()`, preserving tags and reservation_status
- [x] 8. Authority: Remove `resolveGoogleMapsListByUrl` legacy fallback, leaving Maps content script as sole Saved List authority
- [x] 9. Completeness: Write back resolved Place IDs to `store.detectedSavedList` and fix `observed_review_count === 0` check

## Review

Capture Module is now 100% polished and officially ready to FREEZE:
1. Unified Place Merge: Existing places in Smart Sync exclusively use `mergeCapturedPlaceResearch()`, preventing any mutation of user tags, reservation_status, notes, or signals.
2. Single Authority for Saved Lists: Deleted legacy unauthenticated entitylist fetch fallback in `api.ts`; Maps content script is now the sole source of truth.
3. Place ID Propagation: Background resolved Place IDs are written back to `store.detectedSavedList.places` so subsequent interactions immediately have native IDs.
4. Completeness Edge Cases: `observed_review_count === 0` and `observed_rating === 0` use strict undefined checks rather than falsy coercion.
5. All 119 extension unit tests and fast build suites passed with 100% green status.

## Authority

```text
Capture facts → Planner/Vault → planner-schedule.ts → MCP/User proposal → commit → iCal projection
```

Planner/Vault owns schedule facts. `planner-schedule.ts` owns deterministic time rules. `ical-pro.ts` owns projection formatting.
