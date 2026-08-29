# AI Planner 体验增强与时段冲突检测计划 (PR #129 增强)

> 核心目标：
> 1. 在领域层 `checkDayScheduleCollisions` 中增加同日排期**时段重叠冲突检测**，并在 MCP `getPlannerTripDetail` 中输出完整冲突情报。
> 2. 在 `PlaceTimingModal.tsx` 中增加**实时时段重叠预警**，防止用户或 AI 排期出现时间撞车。
> 3. 在 `PlannerHome.tsx` 中增加**一键保存至 Vault** 动作（直接写入 `Trips/trip--<id>.itinerary.md`，使 Obsidian 插件零阻力即时同步至 Google Calendar）。
> 4. 补充相关单元测试，执行全套自动化验证。

---

## 任务清单 (Todo Items)

### 阶段一：领域层时段冲突检测 (Domain Time Overlap Detection)
- [x] 1.1 在 `src/domain/planner.ts` 中增强 `checkDayScheduleCollisions`，检测同一天内有时间段地点之间的 `TIME_OVERLAP` 冲突并汇总到 `timeOverlaps` 与 `placeCollisions`
- [x] 1.2 在 `scripts/mcp/planner-tools.ts` 中升级 `getPlannerTripDetail` 的 `conflicts`，输出包含时段重叠与营业时间冲突的完整情报
- [x] 1.3 在 `src/domain/planner.test.ts` 中添加时段重叠检测测试用例 (64/64 passed)

### 阶段二：UI 弹窗实时重叠预警与 Vault 一键保存 (UI Timing Modal & Vault Save)
- [x] 2.1 在 `PlaceTimingModal.tsx` 中接收 `dayOtherPlaces`，实时计算并展示与当天其他地点的时段重叠警示
- [x] 2.2 在 `PlannerHome.tsx` 中增加 `saveICalProMarkdownToVault` 动作及顶部/Day 工具栏按钮，一键写入 Vault

### 阶段三：全套自动化验证 (Verification)
- [x] 3.1 执行 `npm run validate:fast` (0 error)
- [x] 3.2 执行 `npm run validate:extension` (113/113 tests passed)
- [x] 3.3 执行 `npm run validate:shared` (All parity, CLI, MCP & portability tests passed)
- [x] 3.4 执行 `npm run validate:web` (Turbopack production build + Static export + PWA passed)
