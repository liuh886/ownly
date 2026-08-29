# AI Planner 体验增强与场景化 Prompt 落地计划

> 核心目标：
> 1. 在 Web / Obsidian UI 中落地地点时段与时长的手动微调控件（时间选择、快捷时长、实时结束时间预览、冲突反馈）。
> 2. 在 `PlannerRepository.ts` 中增加 `updatePlaceTiming` 支持。
> 3. 在 `docs/AI_PLANNER_MCP.md` 中丰富场景化 Prompt 预设库（特种兵、松弛感漫游、亲子家庭、日落夜景摄影、美食寻味预订）。
> 4. 执行全套验证与测试。

---

## 任务清单 (Todo Items)

### 阶段一：领域与仓储层 (Domain & Repository)
- [x] 1.1 在 `PlannerRepository.ts` 中实现 `updatePlaceTiming(placeId, { scheduled_start, duration_minutes })`
- [x] 1.2 在 `PlannerRepository.schedule.test.ts` 中补充时段更新与清除单元测试

### 阶段二：Web 界面手动排期时段微调 (UI Time Scheduling Widget)
- [x] 2.1 创建 `PlaceTimingModal.tsx` 地点时段微调弹层：
  - 24 小时制时间选择器与快捷时间胶囊（`09:00`, `11:30`, `14:00`, `17:00`, `19:30`）
  - 游览耗时选择器（30分、1小时、1.5小时、2小时、3小时）与实时计算结束时间
  - 日历投影 VEVENT / VTODO 效果实时预览
  - 营业时间与定休日冲突实时预警
  - 清除时段与一键保存
- [x] 2.2 在 `PlannerHome.tsx` 中将排期卡片的时段标签升级为可交互按钮（无时段展示 `+ 设时间`，有时段展示 `🕒 09:00-10:30` 并支持点击修改）

### 阶段三：场景化 AI 提示词库 (Documentation & Scenario Prompts)
- [x] 3.1 在 `docs/AI_PLANNER_MCP.md` 中新增 5 大场景化 Prompt 预设模板库：
  - 🚀 特种兵高密度打卡模式
  - ☕ 慢节奏松弛感漫游模式
  - 👨‍👩‍👧‍👦 家庭亲子友好模式
  - 🌅 摄影机位与日落夜景优先模式
  - 🍜 美食寻味与预订对齐模式

### 阶段四：全套自动化验证 (Verification)
- [x] 4.1 执行 `npm run validate:fast` (0 error)
- [x] 4.2 执行 `npm run validate:extension` (112/112 tests passed)
- [x] 4.3 执行 `npm run validate:shared` (All parity, CLI, MCP & portability tests passed)
- [x] 4.4 执行 `npm run validate:web` (Turbopack production build + Static export + PWA passed)
