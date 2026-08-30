# Capture ↔ Planner boundary

Ownly has one authoritative travel database: **Planner Markdown/Vault**.

## Capture owns only an inbox

The extension stores exactly two things under `ownlyCaptureStateV2`:

- `activeContext`: a small projection of the Planner-selected trip (`tripId`, title, currency, tags)
- `pendingPlaces`: unsynced research candidates

Capture does **not** store Trip objects, schedule state, lifecycle state, route order, locks, budgets, members, or a historical identity map.

## Direction of data

1. Planner selects a trip and sends `activeContext` to the extension.
2. Capture extracts source facts and the user's pre-import research notes into `pendingPlaces`.
3. Planner pulls candidates and calls `PlannerRepository.importCapturedPlaces()`.
4. Existing canonical places keep Planner-owned decisions; Capture refreshes only source/observed facts.
5. Planner ACKs imported candidate IDs. ACK failure is an error; pending candidates remain retryable.

There is no bidirectional database synchronization and no fallback writer.

## Single writer

Only the MV3 background service worker writes `ownlyCaptureStateV2` in `chrome.storage.local`.
Side panel and bridge contexts send commands to the worker. A failed worker write surfaces as an error instead of falling back to direct storage mutation.

## Scheduling ownership

Scheduling exists only in Planner/Vault. Capture has no day selector, no `scheduled_date`, no `sort_order`, no `locked`, and no lifecycle command.

## Identity

Import matching uses, in order:

1. provider + `source_place_id`
2. rounded coordinates
3. normalized canonical source URL
4. URL/title-style fallback only when stronger identity is unavailable

The old append-only `knownPlaceIds` tombstone map is removed.

## Supported research providers

Capture place extraction is intentionally provider-specific rather than a generic scraper. The supported automatic adapters are:

- Google Maps: place details and saved lists
- Booking.com: accommodation title, rating and address
- Tabelog: restaurant title, rating, category, price and address
- Xiaohongshu: note title/content/location signals and note-derived place lists

Unsupported websites are not silently parsed as Google Maps. New providers should be added only when they have a concrete extraction contract.

## Selection FX

Selection FX is not part of place extraction. `fx-tooltip.js` is a separate lightweight content script on ordinary HTTP/S pages: selecting recognizable price text opens a local conversion card using the trip currency (CNY when no trip is active) and the background worker's cached FX table. The side-panel toggle remains the single persisted on/off setting. Capture provider permissions and extraction logic stay narrow even though the FX helper is available across normal webpages.

## Permissions

The extension no longer injects on every HTTP/S page. Static content scripts are restricted to supported travel providers; the FX endpoint and short-link hosts are explicit host permissions. Manual page-currency override is scoped to the active tab/session.


## Research fact contract

Capture keeps raw source evidence and normalized comparable facts together. The canonical place may store:

- `source_category`: the provider's high-resolution category label
- `observed_rating` + `observed_review_count`
- `observed_price`: untouched source text
- `price_currency`, `price_min`, `price_max`, `price_unit`, `price_level`
- `types`, hours, address, coordinates and contact/source links

Google Maps saved lists are intentionally treated as thin identity payloads. When a list is imported, Capture uses each stable Google feature id to fetch the canonical `?cid=` detail page with bounded concurrency, enriches from structured page metadata, then reports field coverage. It does not fabricate category from an address and it does not persist converted prices; FX conversion remains a view-time operation against the trip currency.
