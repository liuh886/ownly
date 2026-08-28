# Todo: P0 & P1 Code Review Fixes

## Tasks
- [x] 1. (P0) Fix TSP 1-click optimization pipeline: `schedulePlace` default `locked: false`, `optimizeStopsSequence` default options destructuring, and `haversineDistanceKm` numerical clamping <!-- id: 1 -->
- [x] 2. (P0) Fix cold-load ledger hydration: invoke `hydrateLedgerFromVault` in `PlannerHome.tsx` mount `useEffect` <!-- id: 2 -->
- [x] 3. (P0) Fix trip state synchronization: update `setTrips` in `handleUpdateMembers` to prevent `handleUpdateFxRates` from wiping members <!-- id: 3 -->
- [x] 4. (P0) Fix multi-day stay replacement: `unschedulePlace` on base candidate hotel entities instead of `dropPlace` <!-- id: 4 -->
- [x] 5. (P0) Fix sidepanel tombstone race: remove heuristic tombstone insertion in `sidepanel.ts` `storage.onChanged` <!-- id: 5 -->
- [x] 6. (P0) Decouple `content.ts` from sidepanel: remove dynamic import of `content.ts` in `src/extension/sidepanel/capture.ts` <!-- id: 6 -->
- [x] 7. (P1) Fix Budget Ledger currency binding & selection: bind aggregate metrics to `{baseCurrency}`, include `baseCurrency` in options, reset form overrides on submit <!-- id: 7 -->
- [x] 8. (P1) Fix `safeEntityId` CJK/Unicode crash & `PlannerRepository.upsert` initialization <!-- id: 8 -->
- [x] 9. (P1) Harden capture bridge & sidepanel XSS safety: handle `"null"` origin in `capture-bridge.ts`, sanitize safe URL schemes in `ui.ts` <!-- id: 9 -->
- [x] 10. (P1) Fix UI interactions & hook dependencies: reset `optimizeUndo` on date/trip change, fix `urgencies` `useMemo` dependency, refactor `fetchWeather` dependencies <!-- id: 10 -->
- [x] 11. (P1) Fix content scraping edge cases: review count regex extraction, European comma rating parsing, and currency regex word boundaries <!-- id: 11 -->
- [x] 12. Run full validation suite (`validate:extension`, `validate:fast`, vitest unit tests) and verify all fixes <!-- id: 12 -->
- [x] 13. (P1) Upgrade unified PlaceParser: unified multi-layer extraction pipeline (JSON-LD, subtitle decomposition, standardized rating/category/review count) <!-- id: 13 -->

- [x] 14. (Architecture Evolution) End-to-end architecture audit & clean refinement across Domain, Data Persistence, Chrome Extension, and React UI:
  - Preserved canonical domain interfaces (`MultiDayHotelProximityResult`, `DayHotelTransferInfo`).
  - Added non-ASCII hash disambiguation for `safeEntityId` preventing entity ID collisions.
  - Hardened AA cash flow settlement (`calculateTripSettlement`) against empty members and payer edge cases.
  - Seamless clipboard copy fallback in `PlannerBudgetLedger.tsx`.
  - Upgraded HTML5 drag-and-drop compliance across Firefox/Safari.
  - Eliminated setState in effects and refreshed SPA bridge signals on URL change.

- [x] 15. (Category & Tag System Alignment) Automatic default kind tags & candidate pool count indicators:
  - Aligned category taxonomy: `住宿` (Stay), `美食` (Food), `咖啡` (Cafe), `体验` (Experience), `景点` (Attraction), `购物` (Shopping), `交通` (Transit), `其它` (Other).
  - Implemented `ensurePlaceKindTag`: automatically defaults and preserves the category tag for any captured/imported place (e.g. `stay` automatically gets `住宿` tag).
  - Filter chips and candidate drawer now display counts in parentheses, e.g. `全部 (12)`, `🏨 住宿 (5)`, `🍜 美食 (3)`, `☕ 咖啡 (2)`, `🏷️ 曼谷 (4)`.
  - Filter chip deduplication: cleanly isolates standard category tags from custom trip tags.

- [x] 16. (Tag Purity & Address/Title Exclusion):
  - Strictly excluded place titles (`p.title`), full addresses (`p.address`), and address fragments from being rendered as tag filter chips.
  - Implemented `isPlausibleCustomTag` in domain planner to reject postal codes, long addresses, emails, and URLs.
  - Cleaned extension sidepanel handlers (`buildPlaceFromDetected`, `btnSmartSyncAll`, `btnBatchAdd`) so raw subtitle categories/addresses are no longer mistakenly pushed into `signals`.

- [x] 17. (Candidate Inline Editor Streamlining):
  - Removed unnecessary "区域 / 街区 (Area)" input field from candidate inline edit form in the sidepanel.
  - Streamlined row layout: Row 1 (Kind + Priority), Row 2 (Price + Rating), Row 3 (Duration), Row 4 (Tags), Row 5 (Notes).
  - Preserved existing `place.area` and ensured kind tags are automatically preserved on inline save.

- [x] 18. (Top Bar UI Cleanup):
  - Removed unnecessary `🗺️` map currency icon span (`lblMapCurrency`) from the top of the sidepanel header (`tripActiveRow`).

