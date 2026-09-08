# PlannerHome 拆分方案（Spec）

**目标**：`src/components/planner/PlannerHome.tsx`（2842 行，HEAD `fa05e4b`）拆为多个自包含模块，主文件降到 ~1200 行以内。
**约束**：纯移动、零行为变更。每 Phase 一个原子 commit，tsc + eslint + test:planner 全绿后才允许下一个 Phase。
**背景**：该文件是 planner 前端唯一 god component，本 session 已两次因并发修改出事故（props 误删、提交互相吞并），拆分是降低团队摩擦的结构性手段。

## 文件解剖（行号基于 fa05e4b）

| 区段 | 行 | 内容 |
|---|---|---|
| 头部 helpers | 40–87 | `formatDay` / `placeMeta` / `formatDistanceBadge` / `KNOWN_KIND_TAGS` / `getDisplayTags` |
| `TravelModeSwitchPopover` | 88–214 | 自包含弹层组件 |
| `ConfirmDialog` | 215–254 | 自包含组件 |
| `ResearchPoolSectionProps` | 255–305 | 接口 |
| `useEscapeKey` | 306–316 | 通用 hook |
| `ResearchPoolSection` | 317–886 | 候选池（卡片网格、整理菜单、搜索、筛选 chips） |
| `PlannerHome` 主体 | 887–2842 | 见下 |
| — state + ctrl 解构 | 887–1060 | 含 `poolSectionProps` 聚合对象（~1040 起） |
| — 键盘日导航 effect | ~1085–1190 | guard list + day/pool 切换 |
| — 派生 memo | ~1214–1290 | `hotelStayDaysMap`、transferDaysInfo、urgencies 等 |
| — 顶部空态/行程选择 | ~1290–1415 | |
| — 日期导航 nav | 1416–1520 | `dateNavRef`（键盘导航引用它） |
| — 出发情报条 | 1521–1568 | 天气 / urgency 列表 |
| — 主网格 + 时间线头部 | 1570–1745 | 优化顺序按钮、导出菜单、换宿横幅 |
| — 日时间线 stops | 1746–2303 | StopCard（编号、时间触发、meta/emoji、动作组）、Travel Transition Rail、Mode Switch Popover ×2 |
| — 右侧面板 aside | 2305–2385 | tab 切换（map/context/budget）+ PlannerMap + PlannerDayStatsPanel + PlannerBudgetLedger |
| — 大地图 overlay | 2387–2513 | |
| — 模态块 | 2515–2842 | Import / Optimize / HotelComparison / PlaceTiming / Calendar / 疑似重复 / SwapDays（内联） |

## 执行顺序（由低风险到高耦合）

每个 Phase 独立 commit，可独立回滚。Phase 间无依赖的部分可暂停观望（见"并发纪律"）。

### Phase 1 — 模块级机械外提（4 个小 commit，零风险热身）
1. `useEscapeKey` → `src/components/planner/use-escape-key.ts`（通用，可被两处菜单共用）
2. `TravelModeSwitchPopover` → `src/components/planner/TravelModeSwitchPopover.tsx`
3. `ConfirmDialog` → `src/components/planner/ConfirmDialog.tsx`
4. 头部 helpers（40–87）→ `src/components/planner/planner-home-shared.ts`
   - 预期收益：~360 行；同时验证"移动→验证→commit"流程

### Phase 2 — ResearchPoolSection 整体迁出
- 255–886（接口 + 组件）→ `src/components/planner/ResearchPoolSection.tsx`
- Props 接口随迁；`poolSectionProps` 聚合模式保持不变（这是已验证的模式，勿改）
- 预期收益：~570 行

