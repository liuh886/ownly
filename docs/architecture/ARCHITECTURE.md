# Ownly Architecture

## Data Flow

```
                    ┌─────────────────────────────────────────┐
                    │              CAPTURE SOURCES             │
                    │                                         │
                    │   Google Maps    Booking.com    XHS     │
                    │   Chrome Ext     Chrome Ext     Ext     │
                    └──────────────┬──────────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────────────┐
                    │              CAPTURE STATE              │
                    │                                         │
                    │   pullCaptureState() → captured.json    │
                    │   Bridge ACK (non-blocking)             │
                    └──────────────┬──────────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────────────┐
                    │              IMPORT GATE                │
                    │                                         │
                    │   importCapturedPlaces()                │
                    │   → validation → dedup → write          │
                    │   → ImportReport (imported / failed[])  │
                    └──────────────┬──────────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────────────┐
                    │            PLACE (Authority)            │
                    │                                         │
                    │   id, title, coordinates, kind          │
                    │   source_provider, source_place_id      │
                    │   schema_version                        │
                    │                                         │
                    │   PlaceIdentityEvent (audit trail)      │
                    └──────────────┬──────────────────────────┘
                                   │
                        ┌──────────┴──────────┐
                        ▼                     ▼
           ┌────────────────────┐  ┌────────────────────┐
           │  TRIP              │  │  IDENTITY          │
           │                    │  │                    │
           │  places[]          │  │  evidence matching │
           │  visits[]          │  │  auto-merge        │
           │  expenses[]        │  │  conflict detect   │
           └────────┬───────────┘  └────────────────────┘
                    │
                    ▼
           ┌────────────────────┐
           │  VISIT             │
           │  (Occurrence)      │
           │                    │
           │  id (Occurrence    │
           │      Authority)    │
           │  place_id          │
           │  date, start_time  │
           │  sort_order        │
           └────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────────────────┐
        │         PROJECTIONS               │
        │                                   │
        │   Authority │ Source              │
        │   ──────────┼─────────            │
        │   Timeline  │ Visit               │
        │   Map       │ Place (deduplicated)│
        │   Calendar  │ Visit               │
        │   Export    │ Visit               │
        │   Search    │ Place               │
        │   Recommend │ Place               │
        │   Budget    │ TripMember + Visit  │
        │   Nav       │ Visit               │
        │                                   │
        │   Deterministic: no versions.     │
        │   Source entities own truth.      │
        └───────────────────────────────────┘
```

## Core Invariants

1. **Occurrence Authority**: Visit `id` is the primary key for scheduling. One Place can have many Visits.
2. **Spatial Deduplication**: Map projection deduplicates by `place_id`. Same Place = one pin.
3. **Deterministic Projections**: All projections are derived from source entities. No versioning on projections.
4. **Identity Truth**: Place identity is resolved by strong evidence (Google CID, ChIJ). Titles and coordinates are weak signals.
5. **Import Gate**: Every entity goes through `importCapturedPlaces()` → validation → dedup → `ImportReport`.
6. **ACK Non-Blocking**: Capture bridge ACK failure does not block import.

## Capture Boundary Constraint

Capture and Planner are **decoupled domains** with a single shared contract:

- **Capture** manages place collections (`CaptureCollection`, `CapturePlace`). It owns the V3 state (`OwnlyCaptureStateV3`) and handles collection CRUD, place enrichment, and portable JSON export.
- **Planner** manages trips (`PlannerTrip`, `PlannerTripPlace`, `PlannerTripVisit`). It owns trip scheduling, routing, budgets, and collaboration.
- **Shared Contract**: The `OwnlyCollectionExportV1` JSON schema. Capture exports collections as this format; Planner imports them via `parseCaptureCollectionExport` + `capturePlaceToPlannerPlace` adapter.

**Rules**:
1. Capture never owns Trip planning state (visits, legs, schedules, budgets).
2. Planner never owns Capture collection state (collections, user annotations, enrichment).
3. The only data flow between them is through the portable Capture Collection JSON schema.
4. V2→V3 migration (`migrateV2ToV3`) is a one-time bridge that converts old Planner-coupled state into independent Capture collections.

**P0 Permission Boundary (Collection vs Trip)**:
- Collection is a *place set* (shareable). Trip is a *personal execution plan* (private).
- **Share allowed**: `title`/`address`/`coordinates`/`source`/`tags`/`why`/`inferred_kind`/`rating`/`review_count`/`open_hours`/`phone`/`plus_code`
- **Share prohibited**: `price.*` (费用)、`user.notes` (私人备注)、行程日期（仅 Trip 的 `Visit.date/start` 拥有，Collection 不含）
- Enforcement: `buildShareableCollectionExport()` / `sanitizePlaceForShare()` auto-strips prohibited fields; `buildCollectionExport()` retains full fidelity for personal backup.
- Provenance (P1): share link embeds `provenance: { source_type:'shared_collection', creator, collection_id, shared_at }`; import maps to `PlannerTripPlace.import_provenance` for copy tracing.

**P2 Ownly Health (unified Doctor)**:
- Former `Planner Doctor` → `Ownly Health` (`src/domain/ownly-health.ts:1` `checkOwnlyHealth()`): cross-layer checks — `capture` (orphan place / empty collection / no active) + `planner` (`checkPlannerIntegrity()` 5 checks) → single `summary { errors, warnings, infos }` for `Settings/Admin` health board.
