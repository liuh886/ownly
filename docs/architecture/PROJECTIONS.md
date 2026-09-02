# Projection Matrix

Projections are deterministic derivations from source entities. They carry no version. Source entities own truth.

## Matrix

| Projection | Authority | Source | Dedup Strategy | Use Case |
|-----------|-----------|--------|----------------|----------|
| **Timeline** | Visit | `materializePlannerScheduledPlaces()` | None — every Visit is a row | Day view, schedule editing |
| **Map** | Place | Filter `scheduledAll` by `place_id` | Deduplicated by `place_id` — one pin per Place | Spatial view |
| **Calendar** | Visit | `buildTripCalendarIcs()` / `buildDayCalendarIcs()` | None — one VEVENT per Visit (UID = `visit:{id}`) | iCal export |
| **Export** | Visit | Markdown / KML / CSV export | Caller decides (day-level keeps all, trip-level deduplicates) | External sharing |
| **Search** | Place | Future: search index | By `place_id` — one result per Place | "Find Kyoto Temple" |
| **Recommendation** | Place | Future: ranking engine | By `place_id` — weight Place, not Visit | "You might also like" |
| **Budget** | TripMember + Visit | `PlannerBudgetLedger` | Per Visit occurrence — same Place twice = two budget rows | Expense tracking |
| **Navigation** | Visit | Google Maps route builder | By Visit (stops in order) | Directions URL |

## Rules

### 1. No Version on Projections

Projections are re-derived every time source entities change. Adding a version to a projection creates a second source of truth, which inevitably diverges.

```
✅  source entities  →  deterministic projection
❌  source entities  →  projection  →  version check
```

### 2. One Authority Per Concern

| Concern | Authority |
|---------|-----------|
| Where is this place? | Place |
| When do I visit? | Visit |
| How do I get there? | TripLeg |
| What did it cost? | Expense |
| Who paid? | Expense.payments |

### 3. Spatial vs Temporal

- **Map** is spatial: same Place = one pin. Deduplicate by `place_id`.
- **Timeline** is temporal: same Place on two days = two entries. Preserve all Visits.
- **Calendar** is temporal: same Place on two days = two VEVENTs. UID = Visit ID.

### 4. Future Projections

When adding a new projection:

1. Ask: "What is the authority?" (Place or Visit?)
2. Ask: "What is the dedup strategy?" (By Place or by Visit?)
3. Do NOT add a version field.
4. Do NOT store pre-computed results. Re-derive from source entities.
