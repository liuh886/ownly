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

## Permissions

The extension no longer injects on every HTTP/S page. Static content scripts are restricted to supported travel providers; the FX endpoint and short-link hosts are explicit host permissions. Manual page-currency override is scoped to the active tab/session.
