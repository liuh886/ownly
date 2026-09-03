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
