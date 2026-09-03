# Phase 1: 30s Onboarding — Capture / Collection / Planner 关系

> 风险：新用户不知道三者关系，需 30 秒内建立心智模型

## 心智模型（1 句话）

**Capture 收集 → Collection 整理 → Planner 规划**  
（灵感池 → 合集 → 行程）

## 交互：3 卡片 + 1 动效（复用 FirstObjectOnboarding 范式）

```
[① Capture]  →  [② Collection]  →  [③ Planner]
  扩展一键        合集内筛选        导入行程排期
  📍 Google Maps   📦 我的曼谷美食   🗓️ 10/05 BKK
```

- 每卡：icon / title / 1 行描述 / 示例
- 底部：动效箭头 + 进度点（3 段，自动轮播 8s，可手动点）
- 按钮：`[开始收集]` → 触发扩展安装指引或 `PlannerDoctorSection` 的「运行检查」

## 组件

- `src/components/onboarding/CaptureOnboarding.tsx`：复用 `FirstObjectOnboarding.tsx:36` 的 dialog 壳，props `{ open, onDismiss, onStart }`
- `src/core/capture-onboarding-copy.ts`：中英双语文案（类似 `first-object-copy.ts`）
- 触发：`HomeDashboard` 首次空状态（`places.length === 0 && visits.length === 0` 且 `localStorage.getItem('ownly:capture-onboarding:dismissed') !== '1'`）

## 文案草稿

- ① Capture：`在 Google Maps 看到心动地点 → 点扩展一键收集`（示例：Suvarnabhumi Airport）
- ② Collection：`在合集中筛选、补标签、去重`（示例：曼谷必吃 Top 8）
- ③ Planner：`导出为 Portable JSON → 导入行程 → 排期上图`（示例：`ownly.capture.collection` v1）

## 验收

- [ ] 首次空用户 30s 内可复述三者关系（可用性测试 3 人）
- [ ] 不打扰老用户（仅空状态 + 未 dismiss 时展示）
- [ ] 与现有 `FirstObjectOnboarding` 不冲突（互斥展示，Capture 优先于 Object）
