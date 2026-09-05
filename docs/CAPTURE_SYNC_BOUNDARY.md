# Capture ↔ Planner boundary

Ownly has one authoritative travel database: **Planner Markdown/Vault**.

## Capture owns only an inbox

The extension stores research data under `ownlyCaptureStateV3` in `chrome.storage.local`:

- `collections`: multi-collection staging areas (e.g. `Inbox`, `芭提雅精选`, `京都美食`)
- `places`: captured candidate places (`CapturePlace`) categorized by collection
- `active_collection_id`: the currently active collection receiving quick captures
- `settings`: currency override and user preferences

Capture does **not** store Trip objects, schedule state, lifecycle state, route order, locks, budgets, members, or a historical identity map.

## Direction of data

1. Planner selects a trip and optionally syncs context (`activeContext`) to the extension bridge.
2. Capture extracts source facts and user notes into `places` within the target collection.
3. Planner pulls candidates and calls `PlannerRepository.importCapturedPlaces()` or `importResearchPlaces()`.
4. Existing canonical places keep Planner-owned decisions; Capture refreshes only source/observed facts.
5. Planner returns one `ImportReport` (`received`, `imported`, `failed`) to Capture.
6. Capture removes only `imported` IDs; failed candidates remain in the inbox with `status=failed`, `reason`, and `lastAttempt`, and the same report is shown in diagnostics.

There is no success-ID-only ACK, silent rejection, bidirectional database synchronization, or fallback writer.

## Single writer (MV3 Architecture)

Only the MV3 background service worker writes `ownlyCaptureStateV3` in `chrome.storage.local` via `mutateCaptureStateV3InWorker()`.
Side panel and content scripts send message commands to the worker (`OWNLY_QUICK_SAVE_PLACE`, `CAPTURE_SAVE_STATE_V3`, `CAPTURE_SET_COLLECTION`). A failed worker write surfaces as an error instead of falling back to direct storage mutation.

## Scheduling ownership

Scheduling exists only in Planner/Vault. Capture has no day selector, no `scheduled_date`, no `sort_order`, no `locked`, and no lifecycle command.

## Identity & Deduplication

Capture enforces resilient deduplication before adding places to Inbox:

1. Exact provider ID (`source_place_id` / Google Feature ID / CID)
2. Canonical URL matching
3. Proximity check ($< 150\text{m}$ between verified coordinates)
4. Normalized title similarity

When a place already exists in the inbox, Capture non-destructively merges new observations and signals `ℹ️ 该地点已在案板中` without creating duplicates.

## Supported research providers (Modular Page Adapters)

Capture place extraction is organized into dedicated `PageAdapter` modules (`src/extension/adapters/`):

- **Google Maps**: POI details pane, search results cards, and saved lists (`/maps/place/...`, `/maps?cid=...`, entity lists)
- **Google Travel**: Hotel search list cards and deep hotel entity resolution (`/travel/hotels/entity/...`)
- **Agoda**: Saved trip lists (`/trips/detail?...&tab=saved`), search result cards, and hotel detail pages
- **Booking.com**: Property cards, search list items, and JSON-LD microdata
- **Tabelog**: Restaurant cards, search ranking lists, and detail views
- **Xiaohongshu**: Note location signals and note-derived place lists

All external travel providers (Agoda, Google Travel, Booking, Xiaohongshu) automatically standardize into canonical Google Maps entity format (`sourceProvider: 'google_maps'`) via background resolution (`resolveAndEnrichCapturedPlace`).

## Universal In-Page Inline Quick Capture (`📌 放入案板`)

Each adapter injects Shadow-DOM encapsulated inline action buttons (`injectInlineCaptureButton`) directly in front of place titles and cards:
- **Instant Save**: Clicking the button immediately writes to background storage (0ms UI latency).
- **Event Isolation**: Full propagation stops (`preventDefault` + `stopPropagation`) prevent accidental outer link navigation.
- **Asynchronous Resolution**: Background service worker triggers query-pin / protobuf resolution to upgrade raw coordinates, opening hours, star ratings, and canonical Maps links.

## Selection FX

Selection FX is not part of place extraction. `fx-tooltip.js` is a separate lightweight content script on ordinary HTTP/S pages: selecting recognizable price text opens a local conversion card using the trip currency (CNY when no trip is active) and the background worker's cached FX table. The side-panel toggle remains the single persisted on/off setting.

## Research fact contract

Capture keeps raw source evidence and normalized comparable facts together. The canonical place may store:

- `source_category`: the provider's high-resolution category label
- `observed_rating` + `observed_review_count`
- `observed_price`: untouched source text
- `price_currency`, `price_min`, `price_max`, `price_unit`, `price_level`
- `types`, hours, address, coordinates, hotel facts (`opened_year`, `renovated_year`, `room_count`), and contact/source links

