# Todo: Capture Polish & UX Completion

## Tasks
- [x] 1. Merge & unify Saved List auto-match and Batch list UI into a single cohesive List Capture Card <!-- id: 1 -->
- [x] 2. Add "Edit" button for candidate places in the Candidates Pool drawer and support editing loaded places <!-- id: 2 -->
- [x] 3. Fix sidepanel width & button text styling (remove rigid max-width, fix button overflow / ellipsis) <!-- id: 3 -->
- [x] 4. Improve Singapore currency detection (SGD vs USD based on location, TLD .sg, Singapore address) <!-- id: 4 -->
- [x] 5. Enrich place details extraction (category/kind, rating, opening hours, address) in both entity list RPC and single-place DOM parser <!-- id: 5 -->
- [x] 6. Polish overall UX & interactions (empty states, toasts, candidate badges, filter chips) and run tests (`validate:extension`, `validate:fast`) <!-- id: 6 -->
- [x] 7. Eliminate sidebar navigation junk text in user notes ("SavedRecentsTH26Lampang4Chiang Mai17...") <!-- id: 7 -->
- [x] 8. Fix minor language character encoding & garbled text issues (Unicode NFC normalization, HTML entity decoding, zero-width character stripping, multi-layer safe URL decoding) <!-- id: 8 -->
- [x] 9. Implement self-contained inline quick editor directly within the Candidates Pool drawer <!-- id: 9 -->
- [x] 10. (P0) Upgrade WCAG contrast (fix muted #a8a29e -> #78716c), enhance card shadows, and standardize clean color-scheme in sidepanel.css <!-- id: 10 -->
- [x] 11. (P0) Refactor Candidates Pool with Event Delegation for high performance with 50+ places <!-- id: 11 -->
- [x] 12. (P1) Enlarge touch targets for chips/filters and add micro-interaction transitions and button loading feedback <!-- id: 12 -->
- [x] 13. Add coordinate extraction & geocoding helpers (`extractCoordinates`) in `src/domain/planner.ts` with unit tests <!-- id: 13 -->
- [x] 14. Create interactive Local-First `PlannerMap` component in `src/components/planner/PlannerMap.tsx` with numbered scheduled stops, candidate POIs, route line rendering, and popup actions <!-- id: 14 -->
- [x] 15. Integrate `PlannerMap` into `PlannerHome.tsx` with two-way hover sync, responsive map toggle, and 1-click scheduling directly from map markers <!-- id: 15 -->
- [x] 16. Implement exact Haversine distance, TSP route optimization (`optimizeStopsSequence`), and hotel proximity metrics in `src/domain/planner.ts` with comprehensive unit tests <!-- id: 16 -->
- [x] 17. Create `HotelComparisonModal.tsx` multi-dimensional comparison matrix (Area, Price, Rating, Distance to today's POIs, Signals/Risks, 1-click stay assignment) <!-- id: 17 -->
- [x] 18. Integrate 1-click `⚡ 顺路优化` and `🏨 酒店比选` into `PlannerHome.tsx` and verify test suite <!-- id: 18 -->
- [x] 19. Add domain helpers for Multi-Day Stay span assignment, stay night calculation, and hotel transfer day detection in `src/domain/planner.ts` with unit tests <!-- id: 19 -->
- [x] 20. Update `HotelComparisonModal.tsx` with Stay Range Selector (`[ 仅当天 ]` / `[ 连住至第 X 天 (共 N 晚) ]` / `[ 全程连住 ]`) and multi-day combined proximity index <!-- id: 20 -->
- [x] 21. Integrate Stay Range binding & Transfer Day luggage alerts into `PlannerHome.tsx`, Day Skeleton, and `PlannerMap` <!-- id: 21 -->

## Review
- **Unified List Capture Card**: Replaced redundant banners with `#smartListSection` featuring 1-click sync all (`btnSmartSyncAll`) and expandable item picker drawer (`btnToggleListPreview` + `batchListContainer`).
- **Candidate Editing Flow & In-Drawer Inline Editor**: Replaced jarring top-page form jumps with a lightweight, self-contained **Inline Quick Editor** directly inside the candidate card in the pool drawer. Users can quickly edit Kind, Priority, Area, Price, Rating, Duration, Tags, and Personal Notes in-place with instant `[ ✓ 保存 ]` / `[ ✕ 取消 ]`.
- **Responsive Width & Button Layout**: Removed rigid `max-width: 360px`, fluid auto width, responsive flex `.btn-row` wrapping without clipped text.
- **Singapore Currency Precision**: Upgraded `detectCurrencyFromPage()` in `src/extension/content.ts` with geographic coordinates (`lat 1.15-1.48, lng 103.55-104.08`), `.com.sg`/`.sg` TLDs, and Singapore keywords so bare `$` resolves to `SGD` instead of `USD`.
- **Enriched Place Metadata & Price Scraper**: Extracted category, rating, opening hours, address, per-person budget, hotel rates, and inferred kind/area in both entity list RPC parser and DOM scraper.
- **Junk Note Filtering (Problem 7)**: Removed generic `.bJzME` and `.P34g2b` from global selectors, implemented `isJunkNavigationText()` to filter out header/tab junk (`SavedRecentsTH26...`, `View moreGet app`, `添加备注`).
- **Minor Language Unicode & Encoding (Problem 8)**: Implemented `cleanExtractedText()` and `safeDecodeUri()` with Unicode NFC normalization, HTML entity decoding (`&amp;`, `&#39;`, `&#x...;`), stripping zero-width control chars (`\u200B`, `\uFEFF`, `\u00AD`), and handling multi-layer URL encoding for Thai, Japanese, Vietnamese, Arabic, etc.
- **WCAG AA Visual Contrast & Elevation (Task 10)**: Upgraded low-contrast `#a8a29e` to `#78716c` / `#57534e`, fixed clean `color-scheme: light` mode, strengthened card elevation shadow to `box-shadow: 0 1px 3px rgba(28, 25, 23, 0.05), 0 1px 2px rgba(28, 25, 23, 0.03)`.
- **High-Performance Event Delegation (Task 11)**: Replaced per-item event listener binding with container-level event delegation (`initCandidateDelegation()`) on `candidatesListContainer` capturing `[data-action]`, boosting rendering speed and memory efficiency for large candidate pools (50~100+ items).
- **Micro-interactions & Touch Ergonomics (Task 12)**: Expanded touch targets for `.chip` and `.filter-btn` with smooth scale micro-interactions (`:active { transform: scale(0.96); }`), added `.btn-loading` state and visual feedback on 1-click sync all and bulk import.
- **Interactive Spatial Map & Existing Capability Reuse (Tasks 13-15)**:
  - **Ownly Geo Capability Reuse**: Integrated Ownly's global `cities.json` database and `searchCities` engine (`src/domain/travel.ts`) to automatically geocode destination cities when places lack GPS coordinates. Reused zooming, panning, and viewport bounds math from `TravelWorldMap.tsx`.
  - **Micro Mercator Spatial Map**: Built `PlannerMap.tsx` with numbered stop pins (`1`, `2`, `3`...), connecting SVG route polylines, category emoji markers (`🏰`, `🍜`, `☕`), and interactive popup cards with 1-click `+ 当天` scheduling.
  - **Two-way Synchronized Focus**: Hovering any card in the Research Pool or Day Skeleton instantly pulses the map marker, and clicking map markers highlights the corresponding place.
  - **Full-Screen Expandable View**: Added full-screen `[ ⛶ 大地图 ]` modal view for dense multi-stop city itineraries.
- **TSP Route Optimization & Hotel Comparison Matrix (Tasks 16-18)**:
  - **TSP Optimization Engine (`optimizeStopsSequence`)**: Implemented exact Permutation search ($N \le 8$) and 2-opt heuristic ($N > 8$) using Haversine spherical distance matrix to eliminate zigzag detours in < 1ms, returning calculated saved mileage.
  - **Hotel Comparison Matrix (`HotelComparisonModal.tsx`)**: Created a dedicated multi-dimensional comparison view for candidate stays (`stay`), dynamically calculating proximity metrics to today's scheduled attractions centroid/closest stop, aligning price, rating, signals, risks, and notes, with 1-click day stay pinning (`[ ⭐ 选定为第 X 天住宿 ]`).
  - **1-Click Day Integration**: Added `🏨 酒店比选` entry in Research Pool and `⚡ 顺路优化` action in Day Skeleton toolbar with instant feedback toast notifications.
- **Multi-Day Stay Span & Hotel Transfer Logistics (Tasks 19-21)**:
  - **Multi-Day Spatial Proximity (`calculateMultiDayHotelProximity`)**: Calculated weighted average commute distance across all consecutive dates in a multi-night stay span, with per-day breakdown pills.
  - **Consecutive Stay Range Selector (`HotelComparisonModal.tsx`)**: Provided 1-click chips for `[ 仅当天 (1 晚) ]`, `[ 连住至第 X 天 (N 晚) ]`, and `[ 全程连住 ]`, assigning daily stay anchors with consecutive night notes.
  - **Transfer Day Luggage Logistics & Night Counter**: Automatically detected hotel transition days (`isTransferDay`) to render morning checkout ➔ daytime sightseeing ➔ evening checkin luggage flowcards and consecutive night badges in Day Skeleton.
- **Code Modularization & Verification**: 38/38 Vitest unit tests passed (`planner.test.ts`, `utils.test.ts`, `capture-state.test.ts`), `npm run validate:fast` passed with 0 errors and 0 warnings on new files.
