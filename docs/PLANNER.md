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
  Trip Legs/
  Trip Expenses/
```

The extension's `chrome.storage.local` state is only a pending handoff queue. After Planner writes pending places to Markdown it acknowledges those IDs and removes them from the queue. All writers (side panel, background quick capture, website bridge) share one serialized state module with an in-context write queue, and the side panel live-reloads when another context writes.

Mixed-currency prices are converted for display only via built-in USD-pivot reference rates; trips may override any rate through `fx_rates` on the trip frontmatter. Raw captured price text is never rewritten.

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

The Google Maps adapter auto-fills observation hints for the current place or saved list: title, URL, coordinates (when present in the URL or list payload), rating, price, address, opening hours and the user's own Maps notes. Structured extras include phone, plus code, menu link, reservation link, review-topic chips and the Google taxonomy `types` — sourced from stable DOM anchors plus a same-origin enrichment pass over the page's embedded state blob (feature id `0x…:0x…` / ChIJ id included). Research judgment — priority, area, signals, risks, why — remains explicit user input. Ownly does not scrape or archive raw Google reviews.

Currency detection runs in tiers: explicit symbols/codes on the page, then the place's map coordinates, then the trip's declared currency as a prior (beats VPN/TLD page-localization noise), then generic locale context. Hotel rate modules load lazily, so a missed price is retried once after ~2 seconds.

Places are de-duplicated per trip with a stable identity: the Google place id when available, otherwise a normalized title/URL key (`knownPlaceIds`). Re-importing a saved list via one-click sync refreshes captured observations while preserving the user's edits and any scheduling state; bulk text/link paste only adds missing places and never overwrites existing ones.

The Ownly website bridge is injected only on the declared Ownly origins. Planner pulls the pending queue with `window.postMessage`; the bridge validates same-window and same-origin messages before accessing extension storage. Content scripts are injected only on Google Maps paths and the supported provider hosts (Tabelog, Xiaohongshu, Booking), never across all of google.com.

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

## Travel legs and day feasibility

`Trip Legs/` stores one canonical travel fact for an ordered place pair. A leg records the chosen mode, duration, optional distance, source and observation time; it is never embedded into a place because reordering must not change place semantics.

The deterministic schedule engine combines stop end time + adjacent travel duration + next stop start time. Each transition is `ok`, `unknown`, or `conflict`. Missing route facts remain unknown; Ownly never inserts a default transfer duration.

MCP offers two explicit prepare/commit paths:

- `ownly_planner_prepare_set_travel_leg`: save a user-verified leg, including public-transit time.
- `ownly_planner_prepare_refresh_day_travel`: refresh only adjacent walking/driving/bicycling pairs through OpenRouteService using `OPENROUTESERVICE_API_KEY`; manual legs are preserved.

The browser remains a consumer of canonical `Trip Legs/` facts. API keys are not shipped in the static Web/PWA bundle. OpenRouteService-derived facts are labeled `ORS · OSM` in the Planner UI. Google Maps remains the live-navigation handoff.

`OPENROUTESERVICE_API_KEY` may be stored as a GitHub Repository Secret for Actions-based validation. A locally launched Ownly MCP process reads the same variable from its local process environment; repository secrets are never copied into the Web/PWA or local runtime automatically.

## Travel-time optimization

The old straight-line-distance optimizer is removed. Ownly has one optimization path: local MCP queries an ephemeral OpenRouteService matrix for the selected walking/driving/bicycling day, minimizes total known travel minutes, preserves the first stop plus locked/anchored slots, and commits the chosen order together with only the final adjacent ORS legs. The N×N matrix is never persisted.

`transit` remains manual because Ownly does not fabricate public-transport travel times. The static Web/PWA does not hold an ORS API key; it displays the canonical order and `Trip Legs/` facts after the MCP commit.
