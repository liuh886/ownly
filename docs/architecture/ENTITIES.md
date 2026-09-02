# Entity Model

All entities carry `schema_version: '0.1'` as a literal string type. Migration framework handles evolution.

## Trip

The container. One trip = one markdown file.

```yaml
type: trip
id: "trip-{uuid}"
title: "Thailand 2026"
status: planning | active | completed | archived
start_date: "2026-10-05"
end_date: "2026-10-12"
destinations: ["Bangkok", "Chiang Mai"]
currency: "THB"
members: ["Alice", "Bob"]
transport_mode: "transit" | "driving" | "walking"
```

**Authority over**: destinations, currency, members, transport mode.

## Place

A reusable location. Multiple Visits can reference the same Place.

```yaml
type: trip_place
id: "place-{uuid}"
trip_id: "trip-{uuid}"
title: "The Grand Palace"
kind: stay | attraction | food | transport | other
priority: must | want | skip
state: candidate | excluded
source_provider: "google_maps" | "booking" | "xiaohongshu"
source_place_id: "ChIJ..."
source_url: "https://maps.google.com/?cid=..."
coordinates: { lat: 13.75, lng: 100.49 }
open_hours: "08:30 - 15:30"
duration_minutes: 120
observed_price: "฿500"
observed_rating: 4.6
reservation_status: none | pending | booked | waitlisted
tags: ["attraction", "landmark"]
```

**Authority over**: identity, location, hours, price, rating, reservation status.

## Visit

An occurrence of a Place on a specific date. This is the scheduling atom.

```yaml
type: trip_visit
id: "visit-{uuid}"          # Occurrence Authority
place_id: "place-{uuid}"
trip_id: "trip-{uuid}"
date: "2026-10-05"
start_time: "09:00"
duration_minutes: 120
sort_order: 0               # Position in day timeline
created_at: "2026-09-01T00:00:00.000Z"
```

**Authority over**: scheduling (date, time, duration, order).

**Key invariant**: Visit `id` is the primary key for all scheduling operations. `materializePlannerScheduledPlaces()` joins Place + Visit, producing one `PlannerScheduledPlace` per Visit.

## TripLeg

A travel segment between two Places.

```yaml
type: trip_leg
id: "leg-{uuid}"
trip_id: "trip-{uuid}"
from_place_id: "place-{uuid}"
to_place_id: "place-{uuid}"
mode: "walking" | "transit" | "driving"
duration_minutes: 12
distance_meters: 900
source: "openrouteservice"
```

**Authority over**: travel time, distance, mode.

## Expense

A financial record tied to a trip date.

```yaml
type: expense
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
