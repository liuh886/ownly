# [ARCHIVED] V2 Facade 清理清单（Phase 0-2）

> **Status: Completed & Archived (2026-09-05)**  
> 目标：从 V3-only 过渡，移除所有 `activeContext` / `pendingPlaces` / `CAPTURE_STORAGE_KEY_V2` 兼容代码。  
> 现状：**所有 3 个批次清理已 100% 完成**。V2 兼容层与 dead migrations 框架已彻底移除，当前系统 100% 运行于 `OwnlyCaptureStateV3` 规范。  
> 本文档保留作为历史演进与迁移复盘记录。

---

## 批次 1 — 文档与测试孤立（低风险，可立即执行）

- [ ] `docs/CAPTURE_SYNC_BOUNDARY.md:7-27` — 全文描述 `ownlyCaptureStateV2` 旧协议，需重写为 V3 `OwnlyCaptureStateV3` / `OwnlyCollectionExportV1`，或归档为 `docs/archive/CAPTURE_V2.md`
- [ ] `src/extension/capture-state.test.ts:3,36-88` — 保留 1 个迁移回归用例至 `capture.test.ts`，其余 V2 `normalizeCaptureState` 测试删除
- [ ] `src/extension/capture-import-report.test.ts:14-26` — 基于 `activeContext/pendingPlaces` 的用例迁移至 V3 `capture.test.ts`
- [ ] `src/domain/planner.test.ts:368-378,662-673` — `activeContext/pendingPlaces` 合并/隐藏逻辑测试，确认 V3 侧已覆盖后删除
- [ ] `src/domain/capture.test.ts:234-291` — 保留作为唯一迁移测试源，移除后可作为回归锚点

---

## 批次 2 — 存储层与后台兼容（中风险，需先做数据探针）

**前置条件**：在 `scripts/data-integrity.ts` 增加 V2 残留探针：
```ts
const v2 = await chrome.storage.local.get('ownlyCaptureStateV2');
if (v2.ownlyCaptureStateV2) report.legacyV2Found = true;
```
发布 1 个版本观察 2 周，确认 `legacyV2Found == 0` 后再移除。

- [ ] `src/extension/capture-state.ts:18-25` — `CAPTURE_STORAGE_KEY_V2`, `OwnlyCaptureState` V2 类型定义
- [ ] `src/extension/capture-state.ts:41,76-77` — `normalizePlaces` / `normalizeContext` / `normalizeCaptureState`
- [ ] `src/extension/capture-state.ts:164-218` — V2 检测与自动迁移分支 `if (value.version === 2) return migrateV2ToV3(...)`，迁移工具 `migrateV2ToV3` 本身保留但移至 `src/domain/migrations/capture-v2-to-v3.ts`
- [ ] `src/extension/capture-state.ts:215-218` — `readV2State()` 辅助
- [ ] `src/extension/capture-state.ts:289-340` — `// Legacy V2 Worker` 整段（含 `mutateCaptureStateInWorker` 对 `CAPTURE_STORAGE_KEY_V2` 的写入）
- [ ] `src/extension/background.ts:277-321` — `// Legacy V2 Handlers` 转发逻辑（`SAVE/REPLACE/APPLY_REPORT` 的 V2→V3 转发）
- [ ] `src/domain/capture.ts:166,212-213,291-308` — V2 类型 `CaptureContextV2/CaptureCandidateV2/OwnlyCaptureStateV2` 及 `migrateV2ToV3` 实现（迁移至独立文件后，此处仅 re-export 废弃标记）

---

## 批次 3 — UI Facade 与调用方（高风险，需 UI 回归）

**前置条件**：批次 2 已上线且无 V2 写入，`store.state` 不再需要 `activeContext/pendingPlaces` 投影。

- [ ] `src/extension/sidepanel/store.ts:32,35` — `store.state` 的 V2 facade：
  ```ts
  activeContext: v3.planner_target
  pendingPlaces: places.map(p => ({ ... }))
  ```
  改为仅暴露 `store.stateV3` / `getActiveCollection()` / `getActivePlaces()`，UI 直接消费 V3
  
- [ ] `src/extension/sidepanel/ui.ts:211,279-281,392-393,485,778-779,1101` — 全部 `store.state.activeContext` / `store.state.pendingPlaces` 改为 `store.getActiveCollection()` / `store.getActivePlaces()`
  - `ui.ts:211` `renderChips()`
  - `ui.ts:279-281` `renderFilters()` + `tripPlaces` 过滤
  - `ui.ts:392-393` `renderState()` pending 计数
  - `ui.ts:778-779` `renderCandidatesList()` candidates 过滤
  
- [ ] `src/extension/sidepanel/handlers.ts:135,566-568,739,844,1060,1210` — 所有 `store.state.pendingPlaces as unknown as PlannerTripPlace` 桥接
  - `handlers.ts:135` `facadePlaces` 用于 enrich
  - `handlers.ts:566-568` 诊断导出中的 `activeContext/pendingPlacesSample`
  - `handlers.ts:739,844,1060,1210` 批量 enrich / synced 过滤
  
- [ ] `src/components/planner/PlannerHome.tsx:342,1149-1150,1192` — Planner 侧对 extension state 的 V2 读取
  - `PlannerHome.tsx:342` `capturePending = state.pendingPlaces.length`
  - `PlannerHome.tsx:1149-1150` `importCapturedPlaces(state.pendingPlaces)`
  - `PlannerHome.tsx:1192` `selectedTripId || state.activeContext?.tripId`
  改为 `stateV3.places` / `stateV3.planner_target` / `OwnlyCollectionExportV1` 导入

- [ ] `src/domain/planner.ts:199-207,219,245,255-264,274-285` — `CaptureState` V2 类型及 `mergeCaptureState` 中基于 `pendingPlaces` 的 tombstone 逻辑（若仍被其他模块引用，需评估是否可删）

---

## 验证清单（每批次后必跑）

```bash
npx tsc --noEmit
npx vitest run src/domain/capture.test.ts src/extension/capture-state.test.ts src/domain/planner.test.ts
npx vitest run src/services/PlannerRepository.*.test.ts
# 手动：Extension 侧边栏 — Capture 收集 → Export → Planner 导入 → Visit 创建 → 刷新不丢
# 手动：执行 scripts/data-integrity.ts 确认 0 legacyV2Found / 0 orphan_visit
```

---

## 建议执行顺序与里程碑

1. **本周**：合并且发布批次 1（文档+测试），无用户影响
2. **下一 Release**：上线 V2 探针，收集 2 周数据
3. **探针清零后**：批次 2 PR（存储层），灰度 1 周
4. **最后**：批次 3 PR（UI Facade），完成 V3-only，`CAPTURE_STORAGE_KEY_V2` 彻底移除

> 完成标准：`grep -r "CAPTURE_STORAGE_KEY_V2\|activeContext\|pendingPlaces" src/ --include="*.ts" --include="*.tsx"` 仅命中 `docs/archive/` 与 `migrations/`，`src/` 零命中。