## Planner Layout Redesign: 1:3 Day Skeleton/Workspace & Floating Pool Window
- [x] 19. (Layout Restructure) Update `PlannerHome.tsx` main grid to 1:3 ratio:
  - Day Skeleton occupies 1 part (`minmax(340px, 1fr)`).
  - Planner Workspace (Spatial Map / Budget / Context) occupies 3 parts (`minmax(0, 3fr)`).
- [x] 20. (Floating Candidate Pool Window) Implement toggleable floating pool drawer/window:
  - Added `isPoolOpen` state and floating trigger button (`🗂️ 候选池 (${candidates.length})`).
  - Added top bar quick button and Day Skeleton header trigger button.
  - Implemented sleek floating drawer with search, category & custom filter chips with counts, hotel compare banner, and draggable candidate cards.
  - Maintained drag-and-drop from floating pool directly to Day Skeleton dropzone.
  - Added keyboard shortcut (`Esc` to close) and backdrop dismiss on mobile.
## Planner Layout Evolution: Full-Width Horizontal Candidate Pool Below List & Map
- [x] 22. (Bottom Full-Width Pool Section) Position Candidate Pool below the 1:3 Day Skeleton & Map Workspace:
  - Full-width container (`w-full mt-4 rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden`).
  - Sleek header with Title, counts, inline search, hotel compare button, and collapse/expand toggle.
  - Horizontal filter chips bar with category and custom tags counts.
  - Responsive multi-column grid layout (`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-4`) for candidate place cards.
  - Retain drag-and-drop upward into Day Skeleton, hover highlight sync with Map above, and one-click `+ 当天` (`+ Day`) scheduling.
- [x] 23. (Verification & Sync) Run full test suite (`validate:fast`, `validate:extension`), verify responsive design, commit and push to `origin main`.
- [x] 24. (Basemap Research) Analyze and discuss free basemap solutions for the spatial map.
- [x] 25. (Free Basemap Switcher) Implement multi-style basemap switcher in `PlannerMap.tsx`:
  - Support free, zero-config basemaps: CARTO Voyager (淡彩旅行), CARTO Positron (极简浅灰), CARTO Dark Matter (深邃夜景), OpenStreetMap Standard (标准开源), and Esri World Imagery (卫星实景).
  - Add basemap selector in the map header toolbar with localized labels and icons.
  - Persist chosen style in `localStorage` (`ownly_planner_basemap_style`).
  - Graceful fallback on image load error to ensure tiles always display reliably.
- [x] 26. (Extension Capture & Candidate Editor Unification):
  - Improve capture banner to friendly editing status indicator (`🟢 已在候选池 · 可在此完善快捷标签与心得`).
  - Update submit button text to clear `💾 保存地点与标签修改` (Save Place & Tags).
  - Respect exact tag selections during capture edit without re-injecting deleted tags.
  - Sync candidate card "✏️ 编辑" with top capture form and quick chips seamlessly.
  - Clear user feedback upon saving updates (`✓ 已保存地点修改与快捷标签`).
- [x] 27. (Place Category Taxonomy Hardening):
  - Expand `inferPlaceKind` taxonomy with `cuisine`, `dining`, `kitchen`, `eatery`, `steakhouse`, `dumpling`, `barbecue`, `tapas`, `canteen`, `fondue` and multilingual Thai keywords (`ร้านอาหาร`, `อาหาร`, `ก๋วยเตี๋ยว`, `ข้าวมันไก่`, `ส้มตำ`, `บาร์`).
  - Add Japanese keywords (`ラーメン`, `焼肉`, `寿司`, `うどん`, `そば`, `天ぷら`, `割烹`, `居酒屋`, `食堂`, `定食`).
  - Accurately categorize `Ekachan The Wisdom of Ethnic Thai Cuisine` and related global culinary establishments as `food`.
- [x] 28. (Extension Currency Conversion Hover Tooltip & Switch):
  - [x] 28.1 (Domain FX Converter): Implement `convertPriceRange` & currency extraction supporting single/range prices and target trip currency. Add unit tests.
  - [x] 28.2 (Background Rates Engine): Daily silent sync of open exchange rates with 24h `chrome.storage.local` cache and `DEFAULT_USD_PIVOT` fallback.
  - [x] 28.3 (Content Script Floating Tooltip): Safe, zero-DOM-mutation hovering tooltip with glassmorphism styling, showing converted amount, rate formula, and auto-dismissal.
  - [x] 28.4 (Sidepanel Toggle & State Sync): Add a clean `💱 汇率浮窗` toggle in sidepanel header with persistence (`ownly_fx_tooltip_enabled`) and runtime tab broadcast.
  - [x] 28.5 (Verification & Build): Run `validate:fast` and `validate:extension`, verify zero performance overhead, commit and push.

## Review
- **Architecture Evolution & Quality Hardening**:
  - Maintained complete backward compatibility with existing interfaces across `stay.ts` and `HotelComparisonModal.tsx`.
  - Unified Google Maps place parser (`src/extension/place-parser.ts`) with multi-layer JSON-LD + Subtitle decomposition.
  - Aligned category & tag taxonomy with automatic default kind tagging (`ensurePlaceKindTag`) across Extension Capture and Planner Home.
  - Guaranteed tag filter purity by filtering out place names and addresses.
  - Streamlined candidate inline editor and cleaned up sidepanel top bar header.
  - Redesigned Planner Home with 1:3 ratio for Day Skeleton / Map Workspace and full-width horizontal candidate pool below.
  - All test suites green across entire project (`validate:fast`, `validate:extension`, `tsc --noEmit`).
