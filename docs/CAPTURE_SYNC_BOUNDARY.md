# Capture ↔ Planner 数据边界（单向同步）

> 状态：架构决策（2026-08，用户拍板：保持单向、明确边界）

## 结论

Ownly Capture 扩展与 Ownly Planner（Web / Obsidian）之间是**单向拉取 + ack 交接**，不是双向同步：

```
浏览器扩展 (chrome.storage.local, ownlyCaptureStateV1)
  └─ sidepanel / background 写入 trips + pendingPlaces（候选池）
        │  postMessage "PULL_CAPTURE_STATE" / "ACK_CAPTURED_PLACES"
        ▼
Web 端 PlannerHome (ownly-bridge.ts → plannerRepository)
  └─ 写入 Vault 的 Trips / Trip Places / Trip Expenses 目录
```

| 角色 | 职责 | 不做的事 |
|---|---|---|
| 扩展（Capture） | 采集收件箱：识别地点/收藏列表、编辑候选、快捷采集 | 不读取、不回写 Vault |
| Web（Planner） | 唯一真相源：排期、预算、成员、汇率、drop 生命周期 | 不向扩展回写日程/状态 |

- **ack = 交接，不是删除**：Web 端拉走 `pendingPlaces` 写入 Vault 后 ack 清空扩展侧候选池。数据没有丢，只是换了主人。
- 扩展里编辑行程（币种/日期/标签）只影响扩展本地状态；同步时若 Vault 无同 id trip 则新建，已有 trip 不会被覆盖（`syncCapture` 只 upsert 不存在的 trip）。
- Web 端排好的日程、members、fx_rates、dropped 状态**永远不会回显到扩展**。这是有意为之的边界，不是缺陷。

## 身份与去重契约

- 扩展的 `knownPlaceIds`（`placeIdentityKey(tripId, sourceUrl) → placeId`）是**append-only 身份墓碑**：ack 清空 `pendingPlaces` 时保留。重新采集同一地点会复用原 id（`existing?.id ?? knownPlaceIds[key] ?? uuid()`），Web 端按 id merge 更新 Vault 条目，因此**同步后再采集不会产生重复地点**。
- `mergeCapturedPlaceResearch` 只覆盖研究类字段；结构化事实（address/coordinates/open_hours/phone/plus_code/menu_url/reservation_url/review_topics/types）按 `captured ?? existing` 保留，types 取并集。调度字段（state/scheduled_date/sort_order/locked/is_anchor）永远以 Vault 既有值为准。
- 扩展侧保存走**单写者队列合并写**（`mergeCaptureState`）：trips/activeTripId 以侧栏为准；`pendingPlaces` 本地按 id 优先，background 快捷采集在间隙写入的地点不丢，本地删除（墓碑集合）不复活。

## 货币口径（两个概念，不要混用）

- **地图货币（采集货币）**：侧栏选择器直接控制，默认自动匹配页面实际价格货币，可手动覆盖（AUTO 恢复自动）。采集到的 `observed_price` 保留原始币种。
- **行程货币（统计口径）**：行程创建时设定。预算估算（`estimateTripBudget`）把非行程货币的采集价按 `effectiveFxRate` 换算成行程货币；`S$/HK$/NT$/US$` 等前缀符号由 `extractPriceCurrency` 归一化为 ISO 代码。

## 若未来需要双向同步

前置条件：为两侧实体引入统一的 `updated_at` 冲突解决策略、ack 改为状态标记而非删除、扩展需要只读展示 Web 排期。这是一个独立立项的工程，当前明确不做。
