# Lessons & Guidelines

## Planner / Capture Architecture
1. **Single Source of Truth**: Trip、排期、锁定和用户决策只存在于 Planner/Vault；Capture 保持为轻量 Research Inbox。
2. **MV3 Single Writer**: Chrome Extension 的 Capture 状态写入统一经过 background service worker，避免 sidepanel/content 并发写造成竞态。
3. **Non-Destructive Research Merge**: Capture 或外部导入只能刷新 observation/source facts；已有 Planner 决策字段保持权威。
4. **Structured Price Authority**: 下游预算与比较优先消费 `price_currency / price_min / price_max / price_unit / price_level`；`observed_price` 保留原始证据。已有结构化币种时，不得重新根据裸 `$ / ¥` 猜币种；estimate 不得自动转成 actual ledger expense。
5. **Robust Identity & Protobuf Decoding**:
   - Google Maps EntityList/Protobuf payloads frequently contain 64-bit signed integers (both positive and negative, e.g. `["3531552460148579037", "-6449251292864702433"]`).
   - When converting decimal representations to hex place IDs, ALWAYS support negative signs and convert via `BigInt.asUintN(64, BigInt(str)).toString(16)` to produce valid unsigned 64-bit hex.
   - Never assume protobuf integer arrays are only positive (`/^\d+$/`). Always provide real-world test fixtures covering signed 64-bit integer pairs.
   - Prevent unnecessary fallbacks to offscreen skeleton search HTML by maximizing in-tab provider metadata extraction.
6. **Pre-Push CI Validation Integrity**:
   - Always verify `npm run validate:fast` before remote push to ensure ESLint errors (e.g. `prefer-const`) and type checks pass locally without breaking GitHub Actions CI pipelines.
7. **Inline In-Page Capture Button Isolation & Platform Deduplication**:
   - In-page inline capture buttons (e.g. '📌 放入案板') must NEVER be injected inside enclosing `<a>` tags. Always query `anchor.closest('a')` and insert the container before/outside the anchor with `margin-right: 12px` and stop all event propagation (`click`, `mousedown`, `mouseup`, `pointerdown`, `pointerup`) to prevent accidental misclicks on platform links.
   - For complex DOMs like Google Travel with nested `<c-wiz>` components, always query the outermost card container, mark all descendant elements with the injected attribute (`dataset.ownlyCardInjected`), and deduplicate to guarantee exactly one button per card.
8. **Provider Identity Namespace Isolation & Deduplication Boundary**:
   - Never force external platform IDs (Agoda, Booking, Tabelog, Xiaohongshu) into the `google_maps` namespace. Keep native provider prefixes (e.g. `agoda:source_place_id:...`).
   - **Provider-native identity based merge**: Only strong provider-native identity (`findExistingPlaceByIdentity`) or exact canonical non-search URLs are automatically merged.
   - **Weak evidence based duplicate suggestion**: Weak signals (title, proximity, query URLs) belong strictly to `findPotentialDuplicatePlaces` for user review/warning prompts and must NEVER trigger automatic merge.
9. **Transit-to-Transit Intercity Transition Leg Omission**:
   - When consecutive places are both transit hubs (`isTransitHubPlace`), do not compute road travel time on the execution timeline; timing is ticket-based and must remain unconstrained/clean.
10. **Architecture Governance & Anti-Overengineering Invariants**:
   - Do NOT re-introduce heavy multi-version migration frameworks (`src/domain/migrations/`). Keep domain schemas clean and lightweight at `schema_version: '0.1'`.
   - Do NOT turn `Trip.members: string[]` into standalone relational graph entities in Local-First single-user context.
   - Do NOT build massive DOM-mocking React unit tests (rely on deterministic domain/service contracts and Playwright E2E).
11. **Explicit Zero / Sentinel Overwrite in Fallback Heuristics**:
   - When domain calculations automatically synthesize heuristic defaults (e.g. `effectiveDayLegs` generating commute time estimates between stops when no leg is stored), a user's action to "clear" or "suppress" that estimate cannot be implemented simply by deleting the leg record, because the fallback heuristic would immediately regenerate it on the next render.
   - Instead, persist an explicit record with a designated sentinel (e.g. `duration_minutes: 0, source: 'manual'`). Downstream feasibility evaluators and timeline views then recognize the deliberate omission (`🚫 无需交通预估`) and avoid false-positive schedule warnings.
12. **Synchronous Render-Time State Adjustment (Avoid `set-state-in-effect`)**:
   - When a parent triggers form prefill/reset via incoming props (e.g. `initialPlaceId`), never update internal state in `useEffect` (triggers ESLint warnings and extra re-renders).
   - Track `prevInitialPlaceId` during render and adjust state synchronously before committing to DOM, adhering to idiomatic React guidelines.
