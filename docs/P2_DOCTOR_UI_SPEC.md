# P2: Data Integrity Doctor — 产品化规格（Settings/Admin 健康看板）

> 目标：将 `scripts/data-integrity.ts` 的 CLI 能力产品化，嵌入用户可感知的健康看板 + 一键修复
> 参考：`src/components/home/HomeDoctorSection.tsx:1`（WYQD Doctor 已有交互范式：run → preview → apply → re-run）

---

## 1. 信息架构

**入口**：`Settings → 数据健康`（或 `Admin` tab），与现有 `HomeDoctorSection` 并列，复用 `SECTION_TITLE_CLASS` / `CARD_CLASS` 视觉。

**卡片态**：
```
┌─ 数据健康 ───────────────────────── [ 运行检查 ] ─┐
│ ● 128 places · 42 visits · 3 trips                │
│ ● 0 错误 · 2 警告 · 1 提示                         │
│                                                    │
│ ⚠️ [duplicate_identity] Trip "Thailand" 有 2 个地点共享 google_cid:7605...  │
│    BKK Airport / Suvarnabhumi Airport              │
│ ℹ️ [orphan_place] "Hidden Cafe" 无关联行程                    │
│                                                    │
│ [预览修复 (1)]  [自动修复]                         │
└────────────────────────────────────────────────────┘
```

---

## 2. 数据层（复用 P1 的 PlaceIdentityService）

**新增 domain 层**：`src/domain/planner-integrity.ts`
```ts
export interface PlannerIntegrityReport {
  summary: { trips: number; places: number; visits: number; orphans: number; duplicates: number };
  issues: Array<{ severity: 'error'|'warning'|'info'; category: string; message: string; details?: Record<string,unknown> }>;
  fixable: Array<{ visitId: string; placeId: string; title: string }>; // orphan visits 可重建
}

export async function runPlannerIntegrity(repo: PlannerRepository): Promise<PlannerIntegrityReport>
// 内部：listPlaces/listVisits/listTrips + PlaceIdentityService.getStrongKeys + scripts/data-integrity.ts 的 5 项检查
```

**直接复用**：
- `PlaceIdentityService.getStrongKeys` / `hasConflict`（P1 已统一）
- `PlannerRepository.reconstructOrphanPlaces(tripId?)`（已落地 `src/services/PlannerRepository.ts:498`）
- `PlannerRepository.importWithTrace()` 的 trace 可作为修复后验证

**CLI 保留**：`scripts/data-integrity.ts` 改为 `import { runPlannerIntegrity } from '@/domain/planner-integrity'` 的薄封装，保证 CLI 与 UI 同源。

---

## 3. 组件设计

**新增**：`src/components/planner/PlannerDoctorSection.tsx`
- Props：`{ itemVariants?: Variants }` 与 `HomeDoctorSection` 一致，可直接嵌入 `HomeDashboard` 或独立 `Settings` 页
- State：`report | null`, `loading`, `repairPlan | null`, `lastResult | null`（与 `HomeDoctorSection.tsx:16-20` 同构）
- 交互：
  1. `runCheck()` → `runPlannerIntegrity(repo)` → 渲染 `issues`
  2. `previewFix()` → 过滤 `category === 'orphan_visit'` 且 `severity === 'error'` → 展示待重建清单
  3. `applyFix()` → `repo.reconstructOrphanPlaces()` → `t('doctorRepairDone')` + 重新 `runCheck()`
  4. `duplicate_identity` 仅提示，不自动合并（需人工确认，避免机场等多名实体误合并）

**样式**：复用 `HomeDoctorSection.tsx:88-107` 的 amber 预览 / emerald 结果条，仅文案改为 planner 领域（`t('plannerDoctor.*')`）。

---

## 4. 验收标准

- [ ] UI 与 `scripts/data-integrity.ts` 同源，同一入参产出一致 `issues`
- [ ] 对 3 个历史机场 orphan visit 场景：点击 `[自动修复]` 后 `orphan_visit` 错误清零，Visit 重新关联，新 Place 带 `reconstructed` tag
- [ ] `duplicate_identity` 仅警告，不自动合并；提供「查看详情」跳转至 `PlannerHome` 对应 Trip
- [ ] 空状态友好：`0 错误` 时显示 `✓ 数据健康`（emerald dot，与 `HomeDoctorSection.tsx:111` 一致）
- [ ] 无新增全量测试回归（444 tests 仍 pass）+ 新增 4 个 `planner-integrity.test.ts` 用例（orphan/duplicate/missing_identity/修复后重跑）

---

## 5. 非目标（Phase 2 后）

- Collection 分享预览（Phase 2 增长方向，独立于此看板）
- 30 秒 onboarding（Phase 1，需单独设计）
- V2 facade 真正删除（Phase 0-2 清单已就绪，按批次执行，不阻塞此 UI）

---

## 6. 下一步（实现拆分）

1. **PR-1**：`src/domain/planner-integrity.ts` + `planner-integrity.test.ts`（纯 domain，无 UI）
2. **PR-2**：`src/components/planner/PlannerDoctorSection.tsx` + 接入 `Settings` / `HomeDashboard` + i18n
3. **PR-3**：`scripts/data-integrity.ts` 重构为 domain 薄封装，删除重复逻辑
