# Ownly Planner

Ownly Planner is the scheduling layer for travel research collected in Google Maps.

## Product boundary

- **Google Maps**: discovery, research, ratings/reviews/price reference, spatial judgment, live navigation.
- **Ownly Capture**: Chromium MV3 side panel that records the user's own research judgment and keeps a local pending queue.
- **Ownly Planner**: research pool, day skeleton, manual ordering, route handoff.
- **Ownly Travel**: unchanged in this release; it remains the existing travel-insights/review surface.

Ownly does not build a second POI database and does not persist raw Google reviews. The durable asset is the user's own travel judgment: priority, area, duration, preferred window, signals, risks, notes, and optional manually observed rating/price.

## Canonical data

The selected Ownly data directory is authoritative:

```text
Ownly/
  Trips/
  Trip Places/
  Trip Bookings/
```

The extension's `chrome.storage.local` state is only a pending handoff queue. After Planner writes pending places to Markdown it acknowledges those IDs and removes them from the queue.

### Trip

Trip identity, date range, destinations, currency and default transport mode.

### Trip Place

Google Maps source reference plus user research and planning state. Place state is one of `candidate`, `scheduled`, `done`, `dropped`. Priority is independent: `must`, `want`, `optional`.

### Trip Booking

Fixed anchors such as stay, flight, rail, ticket and restaurant reservations. The type exists in the canonical contract; booking UI is intentionally not part of the first Planner slice.

## Capture extension

Build with:

```bash
npm run build:extension
```

Load `dist/extension` as an unpacked extension in Chromium. The action button opens the native Side Panel.

The Google Maps adapter only extracts the current place name and URL. Rating, price, research signals and notes are explicit user-entered observations; this keeps the capture layer narrow and avoids turning Ownly into a Google Maps scraper.

The Ownly website bridge is injected only on the declared Ownly origins. Planner pulls the pending queue with `window.postMessage`; the bridge validates same-window and same-origin messages before accessing extension storage.

## First usable loop

```text
Google Maps
  → Ownly Capture side panel
  → local pending queue
  → Ownly Planner sync
  → Markdown source of truth
  → Research Pool
  → Day Skeleton
  → Google Maps Directions
```

Planner deliberately starts manual-first. Manual placement locks the item so a later AI proposal layer can treat user edits as hard constraints instead of silently overwriting them.

## Not in this slice

- Supabase or any remote Ownly database
- userscript fallback
- raw Google review archive / bulk scraping
- planner-side POI discovery
- custom routing engine
- collaboration
- AI proposal generation
- changes to the existing `components/travel/*` surface
