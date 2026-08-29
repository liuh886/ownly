# Lessons & Guidelines

## Planner / Capture Architecture
1. **Single Source of Truth**: Trip、排期、锁定和用户决策只存在于 Planner/Vault；Capture 保持为轻量 Research Inbox。
2. **MV3 Single Writer**: Chrome Extension 的 Capture 状态写入统一经过 background service worker，避免 sidepanel/content 并发写造成竞态。
3. **Non-Destructive Research Merge**: Capture 或外部导入只能刷新 observation/source facts；已有 Planner 决策字段保持权威。
4. **Structured Price Authority**: 下游预算与比较优先消费 `price_currency / price_min / price_max / price_unit / price_level`；`observed_price` 保留原始证据。已有结构化币种时，不得重新根据裸 `$ / ¥` 猜币种；estimate 不得自动转成 actual ledger expense。
