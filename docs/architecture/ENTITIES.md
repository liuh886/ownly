# Entity Model

All entities carry `schema_version: '0.1'` as a literal string type.

## Trip

The container. One trip = one markdown file (`Trips/`).

```yaml
schema_version: "0.1"
type: trip
id: "trip-{uuid}"
title: "Thailand 2026"
status: planning | active | completed
start_date: "2026-10-05"
end_date: "2026-10-12"
destinations: ["Bangkok", "Chiang Mai"]
currency: "THB"
members: ["Alice", "Bob"]
transport_mode: "driving" | "walking" | "motorcycle" | "cycling" | "transit"
```

**Authority over**: destinations, currency, members, transport mode.

## Place

A reusable location (`Trip Places/`). Multiple Visits can reference the same Place.

```yaml
schema_version: "0.1"
type: trip_place
id: "place-{uuid}"
trip_id: "trip-{uuid}"
title: "The Grand Palace"
kind: stay | attraction | food | shopping | transit | flight | other
priority: must | want | optional
state: candidate | done | dropped
source_provider: "google_maps" | "google_travel" | "agoda" | "booking" | "xiaohongshu" | "tabelog" | "manual" | "other"
source_place_id: "0x30e2991678584ec5:0x698c069655046fbe"
source_url: "https://www.google.com/maps/place/..."
coordinates: { lat: 13.75, lng: 100.49 }
open_hours: "08:30 - 15:30"
duration_minutes: 120
observed_price: "฿500"
observed_rating: 4.6
observed_review_count: 12500
reservation_status: none | pending | booked | waitlisted
hotel_facts:
  opened_year: "2022"
  renovated_year: "2024"
  room_count: 120
tags: ["attraction", "landmark"]
```

**Authority over**: identity, location, hours, price, rating, hotel facts, reservation status.

## Visit

An occurrence of a Place on a specific date (`Trip Visits/`). This is the scheduling atom.

```yaml
schema_version: "0.1"
type: trip_visit
id: "visit-{uuid}"          # Occurrence Authority
place_id: "place-{uuid}"
trip_id: "trip-{uuid}"
date: "2026-10-05"
start_time: "09:00"
end_time: "11:00"
duration_minutes: 120
sort_order: 0               # Position in day timeline
locked: false
is_anchor: false
created_at: "2026-09-01T00:00:00.000Z"
```

**Authority over**: scheduling (date, time, duration, order, locks).

**Key invariant**: Visit `id` is the primary key for all scheduling operations. `materializePlannerScheduledPlaces()` joins Place + Visit, producing one `PlannerScheduledPlace` per Visit.

## TripLeg

A travel segment between two Places (`Trip Legs/`).

```yaml
schema_version: "0.1"
type: trip_leg
id: "leg-{uuid}"
trip_id: "trip-{uuid}"
from_place_id: "place-{uuid}"
to_place_id: "place-{uuid}"
mode: "driving" | "walking" | "motorcycle" | "cycling" | "transit"
duration_minutes: 12
distance_meters: 900
source: "heuristic" | "manual" | "openrouteservice"
```

**Authority over**: travel time, distance, mode, computation source.

## Expense

A financial record tied to a trip date (`Trip Expenses/`).

```yaml
schema_version: "0.1"
type: trip_expense
id: "expense-{uuid}"
trip_id: "trip-{uuid}"
date: "2026-10-05"
amount: 500
currency: "THB"
category: "food" | "attraction" | "transport" | "stay" | "other"
description: "Grand Palace entrance"
paid_by: "Alice"
payments:
  - member: "Alice"
    amount: 250
  - member: "Bob"
    amount: 250
```

**Authority over**: cost allocation, payment splits.

## PlaceIdentityEvent

Audit trail for identity changes. Git-like history for Place identity.

```typescript
interface PlaceIdentityEvent {
  timestamp: string;
  action: 'create' | 'merge' | 'split' | 'evidence_add' | 'evidence_remove' | 'confidence_change';
  source: string;
  confidence: number;
  before: { id: string; title: string; identity_keys: string[] } | null;
  after: { id: string; title: string; identity_keys: string[] } | null;
  metadata?: Record<string, unknown>;
}
```

**Purpose**: Track how Place identity evolves. Essential for debugging merge/split decisions.
