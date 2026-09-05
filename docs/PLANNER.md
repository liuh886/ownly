# Ownly Planner

Ownly Planner is the scheduling layer for travel research collected in Google Maps.

## Product boundary

- **Google Maps**: discovery, research, ratings/reviews/price reference, spatial judgment, live navigation.
- **Ownly Capture**: Chromium MV3 side panel that records the user's own research judgment and keeps a local pending queue.
- **Ownly Planner**: research pool, execution timeline, manual ordering, route handoff.
- **Ownly Travel**: unchanged in this release; it remains the existing travel-insights/review surface.

Ownly does not build a second POI database and does not persist raw Google reviews. The durable asset is the user's own travel judgment: priority, area, duration, preferred window, signals, risks, notes, and optional manually observed rating/price.

## Canonical data

The selected Ownly data directory is authoritative:

```text
Ownly/
  Trips/
  Trip Places/
  Trip Visits/
  Trip Legs/
  Trip Expenses/
```

The extension's `chrome.storage.local` state is only a pending handoff queue (`ownlyCaptureStateV3`). After Planner writes pending places to Markdown it acknowledges those IDs and removes them from the queue. Only the MV3 background service worker writes to `chrome.storage.local` via `mutateCaptureStateV3InWorker()`. The side panel, content scripts, and website bridge dispatch messages to the worker, and the side panel live-reloads when storage changes.

Mixed-currency prices are converted for display only via built-in USD-pivot reference rates; trips may override any rate through `fx_rates` on the trip frontmatter. Raw captured price text is never rewritten.

### Trip

Trip identity, date range, destinations, currency, members, and default transport mode (`driving`, `walking`, `motorcycle`, `cycling`, `transit`).

### Trip Place

Google Maps source reference plus reusable user research facts. Place state is one of `candidate`, `done`, `dropped`; scheduling never lives on the place. Priority is independent: `must`, `want`, `optional`. Place facts include verified `hotel_facts` (`opened_year`, `renovated_year`, `room_count`).

### Trip Visit

One concrete occurrence of a place in the itinerary. `Trip Visits/` owns date, optional start/end time, occurrence duration, order, lock, and anchor state. The same `place_id` may have multiple visits on the same day or across different days. Removing a visit never deletes the reusable place.

### Trip Booking

Fixed anchors such as stay, flight, rail, ticket and restaurant reservations. The type exists in the canonical contract; booking UI is intentionally not part of the first Planner slice.

## Capture extension

Build with:

```bash
npm run build:extension
```

Load `dist/extension` as an unpacked extension in Chromium. The action button opens the native Side Panel.

The modular page adapters (`src/extension/adapters/`) support 6 travel and mapping platforms: **Google Maps**, **Google Travel**, **Agoda**, **Booking.com**, **Xiaohongshu**, and **Tabelog**. Each adapter injects Shadow-DOM encapsulated inline action buttons (`📌 放入案板`) directly in front of place titles and search/saved list cards.

All external captures are instantly written to the active Inbox collection in `ownlyCaptureStateV3` and asynchronously enriched by the background worker via Google Maps query resolution (`resolveAndEnrichCapturedPlace`), standardizing `sourceProvider: 'google_maps'`, canonical Place IDs (`0x...:0x...`), coordinates, verified ratings, opening hours, and hotel property facts.

Currency detection runs in tiers: explicit symbols/codes on the page, site-level currency switchers and storage tokens, SEO JSON-LD structured data, then the place's map coordinates and active trip currency hints. Hotel rate modules load lazily, so missed prices are retried automatically.

Places are de-duplicated per collection with a resilient identity: Google place id when available, canonical URL, and coordinates/title similarity. Re-importing a saved list via one-click sync refreshes captured observations while preserving the user's Planner-owned research edits; bulk text/link paste only adds missing places and never overwrites existing ones.

The Ownly website bridge is injected only on declared Ownly origins. Planner pulls the pending queue with `window.postMessage`; the bridge validates same-window and same-origin messages and delegates all mutations (`CAPTURE_APPLY_IMPORT_REPORT`, `CAPTURE_SET_PLANNER_TARGET`) to the background worker via message passing. Content scripts are injected only on Google Maps paths and supported provider hosts (Google Travel, Agoda, Booking.com, Xiaohongshu, Tabelog), never broadly across the web.

