# Ownly — Task Progress & Review

## Completed: Final Identity Alignment, Documentation Terminology, Timeline Transit Omission & MCP Smoke Gate (2026-09-05)
- [x] **1. Unify Identity Naming (`findPotentialDuplicatePlaces`)**
  - Renamed `findExistingPlaceByResilientIdentity` to `findPotentialDuplicatePlaces` in [`src/domain/capture.ts`](file:///D:/Documents/GitHub/Ownly/src/domain/capture.ts).
  - Explicitly constrained `findPotentialDuplicatePlaces` to UI duplicate suggestions and warning prompts only, completely excluding it from automatic merge.
  - Updated unit tests in [`src/domain/capture.test.ts`](file:///D:/Documents/GitHub/Ownly/src/domain/capture.test.ts).
- [x] **2. Documentation Terminology Alignment**
  - Replaced outdated `resilient deduplication` references in [`docs/CAPTURE_SYNC_BOUNDARY.md`](file:///D:/Documents/GitHub/Ownly/docs/CAPTURE_SYNC_BOUNDARY.md) and [`docs/PLANNER.md`](file:///D:/Documents/GitHub/Ownly/docs/PLANNER.md) with precise architecture terms:
    - **`provider-native identity based merge`** (automatic merge strictly limited to strong provider-native keys or Google Place ID/CID and exact canonical URLs).
    - **`weak evidence based duplicate suggestion`** (weak signals like title similarity, geographic proximity, and query URLs used only for user review prompts).
- [x] **3. Execution Timeline Transit Hub Leg Omission (`src/domain/planner-schedule.ts` & `planner.ts`)**
  - Enhanced `isTransitHubPlace` to recognize `transit`/`transition` kinds, airports, stations, and passenger terminals.
  - In `evaluatePlannerDayFeasibility` and `buildPlannerDayExecutionTimeline`, omitted road travel time calculation and missing travel time errors between consecutive transit hubs (times are ticket-based and remain unconstrained).
  - Added test case in `src/domain/planner-schedule.test.ts`.
- [x] **4. MCP Process Contract Smoke Test (`scripts/mcp/ownly-mcp.process.test.ts`)**
  - Added subprocess execution tests verifying MCP binary entry (`packages/mcp/dist/index.js`), `--help` exit code 0, missing `--data-dir` exit code 1 (`DATA_DIR_NOT_CONFIGURED`), and valid data directory stdio initialization.
  - Integrated into `"test:mcp"` in [`package.json`](file:///D:/Documents/GitHub/Ownly/package.json).
- [x] **5. Architecture Governance & Explicit Deferrals (`tasks/lessons.md`)**
  - Explicitly rejected/deferred 3 complex, low-ROI tasks:
    1. Reintroducing heavy `src/domain/migrations/` multi-version framework (schemas stay lightweight at `0.1`).
    2. Turning `Trip.members: string[]` into relational `TripMember` graph entities.
    3. Writing 40+ DOM-mocking React component Vitest render tests (data contracts and Playwright E2E are superior).

## Completed: Project Progress, Completion Assessment & Pragmatic Code Quality Check (2026-09-05)
- [x] 1. Run all automated quality gates (validate:fast, validate:extension, validate:shared, validate:obsidian, build)
- [x] 2. Deep-dive code quality inspection (ESLint, TS errors, error boundaries, async handling, architectural consistency)
- [x] 3. Evaluate development progress & module completion across the 5 runtimes (Web/PWA, Obsidian, Extension, MCP, CLI)
- [x] 4. Formulate pragmatic, high-ROI recommendations & fix solutions avoiding unnecessary complexity
- [x] 5. Present structured report and aligned action roadmap

## Completed: Identity Namespace Isolation & Safe Quick Capture Deduplication (2026-09-05)
- [x] **1. Provider Identity Namespace Isolation (`src/domain/place-identity.ts`)**
  - Isolated provider namespaces (`agoda`, `booking`, `tabelog`, `xiaohongshu`, `google_travel`, `google_maps`) so native IDs (such as Agoda hotel ID `78652960`) are never misclassified into the `google_maps` namespace or treated as Google CIDs.
  - Formulated strong identity evidence keys with native prefixes (e.g. `agoda:source_place_id:78652960`, `booking:source_place_id:...`, `tabelog:source_place_id:...`, `xiaohongshu:source_place_id:...`).
  - Restricted `toGooglePlaceIdentity()` to only produce Google identity objects when the provider is genuine `google_maps` / `google_travel` or verified Google metadata is present.
- [x] **2. Update All Provider Adapters to Authoritative Source Providers**
  - Updated [`src/extension/adapters/agoda.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/adapters/agoda.ts) (`sourceProvider: 'agoda'`).
  - Updated [`src/extension/adapters/booking.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/adapters/booking.ts) (`sourceProvider: 'booking'`).
  - Updated [`src/extension/adapters/tabelog.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/adapters/tabelog.ts) (`sourceProvider: 'tabelog'`).
  - Updated [`src/extension/adapters/xiaohongshu.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/adapters/xiaohongshu.ts) (`sourceProvider: 'xiaohongshu'`).
  - Updated [`src/extension/adapters/google-travel.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/adapters/google-travel.ts) (`sourceProvider: 'google_travel'`).
- [x] **3. Safe Quick Capture Auto-Merge (Eliminate Weak Title/Proximity Auto-Merges)**
  - In [`src/domain/capture.ts`](file:///D:/Documents/GitHub/Ownly/src/domain/capture.ts) and [`src/extension/background.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/background.ts), stripped weak title + proximity auto-merges during Quick Capture.
  - Enforced strict strong-identity matching (`findExistingPlaceByIdentity`) or exact matching non-search canonical URLs to prevent accidental data overwrites when capturing different branch locations or same-name venues.
- [x] **4. Full Automated Verification Pipeline**
  - Added unit test cases in `src/domain/place-identity.test.ts`, `src/domain/capture.test.ts`, and `src/extension/utils.test.ts`.
  - Passed `npm run validate:fast` (0 errors).
  - Passed `npm run validate:extension` (172/172 tests passed).
  - Passed `npm run validate:shared` (58/58 test suites, 536/536 tests passed).
  - Passed `npm run build` (Next.js production build succeeded).

## Completed: Full-Codebase Documentation Modernization & Architectural Alignment (2026-09-05)
- [x] **1. Modernize Core Architecture & Boundary Documentation**
  - Updated [`docs/PLANNER.md`](file:///D:/Documents/GitHub/Ownly/docs/PLANNER.md): aligned MV3 background message-passing single writer architecture, documented all 6 supported provider adapters (Google Maps, Google Travel, Agoda, Booking.com, Xiaohongshu, Tabelog), automatic heuristic commute estimation (`calculateDefaultTripLeg`) with transit-hub skipping, and date drag-and-drop itinerary swapping (`swapTripDays`).
  - Updated [`docs/CAPTURE_SYNC_BOUNDARY.md`](file:///D:/Documents/GitHub/Ownly/docs/CAPTURE_SYNC_BOUNDARY.md): replaced legacy `activeContext` references with `planner_target`, documented message-passing writer actions (`CAPTURE_APPLY_IMPORT_REPORT`, `CAPTURE_SET_PLANNER_TARGET`, `CAPTURE_UPSERT_PLACE`).
  - Updated [`docs/architecture/ENTITIES.md`](file:///D:/Documents/GitHub/Ownly/docs/architecture/ENTITIES.md): aligned entity models with domain schema `schema_version: '0.1'`, added `hotel_facts` (`opened_year`, `renovated_year`, `room_count`), expanded transport modes (`driving`, `walking`, `motorcycle`, `cycling`, `transit`), place kinds, states, and source providers.
  - Updated [`docs/architecture/ARCHITECTURE.md`](file:///D:/Documents/GitHub/Ownly/docs/architecture/ARCHITECTURE.md): expanded Capture Sources diagram and matrix to cover Google Maps, Google Travel, Agoda, Booking.com, Xiaohongshu, and Tabelog.
  - Updated [`docs/DATA_MODEL.md`](file:///D:/Documents/GitHub/Ownly/docs/DATA_MODEL.md): added all 5 Planner directory paths and entity definitions (`Trips/`, `Trip Places/`, `Trip Visits/`, `Trip Legs/`, `Trip Expenses/`).
  - Updated [`docs/V2_FACADE_CLEANUP.md`](file:///D:/Documents/GitHub/Ownly/docs/V2_FACADE_CLEANUP.md): added archive status banner marking Phase 0-2 cleanups as 100% completed.
- [x] **2. Modernize Root Guides & Readmes**
  - Updated [`CLAUDE.md`](file:///D:/Documents/GitHub/Ownly/CLAUDE.md): updated root path to `D:\Documents\GitHub\Ownly`, added multi-runtime architecture summary (Web, Obsidian, Extension, MCP, CLI) and automated test gates.
  - Updated [`README.md`](file:///D:/Documents/GitHub/Ownly/README.md) & [`README.zh.md`](file:///D:/Documents/GitHub/Ownly/README.zh.md): updated storage directory layout trees (15 canonical folders including all 5 Planner directories) and added links to Planner and Capture Boundary guides.
- [x] **3. Comprehensive Automated Verification Pipeline**
  - Ran `npm run validate:fast` (0 errors, clean types, linter, terminology & membership).
  - Ran `npm run validate:extension` (172/172 tests passed, clean extension build).
  - Ran `npm run validate:shared` (58/58 test suites, 533/533 tests passed).
  - Ran `npm run build` (Next.js full production build compiled cleanly).

## Completed: Capture Extension Technical Debt Clearance, Outdated Documentation Corrections & Quality Hardening (2026-09-05)
- [x] **1. Modernize Outdated Capture Documentation & RFCs**
  - Updated [`docs/CAPTURE_PRODUCT_RFC.md`](file:///D:/Documents/GitHub/Ownly/docs/CAPTURE_PRODUCT_RFC.md): marked status as "Adopted & Implemented". Replaced legacy floating ball (FAB) references with current encapsulated inline button architecture (`injectInlineCaptureButton`), modular provider adapters (Google Maps, Google Travel, Agoda, Booking.com, Xiaohongshu, Tabelog), and asynchronous Google Maps entity resolution. Updated issue trackers #CAPTURE-RFC-01 ~ 04.
  - Updated [`docs/CAPTURE_SYNC_BOUNDARY.md`](file:///D:/Documents/GitHub/Ownly/docs/CAPTURE_SYNC_BOUNDARY.md): upgraded state model from `V2` (`pendingPlaces`) to `V3` (`ownlyCaptureStateV3` with multi-collection support), added all supported providers (Agoda, Google Travel, Booking.com, Xiaohongshu, Tabelog), and detailed the 3-Layer Quick Capture Pipeline & identity deduplication.
  - Updated [`docs/PLANNER_CAPTURE_RELEASE_READINESS.md`](file:///D:/Documents/GitHub/Ownly/docs/PLANNER_CAPTURE_RELEASE_READINESS.md): aligned capture provider coverage and inbox deduplication status.
- [x] **2. Eliminate Silent Error Catches & Improve Logging Across `src/extension/`**
  - In `background.ts`, `adapters/google-maps.ts`, `currency-detector.ts`, `enrichment.ts`, `sidepanel/capture.ts`, and `sidepanel/handlers.ts`: replaced unlogged empty catches with structured `logger.debug` / `logger.warn` calls.
  - Ensured failed network requests or JSON parse errors in background research provide actionable diagnostic logs.
- [x] **3. Hardening Timers, Memory Management & Loose Assertions**
  - In [`src/extension/sidepanel/capture.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/sidepanel/capture.ts): tracked and cleared `priceRetryTimer` (`cancelPriceRetry()`) when navigating or switching places/tabs to prevent orphan background polls.
  - In [`src/extension/background.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/background.ts): tracked and debounced `flashBadge` timeout via `badgeTimers: Map<number, Timeout>` to avoid badge race conditions on rapid multi-captures.
  - In [`src/extension/sidepanel/handlers.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/sidepanel/handlers.ts) & [`capture.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/sidepanel/capture.ts): safely scoped `store.currentPlace` locally, eliminating unchecked non-null assertions (`!`) on nullable state.
- [x] **4. Comprehensive Automated Verification & Regression Testing**
  - `npm run validate:extension` (172/172 tests passed, clean extension build).
  - `npm run validate:fast` (0 errors, clean lint, types, terminology & membership).
  - `npm run validate:shared` (100% contracts & parity passing across 58 test suites / 533 tests).
  - `npm run build` (Next.js full production build compiled successfully).

## Completed: Read-Modify-Write in Mutation Queue & Fail-Closed Directory Handling (2026-09-05)
- [x] **1. Atomize Read-Modify-Write Inside Serialized Mutation Queue**
  - Moved all pre-mutation state reads (`listPlaces`, `listVisits`, `listTrips`, `listLegs`, `listExpenses`) directly inside `executeTransaction()` callbacks in [`src/services/PlannerRepository.ts`](file:///D:/Documents/GitHub/Ownly/src/services/PlannerRepository.ts) across `deleteTrip`, `mergePlaces`, `addVisit`, `removeVisit`, `toggleVisitLock`, `updateVisitTiming`, `reorderVisits`, `swapTripDays`, `setStaySpan`, `importBundle`, `reconstructOrphanPlaces`, `importResearchPlaces`, `deduplicateTripPlaces`, and calendar feed operations.
  - Eliminated race conditions and stale snapshot read-modify-write conflicts during rapid user interactions.
- [x] **2. Distinguish Directory Not Found from Directory Read Failures**
  - In [`src/services/ObsidianFileSystemService.ts`](file:///D:/Documents/GitHub/Ownly/src/services/ObsidianFileSystemService.ts), updated `getDirHandle` so only `NotFoundError` returns `null` when `create === false`; all permission, security, or I/O errors are re-thrown.
  - In `readMarkdownFiles`, wrapped directory iteration in `try ... catch` to fail closed unless `{ tolerant: true }` is explicitly provided.
  - Added `'Trip Visits'` and `'Trip Expenses'` to `OWNLY_REQUIRED_DIRECTORIES` in [`src/services/ownly-data-layout.ts`](file:///D:/Documents/GitHub/Ownly/src/services/ownly-data-layout.ts) and updated assertions in `src/services/ownly-data-layout.test.ts`.
- [x] **3. Complete Verification Pipeline**
  - Passed `npm run validate:fast`, `npm run validate:extension` (172/172 tests), `npm run validate:shared` (58/58 test suites, 533/533 tests), `npm run build` (Next.js production build), and full `npm run validate` (100% clean).

## Completed: Deep Architectural Robustness & Schema/Concurrency Fixes (2026-09-05)
- [x] **1. True Fail-Closed Reads & Diagnostic Scan Separation (P1)**
  - Made `ObsidianFileSystemService.readMarkdownFiles()` fail-closed (throws on individual file read failure); provided `scanMarkdownFilesBestEffort()` / `{ tolerant?: boolean }` for Doctor and non-blocking diagnostic scans.
  - Ensured all mutation methods in `PlannerRepository.ts` (`dropPlace`, `deletePlace`, `upsert`, etc.) use strict fail-closed reads.
- [x] **2. Transaction ReadOriginal Distinction & Global Mutation Queue (P1)**
  - In `PlannerRepository.ts`, distinguished file-not-found from read errors in `readOriginal()` so read errors abort the transaction and propagate instead of returning `null` (preventing accidental deletion on rollback).
  - Added serialized `private mutationChain: Promise<unknown> = Promise.resolve();` queue to `PlannerRepository.executeTransaction()` to serialize concurrent mutations and prevent transaction rollback race conditions.
- [x] **3. Strict Runtime Schema Validator Alignment with Domain Models (P1)**
  - In [`src/domain/schema.ts`](file:///D:/Documents/GitHub/Ownly/src/domain/schema.ts), strictly validated entities against real Domain interfaces (`PlannerTripStatus = 'planning' | 'active' | 'completed'`, `PlannerPlaceState = 'candidate' | 'done' | 'dropped'`, required `mode: PlannerTravelMode` on `PlannerTripLeg`, required `destinations` array and date fields on `PlannerTrip`, and reject unknown `schema_version` with error).
  - Updated `src/domain/schema.test.ts` and `tests/contracts/failure.contract.test.ts` with valid Domain fixtures.
- [x] **4. Extract `usePlannerData` & `usePlannerActions` with Request Epoch (P2)**
  - Modularized `usePlannerController.ts` into [`usePlannerData.ts`](file:///D:/Documents/GitHub/Ownly/src/components/planner/usePlannerData.ts) (state, selectors, metrics, and `loadEpochRef` request counter to drop out-of-order stale responses) and [`usePlannerActions.ts`](file:///D:/Documents/GitHub/Ownly/src/components/planner/usePlannerActions.ts) (encapsulating all mutations and UI action authority).
  - Updated `PlannerHome.tsx` to delegate 100% of trip mutations (`upsertTrip`, `deleteTrip`, `toggleVisitLock`) to the controller, removing direct repository calls.
- [x] **5. Clean Remaining Capture V2 Legacy Types (P2)**
  - Removed all remaining V2 migration functions, interfaces (`CaptureContextV2`, `CaptureCandidateV2`, `migrateV2ToV3`), and V2 version tags in `src/domain/capture.ts`, `src/extension/capture-state.ts`, and `src/domain/planner.ts`.
- [x] **6. Differentiate Heuristic vs Manual Leg Sources (P2)**
  - Expanded `PlannerTripLeg.source` to `'heuristic' | 'manual' | 'openrouteservice'` and updated `calculateDefaultTripLeg` to assign `source: 'heuristic'`.
- [x] **7. Comprehensive Multi-Target Verification**
  - Ran `validate:fast`, `validate:extension` (172/172 tests passed), `validate:shared` (58/58 test suites, 533/533 tests passed), `npm run build` (Next.js full production build), and full `validate` (100% clean).

## Completed: Core Architectural Technical Debt Clearance & P1/P2 Robustness Remediation (2026-09-05)
- [x] **1. Planner Multi-File Mutation Transaction & Rollback Primitive (P1)**
  - Implemented transactional execution primitive with rollback checkpoints in [`src/services/PlannerRepository.ts`](file:///D:/Documents/GitHub/Ownly/src/services/PlannerRepository.ts).
  - Refactored `addVisit`, `removeVisit`, `reorderVisits`, `swapTripDays`, `setStaySpan`, `mergePlaces`, `deleteTrip` to execute atomically.
  - Fixed `addVisit` validation order (validated timing & parameters BEFORE mutating/shifting existing visits).
  - Added atomicity failure & rollback unit tests in `src/services/PlannerRepository.schedule.test.ts`.
- [x] **2. Fail-Closed Mutation Reads vs Tolerant Diagnostic Scans (P1)**
  - Added `{ strict?: boolean }` to `PlannerRepository.list()`; default to fail-closed on mutations and tolerant on Doctor diagnostic scans.
- [x] **3. CI Pipeline & Test Gate Coverage (P1)**
  - Added `src/data/**` to `affected-runtime` regex in [`.github/workflows/pages.yml`](file:///D:/Documents/GitHub/Ownly/.github/workflows/pages.yml).
  - Ensured all repository tests are executed during CI validation gates via `"validate:shared"`.
- [x] **4. Comprehensive Runtime Schema Validation for Planner Entities (P1/P2)**
  - Expanded `validateEntity()` in [`src/domain/schema.ts`](file:///D:/Documents/GitHub/Ownly/src/domain/schema.ts) to validate `trip`, `trip_place`, `trip_visit`, `trip_leg`, `trip_expense`.
  - Wired runtime validation into `PlannerRepository` parser to reject corrupted/invalid YAML fields.
- [x] **5. Consolidate Single Source of Truth for Schema Version (P2)**
  - Consolidated `CURRENT_SCHEMA_VERSION = '0.1'` into a single authority and updated all imports.
- [x] **6. Remove Dead Migration Framework & Legacy Capture V2 Compatibility (P2)**
  - Deleted `src/domain/migrations/` and updated test contracts.
  - Removed legacy V2 storage key, normalizers, facade, and dummy no-op handlers in `src/extension/capture-state.ts`, `src/extension/sidepanel/store.ts`, `src/extension/background.ts`.
- [x] **7. Guarantee Injective Entity Filename Mapping (P2)**
  - Updated `entityFileName` to use `stablePlannerHash(id)` for all entities, preventing collisions on non-alphanumeric IDs.
- [x] **8. Extract Planner Mutation Coordinator & Controller (P2)**
  - Extracted `usePlannerController.ts` from `PlannerHome.tsx` to prevent async mutation race conditions and snapshot overwrites.
- [x] **9. Full Multi-Target Verification & Testing**
  - Ran `npm test`, `npm run test:mcp`, `npm run validate:fast`, `npm run validate:extension`, `npm run validate:shared`, `npm run build`, and `npm run validate` (100% passing across all 58 test suites / 533 tests).

## Completed: Agoda Saved Trips & Collections Inline Buttons, Hotel Entity Resolution & Google Maps Standardization (2026-09-05)
- [x] **1. Upgrade Agoda Card & Title Selectors for Modern Trips / Saved Lists (`src/extension/adapters/agoda.ts`)**
  - Supported all Agoda saved list containers: `div[data-selenium="saved-hotel-item"]`, `div[data-selenium="trip-saved-card"]`, `div[data-selenium="saved-item"]`, `div[class*="TripItem"]`, `div[class*="SavedItem"]`, `div[class*="SavedHotel"]`, `div[class*="TripCard"]`, `div[class*="PropertyCard"]`, `[data-element="saved-hotel-card"]`, `[data-element="hotel-card"]`, `[role="listitem"]`.
  - Implemented bidirectional matching in `initInlineButtons`: matching both by card containers AND by candidate title elements (`[data-selenium="hotel-name"]`, `a[href*="/hotel/"]`, `div[class*="HotelName"]`, `h2`, `h3`) with `titleEl.closest(...)`.
- [x] **2. Deep Agoda Hotel Entity Page & JSON-LD Resolution (`resolveAgodaHotelToMapsPlace`)**
  - When clicking "📌 放入案板", extracts hotel URL (`a[href*="/hotel/"]`, `data-hotel-id`, `data-property-id`) and fetches hotel detail page in background.
  - Extracts Schema.org JSON-LD microdata (`@type: "Hotel"`, `name`, `aggregateRating`, `geo` coordinates, `address`, `telephone`, `priceRange`), hotel property facts (`opened_year`, `renovated_year`, `room_count`).
  - Standardizes output into Google Maps object (`sourceProvider: 'google_maps'`), `kind: 'stay'`, `types: ['lodging', 'hotel', 'establishment']`, and canonical Google Maps URL (`/maps/place/.../@lat,lng,17z` or search fallback).
- [x] **3. Upgrade Agoda Saved List Batch Detection (`detectAgodaSavedList`)**
  - Senses Agoda Trips & Saved list pages (`/trips/detail?navBack=true&id=...&tab=saved`), parsing all hotel cards into a clean batch list for 1-click import in Sidepanel.
- [x] **4. Unit Tests & Automated Verification**
  - Added unit tests for Agoda card parsing, hotel entity resolution, and saved list detection in `src/extension/utils.test.ts`.
  - Validated with `npm run validate:extension` (171/171 tests passed), `npm run validate:fast` (0 errors), and `npm run validate:shared` (100% contracts & parity passing).




## Completed: Automatic Commute Calculation, Transit-to-Transit Skip & Travel Mode Switching (2026-09-05)
- [x] **1. Domain Model: `calculateDefaultTripLeg`, Transit Hub Skip & Motorcycle Mode Support (`src/domain/planner.ts`)**
  - Added `'motorcycle'` to `PlannerTravelMode` and configured `PLANNER_TRAVEL_MODE_CONFIG` with emojis (`🚗`, `🚶`, `🛵`, `🚲`, `🚇`) and labels.
  - Implemented `isTransitHubPlace` checking `kind === 'transit'` and airport/station patterns.
  - Implemented `estimateCommuteDurationMinutes` and `calculateDefaultTripLeg`:
    - Skips inter-transit legs when both `from` and `to` are transit hubs.
    - Uses default `trip.transport_mode` and estimates distance & duration from Haversine coordinates with city road factor ($1.3\times$).
- [x] **2. MCP & Modal Travel Mode Extensions (`scripts/mcp/openrouteservice.ts` & `src/components/planner/CreateTripModal.tsx`)**
  - Updated `openRouteServiceProfile` to support `'motorcycle'` mapping to `driving-car`.
  - Added 🛵 摩托车 / 电瓶车 option to `CreateTripModal.tsx`.
- [x] **3. Automatic Day Leg Calculation & Interactive Mode Switcher in Planner (`src/components/planner/PlannerHome.tsx`)**
  - Synthesized `effectiveDayLegs` on the fly for all adjacent stops on active day (omitting transit-to-transit pairs).
  - Rendered rich travel badge with mode emoji (`🚗 15 min · 3.2 km`), duration, distance, and direct Google Maps route link.
  - Rendered `✈️ / 🚆 跨城交通 · 依据票务时间` for transit-to-transit pairs.
  - Implemented click-to-switch mode Popover allowing user to toggle between `🚗 打车/自驾`, `🚶 步行`, `🛵 摩托车`, `🚲 自行车`, `🚇 公共交通` with instant recalculation & persistence.
- [x] **4. Comprehensive Unit Tests & Build Verification**
  - Added unit tests for `calculateDefaultTripLeg`, `isTransitHubPlace`, and mode switching in `src/domain/planner.test.ts` (89/89 tests passing).
  - Validated with `npm run validate:fast` (0 errors, clean types & linter) and `npm run build` (Next.js production build succeeded).

## Completed: Google Travel Deep Entity Resolution & Google Maps Query Pin Auto-Enrichment (2026-09-05)
- [x] **1. Deep Hotel Entity Resolution on Google Travel (`src/extension/adapters/google-travel.ts`)**
  - Added `findGoogleTravelHotelEntityUrl` checking `data-hotel-id`, `data-travel-entity-id`, `data-entity-id`, `c-wiz` containers, and entity links to formulate canonical entity URLs (`https://www.google.com/travel/hotels/entity/${hotelId}`).
  - Upgraded `parseGoogleTravelCard` and `resolveGoogleTravelEntityToMapsPlace` to extract JSON-LD microdata, exact postal address, coordinates, verified ratings, nightly room pricing, and hotel property facts (`opened_year`, `renovated_year`, `room_count`).
  - Standardized captured entities to Google Maps places (`sourceProvider: 'google_maps'`) with `kind: 'stay'` and canonical Maps URLs.
- [x] **2. Authoritative Google Maps Query Pin Resolution with `tbm=map` & PB Array Extraction (`src/extension/enrichment.ts` & `src/extension/google-maps-research.ts`)**
  - Upgraded `extractGoogleMapsPreviewFacts` to parse both direct place nodes and nested array elements from Google Search/Maps protobuf structures.
  - Added recursive protobuf tree scanning in `extractGoogleMapsResearchFromHtml` for `APP_INITIALIZATION_STATE` search result lists.
  - Added `googleMapsSearchTbmUrl` (`/search?tbm=map&q=...`) to Step 1 search candidates in `enrichPlaceMetadata` and `resolveGoogleMapsEntity`, providing direct, fast entity resolution from Google Maps backend.
  - Cleaned up failed resolve cache upon successful mutation to avoid 15m cooldown lockouts.
- [x] **3. Automated Verification & Regression Testing**
  - Added unit test in [`src/extension/enrichment.test.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/enrichment.test.ts) covering Pattaya Discovery Beach Hotel resolution via `tbm=map` JSON response.
  - Validated with `npm run validate:extension` (162/162 tests passed, clean extension build).
  - Validated with `npm run validate:fast` (0 errors, clean lint, types & terminology).
  - Validated with `npm run validate:shared` (100% contract, parity & MCP tests passing).

## Completed: In-Page Capture Feedback, Category Inference & Inbox In-Place Candidate Editor (2026-09-05)
- [x] **1. Fix In-Page "放入案板" Button Click Execution (`src/extension/ui/inline-capture-button.ts`)**
  - Fix event isolation: Removed `stopImmediatePropagation()` from `isolateEvent` so button click listener executes cleanly.
  - Retained `stopPropagation()` and `preventDefault()` to prevent outer anchor clicks and navigation.
  - Verified live button feedback transitions: `⏳ 采集中...` -> `✓ 已放入案板` / `ℹ️ 该地点已在案板中`.
- [x] **2. Fix Place Kind Inference & Tag Cleaning for Lodging ("宾馆", "度假村" -> stay)**
  - In [`src/domain/planner.ts`](file:///D:/Documents/GitHub/Ownly/src/domain/planner.ts), fixed regex grouping bug on line 729 and expanded Chinese/multilingual lodging patterns (`度假村`, `宾馆`, `旅馆`, `客栈`, `民宿`, `服务式公寓`, `长住型酒店`, `度假酒店`, `精品酒店`, `商务酒店`, `温泉旅馆`, `青旅`, `青年旅舍`, `招待所`, etc.).
  - In `ensurePlaceKindTag()`, filtered out generic `'其它'` / `'其他'` / `'Other'` and obsolete primary kind tags when kind is specific (e.g. `stay`), eliminating dual tags like `['住宿', '其它']`.
  - In `resolveAndEnrichCapturedPlace` (`background.ts`), refreshed `user.tags` when kind is enriched/updated.
- [x] **3. Implement In-Place Candidate Place Editor Directly in Inbox List (`src/extension/sidepanel/ui.ts` & `handlers.ts`)**
  - Inside candidate card rendering, when `store.editingCandidateId === place.id`, expanded a dedicated in-place edit drawer.
  - Supported direct editing of `kind` (dropdown), `priority` (must/want/optional), `price`, `rating`, `why`, `notes`, and `tags`.
  - Wired inline `✓ 保存` and `✕ 取消` buttons to update `store.stateV3.places`, persist to storage, and exit edit mode.
  - Reused clean, modern CSS styling for `.candidate-inline-editor` in `extension/sidepanel.css`.
- [x] **4. Comprehensive Multi-Target Automated Verification**
  - Ran unit tests in `planner.test.ts` covering `宾馆`, `度假村`, and all category kinds (84/84 tests passed).
  - Ran `npm run validate:extension` (161/161 tests passed, clean extension build).
  - Ran `npm run validate:fast` (0 errors, clean lint and types).
  - Ran `npm run validate:shared` (100% contracts & MCP passing).

## Completed: Planner Date Tabs Drag-and-Drop Itinerary Day Swapping (2026-09-05)
- [x] **1. Add `swapTripDays` to `PlannerRepository` & Pure Domain Logic**
  - Implemented atomic date swapping for all `PlannerTripVisit`s belonging to `(trip_id, dateA)` and `(trip_id, dateB)`.
  - Preserved 100% of visit sort orders, start/end times, durations, and locked states.
  - Asserted valid trip date boundaries and handled trips with no visits or single-sided visits cleanly.
  - Added unit test suite in `src/services/PlannerRepository.schedule.test.ts` (all 22 tests passing).
- [x] **2. Implement Drag-and-Drop & Accessible Swap Modal in `PlannerHome.tsx`**
  - Added HTML5 `draggable` and drag event handlers (`onDragStart`, `onDragOver`, `onDragLeave`, `onDrop`, `onDragEnd`) to Day Tabs.
  - Provided visual drop target indicator with scale and ring highlights when hovering over a target day tab.
  - Added an accessible `⇄ 互换` button and quick picker modal in the date navigation bar for mobile/touch screens.
  - Provided instant UI update and feedback notification on successful swap.
- [x] **3. Verification and Testing**
  - `npm run validate:fast`: 0 errors.
  - `npm run validate:extension`: 161 tests passing, clean build.
  - `npm run build`: Next.js production build succeeded.
## Completed: Universal In-Page "📌 放入案板", Google Maps Detail Pane Integration & Inbox Deduplication (2026-09-05)
- [x] **1. Fix Inline Capture Button Visibility & Absolute Event Isolation (`src/extension/ui/inline-capture-button.ts`)**
  - Resolved button displacement: Directly inserted before/within anchor without breaking parent flex/grid layouts.
  - Complete pointer event suppression (`preventDefault` + `stopPropagation` on `click`, `mousedown`, `pointerdown`) so buttons inside or near `<a>` never trigger navigation.
  - Added state styling for existing items: `.is-exists` displaying `ℹ️ 该地点已在案板中` with distinct teal/blue feedback.
- [x] **2. Unify Google Maps Detail Pane & Search Results with In-Page "放入案板" (`src/extension/adapters/google-maps.ts`)**
  - Injected inline "📌 放入案板" button directly on Google Maps single POI detail pane header (`h1.DUwDvf`, `.fontHeadlineLarge`, action bar).
  - Injected inline "📌 放入案板" button on Google Maps search result cards (`div.Nv2PK`, `div.THOPZb`).
  - Automatically queries `extractGoogleMapsPlace()` with automatic URL/pushState change detection.
- [x] **3. Fix & Refine In-Page Buttons Across Google Travel, Agoda, Booking, Tabelog, Xiaohongshu**
  - Google Travel: Refined card title selector to iterate over actual hotel names without over-marking sibling `<c-wiz>` components. Added single entity page button injection (`/hotels/entity/...`).
  - Agoda, Booking.com, Tabelog, Xiaohongshu: Injected inline button across both search/list items and single hotel/restaurant/note detail views.
- [x] **4. Streamline Sidepanel: Focus on Inbox Collection & Saved Lists Batch Import**
  - Retired noisy single-place auto-reading form in Sidepanel.
  - Senses and displays Saved List batch sync card when viewing a list/collection, and keeps the Inbox collection drawer front and center when browsing single places.
- [x] **5. Implement Robust Inbox Deduplication & Notifications (`src/extension/background.ts`)**
  - When saving via "放入案板" or background worker, detects existing places via resilient identity (Place ID, CID, canonical URL, coordinates $< 150\text{m}$, title).
  - If existing: merges new observations, returns `alreadyExists: true`, and triggers informative `ℹ️ 该地点已在案板中` feedback on the button and badge.
  - If new: creates place, returns `alreadyExists: false`, and triggers background Google Maps resolution.
- [x] **6. Multi-Target Automated Verification Pass**
  - `npm run validate:extension` (161/161 tests passing, clean build).
  - `npm run validate:fast` (0 errors, clean types & linter).
  - `npm run validate:shared` (100% contracts & MCP passing).


## Completed: Inline Capture Button Isolation, Deduplication & Interaction Architecture Alignment (2026-09-05)
- [x] **1. Isolate In-Page Inline Capture Buttons from Enclosing Anchor Tags**
  - In [`src/extension/ui/inline-capture-button.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/ui/inline-capture-button.ts), detect if the insertion anchor is inside an `<a>` link (`anchor.closest('a')`) and insert the button container outside/before the anchor element.
  - Added full event propagation stops (`click`, `mousedown`, `mouseup`, `pointerdown`, `pointerup` with `e.stopPropagation()`).
  - Added `margin-right: 12px` to prevent accidental misclicks on hotel titles.
- [x] **2. Eliminate Duplicate Buttons on Google Travel Cards**
  - In [`src/extension/adapters/google-travel.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/adapters/google-travel.ts), bind exclusively to outermost card containers (`c-wiz[data-hotel-id]`, `div.uaTTDe`, `div.nId1nc`, `[role="listitem"]`).
  - Automatically mark cards and all descendant elements with `dataset.ownlyCardInjected = 'true'` upon injection to eliminate duplicate buttons caused by nested sub-`<c-wiz>` components.
- [x] **3. Architectural Clarification & Separation: "当前识别地点" vs External In-Page Capture**
  - On non-Google Maps search and list pages (Google Travel, Agoda, Booking.com, Tabelog), `extractPlace()` now cleanly returns `null`, disabling phantom top-card extraction.
  - Established clear interaction boundary: Google Maps single POI detail pane $\rightarrow$ Auto "当前识别地点"; External travel lists/saved collections $\rightarrow$ Inline "📌 放入案板" + batch saved list import with asynchronous Google Maps entity resolution.
- [x] **4. Full Multi-Target Validation Pass**
  - `npm run validate:extension` (161/161 tests passing, clean extension build).
  - `npm run validate:fast` (0 errors, clean types & linter).
  - `npm run validate:shared` (100% contracts & MCP passing).

## Completed: Technical Debt Clearance & Universal Provider Adapter Architecture (2026-09-05)
- [x] **1. Create Universal Inline Capture Button UI Component (`src/extension/ui/inline-capture-button.ts`)**
  - Extracted reusable Shadow-DOM encapsulated button injection helper with unified states (idle -> loading -> success -> error).
  - Eliminated duplicated button styling and DOM injection boilerplate across all providers.
- [x] **2. Establish Modular Provider Adapter Architecture (`src/extension/adapters/`)**
  - Created `types.ts` defining `PageAdapter`, `CurrentResearchPlace`, `DetectedSavedList`, and `SavedListCardSummary` interfaces.
  - Implemented dedicated adapters: `GoogleTravelAdapter`, `AgodaAdapter`, `BookingAdapter`, `XiaohongshuAdapter`, `TabelogAdapter`, `GoogleMapsAdapter`.
  - Implemented `AdapterRegistry` (`registry.ts`) to manage dynamic provider dispatching based on URL matching.
- [x] **3. Standardize Google Maps Search & Entity Resolution Engine (`src/extension/resolution/google-maps-resolver.ts`)**
  - Encapsulated canonical Google Maps query URL formulation, 302 redirect tracking, and `APP_INITIALIZATION_STATE` protobuf extraction into a single authoritative engine.
  - Standardized entity resolution across background worker auto-enrichment and content script lookups.
- [x] **4. Refactor `src/extension/content.ts` into a Lean Orchestration Script**
  - Replaced monolithic if/else cascades and redundant card parser code in `content.ts` with clean `AdapterRegistry` delegations.
  - Reduced `content.ts` from 2,864 lines down to ~700 lines (~75% reduction) with improved testability and modularity.
- [x] **5. Full Multi-Target Verification Pass**
  - Validated with `npm run validate:extension` (161/161 tests passing, clean build).
  - Validated with `npm run validate:fast` (0 errors, clean types & linter).
  - Validated with `npm run validate:shared` (100% contracts & MCP passing).


## Completed: Universal Quick Capture ("放入案板") & Authoritative Google Maps Entity Resolution (2026-09-05)
- [x] **1. Architecture Specification: 3-Layer Capture & Resolution Flow**
  - Defined clear separation: (1) DOM Card Ingestion -> (2) Instant Worker Save (0ms latency) -> (3) Asynchronous Background Google Maps Entity Resolution.
- [x] **2. Implement Asynchronous Background Entity Resolver (`resolveAndEnrichCapturedPlace`)**
  - In [`src/extension/background.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/background.ts), trigger background resolution immediately upon `savePlaceIntoInboxDirectly`.
  - Mutate stored `CapturePlace` in `chrome.storage.local` with resolved Google Place ID (`0x...:0x...`), canonical Place URL (`/maps/place/...` or `cid=...`), coordinates, verified ratings/reviews, and opening hours.
  - Broadcast `OWNLY_STORAGE_CHANGED` to live-update the Sidepanel and App bridge.
- [x] **3. Upgrade Google Maps Search Resolution in `enrichment.ts` & `google-maps-research.ts`**
  - Query desktop Google Maps `/maps/search/<query>?hl=zh-CN` to capture 302 entity redirect URLs directly (`/maps/place/...`).
  - Extract hex CID, Place ID, coordinates, and canonical address from `APP_INITIALIZATION_STATE` and JSON-LD.
  - Formulate canonical Google Maps URLs and update `source.url` from search query to real entity page.
- [x] **4. Standardize Universal In-Page Inline Buttons Across Providers**
  - Ensured uniform front-of-title inline button injection and clean data normalization across Google Maps, Google Travel, Agoda, Booking.com, Xiaohongshu, and Tabelog.
- [x] **5. Full Verification & Regression Testing**
  - Ran `npm run validate:extension` (161/161 tests passed), `npm run validate:fast` (0 errors), and `npm run validate:shared` (100% passed).


## Completed: Universal Google Maps Standardization for Xiaohongshu, Booking.com & Agoda (2026-09-04)
- [x] **1. Extend Manifest & Domain Support for Agoda**
  - Added `https://www.agoda.com/*`, `https://*.agoda.com/*` to [`extension/manifest.json`](file:///D:/Documents/GitHub/Ownly/extension/manifest.json) `host_permissions` and `content_scripts`.
  - Added `'agoda'` to `PlannerPlaceSourceProvider` and `CaptureSourceProvider` in [`src/domain/planner.ts`](file:///D:/Documents/GitHub/Ownly/src/domain/planner.ts) and [`src/domain/capture.ts`](file:///D:/Documents/GitHub/Ownly/src/domain/capture.ts).
  - Updated `inferSourceProvider(url)` and `PROVIDER_META` to detect and display Agoda.
- [x] **2. Standardize Booking.com Extraction & Inject Inline Card Buttons**
  - Extracted Schema.org JSON-LD microdata, exact coordinates, address, phone, rating, nightly price, and hotel facts from Booking.com.
  - Standardized output to `sourceProvider: 'google_maps'` with canonical Google Maps URLs (`https://www.google.com/maps/place/...` or `/maps/search/?api=1&query=...`).
  - Injected inline "📌 放入案板" buttons on Booking.com search result cards (`div[data-testid="property-card"]`, `div.sr_item`, `div[role="listitem"]`) with dynamic mutation & scroll observers.
- [x] **3. Implement Agoda Extraction, Saved List Batch Ingest & Inline Card Buttons**
  - Implemented `extractAgodaPlace()` parsing JSON-LD microdata, header name, rating, address, price, and hotel property facts.
  - Implemented `detectAgodaSavedList()` supporting Agoda Saved / Trips collection pages (`/trips/detail?navBack=true&id=...&tab=saved`) and search lists for 1-click batch import in Sidepanel.
  - Standardized output to `sourceProvider: 'google_maps'` with canonical Google Maps URLs (`https://www.google.com/maps/search/?api=1&query=${hotelName + address}&hl=zh-CN`).
  - Injected inline "📌 放入案板" action buttons directly in front of each hotel name across Agoda saved lists (`div[data-selenium="saved-hotel-item"]`) and search cards.
- [x] **4. Standardize Xiaohongshu Note & Places List Extraction**
  - In `extractXiaohongshuPlace()` and `detectXiaohongshuNoteList()`, constructed canonical Google Maps search URLs (`https://www.google.com/maps/search/?api=1&query=...`) and standardized `sourceProvider: 'google_maps'`.
  - Preserved original note title and context in `summary` (`来自小红书笔记「...」`) and standard taxonomy `types: ['point_of_interest', 'establishment']`.
- [x] **5. Full Verification & Regression Testing**
  - Added test cases in [`src/domain/planner.test.ts`](file:///D:/Documents/GitHub/Ownly/src/domain/planner.test.ts).
  - Validated with `npm run validate:extension` (161/161 tests passing, clean build).
  - Validated with `npm run validate:fast` (0 errors, clean types & linter).
  - Validated with `npm run validate:shared` (100% contracts & MCP passing).

## Completed: Google Travel Entity Deep Resolution & FAB Cleanup (2026-09-04)
- [x] **1. Remove Legacy Global Floating Ball (FAB)**
  - Completely deleted the fixed bottom-right floating pill (`#ownly-quick-capture-fab-root`) from [`src/extension/content.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/content.ts) to keep page viewports clean.
  - Retained clean inline card-level "📌 放入案板" action buttons on Google Travel cards.
- [x] **2. Deep Entity Link Resolution (`resolveGoogleTravelEntityToMapsPlace`)**
  - When clicking "📌 放入案板" on a Google Travel card, the extension fetches the hotel entity page (`/travel/hotels/entity/...`) in the background.
  - Extracts Schema.org JSON-LD microdata, exact postal address, phone, geo-coordinates, rating, review count, nightly pricing, and hotel property facts (`opened_year`, `renovated_year`, `room_count`).
- [x] **3. Standardize Output to Google Maps Objects**
  - Stored captured hotel entities strictly as standard Google Maps places (`sourceProvider: 'google_maps'`), generating canonical Google Maps URLs (`https://www.google.com/maps/place/...` or search query fallbacks).
  - Assigned standard lodging taxonomy (`types: ['lodging', 'hotel', 'establishment']`) and inferred `stay` kind for 100% compatibility with Planner route calculation, hotel comparison, and itinerary scheduling.
- [x] **4. Full Validation Pass**
  - `npm run validate:extension` (161/161 tests passing, clean build).
  - `npm run validate:fast` (0 errors, clean types & linter).
  - `npm run validate:shared` (100% contract, parity & MCP tests passing).

## Completed: Google Travel Search List Extraction & Inline Card Quick Capture (2026-09-04)
- [x] **1. Filter Out Generic Search Titles in Place Detection**
  - Extended `FAKE_PLACE_PATTERNS` and `isGenericNavigationTitleLocal` in [`src/extension/utils.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/utils.ts) and [`src/extension/content.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/content.ts) to reject `Google Travel \d+ results`, `\d+ 处搜索结果`, `Search results`, and generic search headers.
- [x] **2. Implement Card-Level Parser `parseGoogleTravelCard(cardEl)`**
  - Implemented card-level parser in [`src/extension/content.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/content.ts) parsing hotel title, entity URL (`/travel/hotels/entity/...`), rating, reviews, nightly pricing, currency, address, and hotel property facts from individual Google Travel hotel cards.
- [x] **3. Upgrade `extractGoogleTravelPlace()` for Search/List Pages**
  - On `/travel/search` or hotel search views, dynamically detects the active/focused hotel card or entity card to extract the concrete hotel (e.g. Mayana Beach Resort) rather than the page query title.
- [x] **4. Inject Inline Quick Capture Buttons on Google Travel Hotel Cards**
  - Injected an encapsulated "📌 放入案板" button directly on every hotel card on Google Travel search pages.
  - Wired to `OWNLY_QUICK_SAVE_PLACE` with live loading and `✓ 已放入案板` success feedback.
  - Setup `MutationObserver` and scroll listener to automatically attach inline buttons to newly scrolled/loaded hotel cards.
- [x] **5. Unit Tests & Verification**
  - Added test cases in [`src/extension/utils.test.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/utils.test.ts) for Google Travel search titles rejection and entity URL extraction.
  - Validated with `npm run validate:extension` (160/160 tests passed, extension build clean) and `npm run validate:fast` (0 errors, clean lint & types).

## Completed: Hotel Opening Year & Renovation Facts Extraction (2026-09-04)
- [x] **1. DOM Extraction & Multilingual Pattern Matching**
  - Analyzed DOM structures across Google Maps (About tab, editorial summaries, JSON-LD), Google Travel (Property overview chips & amenities), and Booking.com (Description fine print & facilities).
  - Implemented `extractHotelPropertyFacts(textOrSnippet?, doc?)` in [`src/extension/utils.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/utils.ts) parsing:
    - `opened_year`: Opening/Built/Established year in Chinese (`2022年全新开业`, `自2021年开始接待客人`, `始建于2019`) and English (`Opened in 2022`, `Built in 2020`, `Established in 1998`, `Welcoming guests since Dec 2019`, JSON-LD `foundingDate`/`dateCreated`).
    - `renovated_year`: Renovation year in Chinese (`2024年重新装修`, `最近装修：2023年`) and English (`Renovated in 2023`, `Refurbished in 2024`).
    - `room_count`: Total room/suite count (`120 间客房`, `85 rooms`, JSON-LD `numberOfRooms`).
    - `check_in` / `check_out`: Times (`15:00` / `12:00`, `Check-in from 14:00, check-out until 11:00`).
- [x] **2. Domain Model & Signal Automation**
  - Defined unified `HotelPropertyFacts` in [`src/domain/planner.ts`](file:///D:/Documents/GitHub/Ownly/src/domain/planner.ts).
  - Preserved `hotel_facts` on `CapturePlace`, `PlannerTripPlace`, `PlannerScheduledPlace`, and `CurrentResearchPlace`.
  - Implemented `deriveHotelSignals(facts)` to automatically generate user-facing badges (e.g. `🆕 2024年开业 (新开业)`, `📅 2019年开业`, `✨ 2025年新装修`, `🔨 2018年装修`).
  - Automatically populated badges into `signals` upon capturing or converting places into Planner candidates.
- [x] **3. UI Presentation in Hotel Comparison Modal**
  - Updated [`src/components/planner/HotelComparisonModal.tsx`](file:///D:/Documents/GitHub/Ownly/src/components/planner/HotelComparisonModal.tsx) to display `📅 ${opened_year} 开业` and `✨ ${renovated_year} 装修` badges in both the Table view (under Category) and the Grid Card view.
- [x] **4. Comprehensive Unit Tests & Validation**
  - Added unit test suite in [`src/extension/utils.test.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/utils.test.ts) covering Chinese, English, Booking.com formats, and signal generation.
  - Validated with `npm run validate:extension` (159/159 tests passed, extension build clean).
  - Validated with `npm run validate:fast` (0 errors, clean lint & types).

## Completed: Google Travel Provider & In-Page Quick Capture FAB (2026-09-04)
- [x] **1. Clarify `.bz` ccTLD & Google Travel Architecture**
  - Clarified that `.bz` is Belize's ccTLD (Google regional portal), where Google Travel hotel searches often route.
  - Authored [`docs/CAPTURE_PRODUCT_RFC.md`](file:///D:/Documents/GitHub/Ownly/docs/CAPTURE_PRODUCT_RFC.md) formally defining the mental model: "Inbox 是案板 (Staging Area for raw scraping & grooming) -> Planner 是下锅 (Trip Itinerary & Budget)".
  - Logged tracking RFC issues (#CAPTURE-RFC-01 ~ 04) for future sync decoupling without breaking current single-source-of-truth invariants.
- [x] **2. Implement Google Travel Place Extractor**
  - Updated [`extension/manifest.json`](file:///D:/Documents/GitHub/Ownly/extension/manifest.json) `host_permissions` and `content_scripts` to cover `google.com/travel/*`, `google.com.bz/*`, `google.co.th/travel/*`, and major regional ccTLDs.
  - Added `'google_travel'` to [`src/domain/planner.ts`](file:///D:/Documents/GitHub/Ownly/src/domain/planner.ts) `PlannerPlaceSourceProvider` and `inferSourceProvider()`.
  - Added `'google_travel'` to [`src/domain/capture.ts`](file:///D:/Documents/GitHub/Ownly/src/domain/capture.ts) `CaptureSourceProvider`.
  - Added `google_travel: { emoji: '✈️', label: 'Google Travel' }` to [`src/extension/sidepanel/ui.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/sidepanel/ui.ts).
  - Implemented `extractGoogleTravelPlace()` in [`src/extension/content.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/content.ts) parsing hotel title, rating, review count, nightly pricing, currency detection, address/neighborhood, coordinates, entity ID, and amenities.
- [x] **3. Implement In-Page Quick Capture Floating Ball (FAB)**
  - Injected Shadow-DOM encapsulated floating pill button (`#ownly-quick-capture-fab-root`) in [`src/extension/content.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/content.ts) on all supported travel/map sites.
  - Added states: `idle` (`📌 放入案板`), `loading` (`⏳ 采集中...`), `success` (`✓ 已放入案板`), `error` (`⚠️ 未检测到地点`).
  - Implemented atomic worker storage handler `OWNLY_QUICK_SAVE_PLACE` in [`src/extension/background.ts`](file:///D:/Documents/GitHub/Ownly/src/extension/background.ts) saving directly into the active Inbox collection ("案板") with background badge feedback (`✓`).
- [x] **4. Verification & Validation**
  - Added unit test cases for `google_travel` in [`src/domain/planner.test.ts`](file:///D:/Documents/GitHub/Ownly/src/domain/planner.test.ts).
  - Validated with `npm run validate:extension` (155/155 tests passed, extension build clean).
  - Validated with `npm run validate:fast` (0 errors, clean lint & types).
  - Validated with `npm run validate:shared` (100% contracts & MCP passing).

---

## Completed: UI Polish & Unified Recognition/Edit Experience (2026-09-04)
- [x] **1. Save Button Visual Polish & High Contrast**
  - Updated `--primary` from dark black (`#1c1917`) to vibrant Ownly emerald green (`#047857` / `#059669`) in [`extension/sidepanel.css`](file:///D:/Documents/GitHub/Ownly/extension/sidepanel.css).
  - Ensured white text (`#ffffff`) has crisp, sharp contrast and subtle shadow so button labels ("➕ 加入候选池", "✓ 更新地点信息") are immediately readable.
- [x] **2. Unify Card Editing into Single Authoritative Panel**
  - Removed confusing duplicate inline edit box (`buildInlineEditor`) inside Inbox cards.
  - Clicking ✏️ on any card in Inbox now loads the place into the top `#placePanel` / `#captureForm`, opens `#addPanel`, scrolls to it, and gives the user ONE single authoritative Save button (`#btnCaptureSubmit`).
  - Active card in Inbox receives `.is-active-editing` highlight badge (`✏️ 编辑中`) with clean emerald border.
- [x] **3. Code Cleanup & Verification**
  - Cleaned up obsolete inline action listeners (`save-inline`, `cancel-inline`) and unused helper functions.
  - Verified with `npm run validate:extension` (155/155 tests passed) and `npm run validate:fast` (0 errors).

---

## Completed: Currency Detection & Override Propagation Fix (2026-09-04)
- [x] **1. Root Cause Analysis & Confirmation**
  - Clarified why Google Maps hotel pages in English UI output bare `$84` without explicit `SGD` token in the DOM.
  - Identified that `extractGoogleMapsPlace()` in `content.ts` did not pass `overrideCurrency` / `targetCurrency` into `detectCurrencyFromPage()`.
  - Discovered that bare `$` with non-dollar regional coordinates (e.g. Pattaya, Thailand) defaulted to `'USD'` in `currency-detector.ts`.
  - Found that `sidepanel/capture.ts` line 134 ternary bypassed user override if place had existing `detectedCurrency`.
- [x] **2. Implement Fixes**
  - Updated `src/extension/content.ts` to pass `overrideCurrency` and `targetCurrency` through `currentPlace()`, `extractGoogleMapsPlace()`, and `enrichFromPlaceHtml()`.
  - Updated `src/extension/sidepanel/capture.ts` to ensure `store.mapCurrencyOverride` takes top precedence in `store.currentPlace` and `store.detectedSavedList`.
  - Updated `src/extension/sidepanel/handlers.ts` to ensure `store.mapCurrencyOverride` is prioritized in `buildPlaceFromDetected` and price normalizers.
- [x] **3. Write Tests & Verification**
  - Added test cases in `src/extension/currency-detector.test.ts` for bare `$84` in Pattaya with `overrideCurrency: 'SGD'` and `hintCurrency: 'SGD'`.
  - Validated with `npm run validate:extension` (155/155 passed), `npm run validate:fast` (0 errors), and `npx vitest run` (512/512 passed across 59 test suites).

---

## Completed: Full-Codebase Quality Elevation & Technical Debt Clearance (2026-09-04)
- [x] **Phase 1: Remove Dead Files & Unreferenced Stubs**
  - [x] Deleted orphaned `src/domain/entities/` (`Place.ts`, `Trip.ts`, `Capture.ts`, `index.ts`)
  - [x] Deleted unreferenced stub re-exports: `src/domain/budget.ts`, `src/domain/stay.ts`
  - [x] Deleted unreferenced stubs: `src/services/PlannerFormatter.ts`, `src/services/PlannerDomainService.ts`, `src/domain/ownly-health.ts`
  - [x] Updated `eslint.config.mjs` to ignore `packages/*/dist/**`
- [x] **Phase 2: Latent Bug Fixes & Edge-Case Arithmetic Safety**
  - [x] **P0 Fix**: Fixed Multi-Collection Sync data contamination and accidental ACK deletions in `src/components/planner/capture-bridge.ts`
  - [x] **P1 Fix**: Fixed `syncCapture` stale closure on `selectedTripId` / `trips` in `PlannerHome.tsx`
  - [x] **P1 Fix**: Fixed Map auto-zoom filter inconsistency and missing `filterModeChanged` trigger in `PlannerMap.tsx`
  - [x] **P1 Fix**: Extracted pure spherical `calculateBounds` with cosine latitude scaling and multi-city tolerance
  - [x] **P1 Fix**: Fixed multi-currency price sorting bug in `HotelComparisonModal.tsx` (`getPlaceConvertedNumericPrice`)
  - [x] **P1 Fix**: Fixed coordinates normalization fallback `(0, 0)` bug in `src/extension/capture-state.ts`
  - [x] **P2 Fix**: Added partial-success reporting (`succeededIds`, `failedIds`) for Planner batch operations
  - [x] Guarded against division-by-zero in `src/domain/expense-payments.ts` and `src/domain/planner.ts`
- [x] **Phase 3: Clean Up Unused Imports & ESLint Warnings**
  - [x] Cleaned up unused variables and imports across domain, extension, services, obsidian, and components
  - [x] Cleaned up test files and unused variables
- [x] **Phase 4: Full Multi-Target Verification**
  - [x] `npm run validate:fast` (TypeScript + ESLint 0 errors + Terminology + Membership)
  - [x] `npm run validate:extension` (Manifest + Extension build + 153 tests)
  - [x] `npm run validate:shared` (Data portability + MCP + CLI + Parity)
  - [x] `npm run validate:obsidian` (Obsidian plugin build & package)
  - [x] `npm run build` (Next.js full production build)

---

## Completed: Interactive Buttons & UI Defect Fixes (2026-09-04)
- [x] **Fix 1: Deduplicate Sidepanel Click Listeners** (`src/extension/sidepanel/handlers.ts`, `src/extension/sidepanel/import-export.ts`)
  - Removed redundant 2nd registration of `btnSelectAllCandidates`, `btnBulkEnrich`, `btnEnrichCandidates`, `btnImportToPlanner`.
- [x] **Fix 2: Scope "Select All" to Filtered Visible Places** (`src/extension/sidepanel/handlers.ts`, `src/extension/sidepanel/ui.ts`)
  - Exported `getVisibleFilteredPlaces()` and ensured `btnSelectAllCandidates` only selects places currently visible under active filter/search query.
- [x] **Fix 3: Optimize Bulk Delete Feedback & Mode Reset** (`src/extension/sidepanel/handlers.ts`)
  - Added confirmation dialog, cleanly exit bulk mode when collection becomes empty, and immediately update UI state.
- [x] **Fix 4: Improve `btnDismissPlace` SPA Navigation Reset** (`src/extension/sidepanel/capture.ts`)
  - Automatically cleared `userDismissedPlaceUrl` when navigating to a distinct place URL on Google Maps SPA.
- [x] **Fix 5: Target Collection Alignment in `btnBatchAdd`** (`src/extension/sidepanel/handlers.ts`)
  - Fixed `btnBatchAdd` to add places to the currently active collection rather than forcing default Inbox.
- [x] **Fix 6: Guard Trip Switcher & Multi-Select Locks** (`src/components/planner/PlannerHome.tsx`)
  - Cleared selection state when switching trips; added `isBatchOperating` and `isScheduling` locks to prevent duplicate visit creations and spam-clicks.
- [x] **Fix 7: Reset File Input in Upload Modal & Repair Error Handling** (`src/components/planner/ImportCandidatesModal.tsx`, `src/components/planner/PlannerDoctorSection.tsx`)
  - Added `target.value = ''` reset on file read; added error reporting banner for failed doctor orphan repair.
- [x] **Fix 8: Verify Test Suites & Rebuild Extension** (`npm run build:extension && npm run validate:extension`)
  - All 132 extension tests and 488 total test suites pass with 0 errors; extension bundle compiled cleanly in `dist/extension/`.

---

# Systematic Technical Debt & Next Steps

### 1. Schema Version + Migration Framework
**Why:** Place model evolved from single-entity (schedule inside Place) to dual-entity (Place + Visit). All core entities lack version tracking. Old data from Obsidian vaults, imports, bundles, and Capture will break silently.

**Current state:** All entities have `schema_version: '0.1'` but no migration logic.

**What to build:**
- Add `schema_version` field to Trip, Place, Visit, Expense, Bundle
- Create `src/domain/migrations/` directory:
  - `trip_v1_to_v2.ts` — if any Trip shape changes
  - `place_v1_to_v2.ts` — move schedule fields → Visit
  - `visit_v1_to_v2.ts` — future-proof
  - `expense_v1_to_v2.ts` — add member_id references
  - `bundle_v1_to_v2.ts` — add checksum, version
- Migration runner: reads entity → checks version → applies transforms → writes back
- Wire into `PlannerRepository.list*()` — auto-migrate on read
- Tests: old-format fixture → migration → new-format assertion

**Acceptance criteria:**
- `plannerRepository.listPlaces()` auto-migrates v1 places to v2
- `parseTripBundle()` handles v1 bundles gracefully
- Test fixture with v1-format Place imports without error

---

### 2. Projection Audit (Post-Visit Architecture)
**Why:** #135 moved scheduling from Place to Visit. Every projection (Timeline, Map, Export, iCal, Stats) now needs to consume Visit correctly. Same Place visited twice = one Map marker but two Timeline entries.

**Current state:** #137 fixed Map dedup. Other projections may still duplicate.

**Audit matrix:**

| Projection | Should be based on | Dedup needed? | Status |
|---|---|---|---|
| Timeline | Visit (each occurrence) | No | ✅ |
| Map | Place + Visit filter | Yes — collapse repeated | ✅ #137 |
| Calendar/iCal | Visit | No | ✅ |
| Route/legs | Visit sequence | No | ✅ |
| Statistics | Place unique | Yes | ⚠️ check |
| Export PDF/Markdown | Visit | No | ⚠️ check |
| Budget estimates | Place (per-visit pricing) | Context-dependent | ⚠️ check |

**Action:** Go through each consumer of `scheduledAll` / `materializePlannerScheduledPlaces` and verify it handles repeated Place correctly.

---

### 3. Golden Dataset Regression Tests
**Why:** Recent model changes (Place→Visit, expense payments, bundle share) are covered by unit tests but lack an end-to-end regression fixture. AI-generated code changes risk breaking the full pipeline.

**What to build:**
```
test-fixtures/thailand-2026/
  ├── raw-capture.json        # Capture extension output
  ├── places.json             # Expected Place entities
  ├── visits.json             # Expected Visit entities
  ├── expenses.json           # Expected Expense entities
  ├── bundle.json             # Expected shareable bundle
  └── expected-ics.ics        # Expected iCal output
```

**Test script:**
```
Capture import → Planner ingest → Schedule visits → Add expenses → Export iCal → Bundle share → Re-import
```

Each step asserts output matches fixture. Runs on every CI.

**Acceptance criteria:**
- `npm run validate:golden` passes
- Test catches: Place model regression, Visit ordering bug, iCal UID breakage, Bundle import ID collision

---

## P1 — Should Fix Soon

### 4. Identity Debug / Merge History
**Why:** Place Identity Authority (#142) prevents bad merges but provides no user-facing explanation. Users will ask "why weren't these merged?" or "why are these two places?"

**What to build:**
- Dev-mode overlay on Place card:
  ```
  Identity
  ├── Google Place ID: ChIJ_xxx
  ├── Matched by: Google ID
  ├── Confidence: 100%
  └── Alternative candidates: [list]
  ```
- Merge history on Trip: log of `mergePlaces()` calls with before/after
- Similar to Git merge conflict UI

**Why now:** Capture data volume is increasing. Debugging identity issues without this tool will be painful.

---

### 5. Capture Enrichment Status
**Why:** Places have different levels of completeness depending on enrichment source. Users can't tell why one Place has ratings/prices and another doesn't.

**Current Place states:** `candidate`, `captured`, `planned`, `shelved`, `duplicate`, `ignored`

**Proposed enrichment pipeline:**
```
Captured → Enriched → Verified → Planned
```

**UI indicators per Place:**
```
Google Maps ✓  |  Rating ✓  |  Price ✓  |  Address ✓
```

**What to build:**
- Add `enrichment_status` field to Place: `'raw' | 'enriched' | 'verified'`
- Track which enrichment sources have been applied (Google detail, reviews, etc.)
- Show enrichment completeness badge on Place card
- Wire into Capture import flow: mark as `raw` on import, `enriched` after detail fetch

---

### 6. TripMember Model
**Why:** Expense payments reference member by string name. "小明", "Xiao Ming", "xm" could be 3 different people. No canonical member identity.

**Current state:**
- `Trip.members: string[]`
- `Expense.payments: [{member: string, amount: number}]`

**Proposed:**
```typescript
interface TripMember {
  id: string;
  name: string;
  avatar?: string;
}

interface Trip {
  members: TripMember[];
}

interface TripExpenseItem {
  payer_id: string;
  payments: Array<{ member_id: string; amount: number }>;
}
```

**Migration path:** Keep backward compat — if `members` is string[], auto-convert to `TripMember[]` with generated IDs.

---

## P2 — Nice to Have

### 7. Share Bundle Checksum + Version
**Why:** URL sharing (`#ownly-trip=xxxx`) is fragile. Chat apps truncate long URLs. Bundle files can be corrupted.

**What to build:**
- Add to bundle:
  ```json
  {
    "bundle_version": 2,
    "checksum": "sha256:xxx",
    "created_at": "2026-09-02T..."
  }
  ```
- On import: verify checksum, check version compatibility
- On URL import: detect truncation (expected length vs actual)
- Show warning: "Bundle may be truncated" if size mismatch

---

### 8. State Simplification UI
**Why:** State explosion across Place/Trip/Expense creates confusing badges and filters.

**Current states (user-visible):**

| Entity | States |
|---|---|
| Place | candidate, captured, planned, shelved, duplicate, ignored |
| Trip | draft, planning, completed, shared, imported |
| Expense | pending, settled, partial |

**Proposed simplification (user-facing only):**

| Entity | User sees | Internal |
|---|---|---|
| Place | 未规划 / 已加入行程 | candidate, captured, planned, shelved, ... |
| Trip | 规划中 / 已完成 | draft, planning, completed, shared, imported |
| Expense | 待结算 / 已结清 | pending, settled, partial |

Keep full state internally; simplify in filter chips and badges.

---

## Priority Summary

| Priority | Item | Effort | Impact |
|---|---|---|---|
| **P0** | Schema version + migration | Medium | Prevents data loss |
| **P0** | Projection audit | Low | Correctness |
| **P0** | Golden dataset regression | Medium | Prevents regressions |
| **P1** | Identity debug tool | Medium | Developer experience |
| **P1** | Capture enrichment status | Low | User clarity |
| **P1** | TripMember model | Medium | Data integrity |
| **P2** | Bundle checksum/version | Low | Share robustness |
| **P2** | State simplification UI | Low | UX clarity |