### Phase 3 — 右侧面板
- 2305–2385 + `rightTab` / `budgetInitialPlaceId` 状态外提 → `src/components/planner/PlannerRightPanel.tsx`
- ⚠️ 状态**留在 PlannerHome**，只传 `rightTab` + `setRightTab` + `budgetInitialPlaceId` + `onClearInitialPlaceId`：时间线里 3 处会调 `setRightTab('budget')` / `setRightTab('context')`（记账卡片、风险摘要），状态上提会导致跨组件回调链
- 预期收益：~100 行

### Phase 4 — 日期导航 + 出发情报条
- 1416–1568 → `src/components/planner/PlannerDateNav.tsx`
- ⚠️ `dateNavRef` 所有权：键盘导航 hook 滚动导航条到当前日，ref 必须由 PlannerHome 持有（或随 Phase 1 的键盘 hook 一起传入），传 ref 进组件
- 需要的数据多（tripDates / activeDate / poolView / transferInfo / weather / urgencies），用聚合 props 对象（同 poolSectionProps 模式）
- 预期收益：~150 行

### Phase 5 — 日时间线（最大件，最后做）
- 1746–2303 → `src/components/planner/PlannerDayTimeline.tsx`（可再拆 `TimelineStopCard` + `TravelTransitionRail`）
- Props 会很宽（hover 高亮、optimize 状态、timing modal 开启器、transfer 信息、预算跳转回调…约 40 个字段）——接受宽接口，**不要**为了"优雅"引入 context/store 重构，那超出纯移动边界
- 预期收益：~560 行
- 若该 Phase 卡壳（tsc 报错超常规 props 管道范围）→ 停止，改为只拆 TravelTransitionRail + Mode Switch Popover 两个子块，其余留待后续

### Phase 6 —（可选）模态块
- 2515–2842 → `PlannerModals.tsx`，聚合 openers。优先级最低；Phase 5 完成后可评估是否值得

## 并发纪律（本 spec 最重要的部分）

另一 Agent 会并发提交同一仓库。**每个 Phase 开始前**执行：

```powershell
git status --short        # 必须 clean；有未提交的 PlannerHome.tsx 改动 → 等待
git fetch && git status -sb  # origin 有新提交 → git pull --rebase 后重新对照行号
```

- 本 spec 的行号在 pull 后可能漂移：以**结构标记**定位（如 "nav aria-label=日期导航"、"aside min-w-0"、"PlannerMap" 出现位置），不以行号为准
- 每个立即 commit，缩小碰撞窗口；commit message：`refactor(planner): extract <名称> (no behavior change)`
- 禁止 `git add -A`；只 add 本 Phase 的文件

## 逐 Phase 验证（全绿才允许下一步）

```powershell
npx tsc --noEmit -p tsconfig.json
npx eslint src/components/planner
npm run test:planner
```

可选冒烟：dev server 打开 planner 页，检查时间线渲染、pool 切换、优化弹窗、键盘 ←/→ 切日、Esc 关菜单。

## 已知陷阱（来自本 session 的真实事故）

1. **不要用脚本按行号删改**——曾误删主组件 `tripDates/activeDate` 解构导致 tsc 断裂。所有编辑用字符串匹配的精确 edit
2. **props 接口与传值必须成对改**——曾把字段加进传值对象但接口没有（反过来也错过）。tsc 会抓，但别攒到 Phase 末尾才发现
3. **ctrl 解构是唯一数据源**——新组件的字段从 ctrl 解构后传入，不要在子组件里再次调用 `usePlannerController`（会产生第二份状态）
4. **eslint exhaustive-deps**——键盘 effect 迁入 hook 后 deps 来自参数对象，用 `useCallback` 包调用处或接受重订阅（现有行为即如此）

## 验收标准

- [ ] PlannerHome.tsx < 1300 行
- [ ] 每个 commit 的 diff 可目测为纯移动（无逻辑变更、无重命名）
- [ ] 全部 163 测试每个 commit 后绿
- [ ] aria-label / data-date / 组件 DOM 结构不变（diff 中无 className 层级变化，仅位置迁移）
- [ ] 6–8 个新文件，每个 100–600 行，单一职责