## First usable loop

```text
Google Maps / Travel / Agoda / Booking / XHS / Tabelog
  → In-Page "📌 放入案板" / Saved List 1-Click Sync
  → Background Worker (0ms Instant Inbox Save)
  → Asynchronous Google Maps Entity Resolution
  → Ownly Planner Import Gate (Strong Identity Auto-Merge)
  → Markdown Source of Truth (Trips, Trip Places, Trip Visits)
  → Execution Timeline (Drag-and-Drop Day Swapping)
  → Google Maps Directions / iCal Pro Feed
```

Planner deliberately starts manual-first. Manual placement creates a Visit occurrence. A Visit can be locked explicitly so a later AI proposal treats that occurrence as a hard constraint without mutating the reusable Place. Itinerary days can be reorganized intuitively via drag-and-drop day tabs or the accessible `⇄ 互换` date picker.

## Not in this slice

- Supabase or any remote Ownly database
- userscript fallback
- raw Google review archive / bulk scraping
- planner-side POI discovery
- custom routing engine
- collaboration
- AI proposal generation
- changes to the existing `components/travel/*` surface

## Travel legs and day feasibility

`Trip Legs/` stores one canonical travel fact for an ordered place pair. A leg records the chosen mode (`driving`, `walking`, `motorcycle`, `cycling`, `transit`), duration, optional distance, source (`heuristic`, `manual`, `openrouteservice`), and observation time; it is never embedded into a place because reordering must not change place semantics.

The deterministic schedule engine combines stop end time + adjacent travel duration + next stop start time. When adjacent legs lack manual or ORS measurements, Planner computes a deterministic heuristic estimate (`calculateDefaultTripLeg`) using spherical Haversine distance and city road winding factors ($1.3\times$), while automatically skipping commute calculations for transit-to-transit pairs (e.g. airport to train station transfers governed by ticketing). Users can toggle travel modes on the fly (`🚗`, `🚶`, `🛵`, `🚲`, `🚇`) directly from the itinerary badge.

MCP offers two explicit prepare/commit paths:

- `ownly_planner_prepare_set_travel_leg`: save a user-verified leg, including public-transit time.
- `ownly_planner_prepare_refresh_day_travel`: refresh only adjacent walking/driving/bicycling pairs through OpenRouteService using `OPENROUTESERVICE_API_KEY`; manual legs are preserved.

The browser remains a consumer of canonical `Trip Legs/` facts. API keys are not shipped in the static Web/PWA bundle. OpenRouteService-derived facts are labeled `ORS · OSM` in the Planner UI. Google Maps remains the live-navigation handoff.

`OPENROUTESERVICE_API_KEY` may be stored as a GitHub Repository Secret for Actions-based validation. A locally launched Ownly MCP process reads the same variable from its local process environment; repository secrets are never copied into the Web/PWA or local runtime automatically.

## Travel-time optimization

The old straight-line-distance optimizer is removed. Ownly has one optimization path: local MCP queries an ephemeral OpenRouteService matrix for the selected walking/driving/bicycling day, minimizes total known travel minutes, preserves the first Visit plus locked/anchored Visit slots, and commits the chosen Visit order together with only the final adjacent ORS legs. The N×N matrix is never persisted.

`transit` pairs without street routes remain manual because Ownly does not fabricate public-transport timetable schedules. The static Web/PWA does not hold an ORS API key; it displays the canonical order and `Trip Legs/` facts after the MCP commit.

## Execution Timeline

Execution Timeline is a deterministic projection, not a new persistence layer. `Trip Places/` owns reusable place facts, `Trip Visits/` owns occurrence order/start/duration/locks, and `Trip Legs/` owns travel facts between canonical place pairs. `planner-schedule.ts` combines them into ordered `stop`, `travel`, `gap`, `conflict`, and `unknown` blocks.

Positive slack becomes an explicit gap; impossible handoffs become conflicts; missing travel or schedule facts remain unknown. The timeline never invents start times, transfer durations, buffers, or risk scores. Web and MCP consume the same derived projection. Day reordering and date swapping execute atomically with complete preservation of visit sort orders and locked constraints.
