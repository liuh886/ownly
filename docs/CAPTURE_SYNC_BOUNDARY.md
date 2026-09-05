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

1. Planner selects a trip and optionally syncs target trip info (`planner_target`) to the extension bridge.
2. Capture extracts source facts and user notes into `places` within the target collection.
3. Planner pulls candidates and calls `PlannerRepository.importCapturedPlaces()` or `importResearchPlaces()`.
4. Existing canonical places keep Planner-owned decisions; Capture refreshes only source/observed facts.
5. Planner returns one `ImportReport` (`received`, `imported`, `failed`) to Capture.
6. Capture removes only `imported` IDs; failed candidates remain in the inbox with `status=failed`, `reason`, and `lastAttempt`, and the same report is shown in diagnostics.

There is no success-ID-only ACK, silent rejection, bidirectional database synchronization, or fallback writer.

## Single writer (MV3 Architecture)

Only the MV3 background service worker writes `ownlyCaptureStateV3` in `chrome.storage.local` via `mutateCaptureStateV3InWorker()`.
Side panel, content scripts, and the website bridge send message commands to the worker (`OWNLY_QUICK_SAVE_PLACE`, `CAPTURE_SAVE_STATE_V3`, `CAPTURE_SET_COLLECTION`, `CAPTURE_APPLY_IMPORT_REPORT`, `CAPTURE_SET_PLANNER_TARGET`, `CAPTURE_UPSERT_PLACE`). A failed worker write surfaces as an error instead of falling back to direct storage mutation.

## Scheduling ownership

Scheduling exists only in Planner/Vault. Capture has no day selector, no `scheduled_date`, no `sort_order`, no `locked`, and no lifecycle command.

## Identity & Deduplication

Capture enforces strict namespace separation and two distinct levels of deduplication:

1. **Provider-Native Identity Based Merge (Automatic)**:
   - Strong identity matching (`findExistingPlaceByIdentity`): matches on exact provider-isolated keys (e.g. `agoda:source_place_id:78652960`, `booking:source_place_id:...`, `google_cid:...`, `google_place_id:...`) or exact canonical non-search URLs.
   - When a place already exists in the inbox under the same strong identity, Capture non-destructively merges new observations and signals `ℹ️ 该地点已在案板中` without creating duplicates.

2. **Weak Evidence Based Duplicate Suggestion (Review-Only)**:
   - Weak signals (e.g. title similarity, geographic proximity, search query URLs) are handled by `findPotentialDuplicatePlaces`.
   - Weak evidence is strictly used for UI warnings and user review prompts, and is NEVER used for automatic merging, avoiding accidental data loss across different branches or identically named places.

## Supported research providers (Modular Page Adapters)

Capture place extraction is organized into dedicated `PageAdapter` modules (`src/extension/adapters/`):

- **Google Maps**: POI details pane, search results cards, and saved lists (`/maps/place/...`, `/maps?cid=...`, entity lists)
- **Google Travel**: Hotel search list cards and deep hotel entity resolution (`/travel/hotels/entity/...`)
- **Agoda**: Saved trip lists (`/trips/detail?...&tab=saved`), search result cards, and hotel detail pages (`sourceProvider: 'agoda'`)
- **Booking.com**: Property cards, search list items, and JSON-LD microdata (`sourceProvider: 'booking'`)
- **Tabelog**: Restaurant cards, search ranking lists, and detail views (`sourceProvider: 'tabelog'`)
- **Xiaohongshu**: Note location signals and note-derived place lists (`sourceProvider: 'xiaohongshu'`)

Native IDs remain safely isolated in their respective provider namespaces. When background resolution (`resolveAndEnrichCapturedPlace`) verifies a genuine Google Maps entity (CID, Place ID, coordinates, hours), the entity is enhanced with canonical Google Maps facts without cross-namespace ID collision.

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

