# AI Planner & iCal Pro 语法落地计划

> 核心目标：引入基于本地 MCP 的 AI Planner 能力，采用与 `obsidian-ical-plugin-pro` 100% 兼容的 Markdown 语法，让本地旅行日程可无缝投射到 Google Calendar。坚持本地优先，不开发冗余的在线 AI 对话框，由本地 MCP 服务承接 AI 交互。

---

## 阶段一：领域层 iCal Pro 语法与 AI 排期算法 (Domain & iCal Pro Engine)
- [x] 1.1 实现 `exportTripToICalProMarkdown(trip, places, options)`：生成符合 `obsidian-ical-plugin-pro` 的 Markdown（包含时间段 `09:00-11:30`、优先级 `⏫/🔼/🔽`、分类 Emoji、缩进详情）
- [x] 1.2 实现 `parseICalProMarkdown(markdown, tripId)`：支持从 iCal Pro Markdown 双向解析还原出排期地点与时间
- [x] 1.3 实现 `generateAiItineraryPlan(places, trip, options)`：基于地点营业时间、地理聚类、建议停留时长与优先级，生成合理时段分配的智能日程
- [x] 1.4 编写全套领域单元测试，覆盖 iCal Pro 导出、解析与排期算法

---

## 阶段二：本地 MCP AI Planner 工具增强 (MCP Server & Write Service)
- [x] 2.1 在 `scripts/mcp/planner-tools.ts` 中新增：
  - `getPlannerTripICalMarkdown(dataLocation, tripId)`：获取 iCal Pro 格式的 Markdown
  - `generatePlannerAiPlan(dataLocation, tripId, options)`：为外部 AI 客户端提供结构化排期与 iCal Pro 建议
- [x] 2.2 在 `scripts/shared/ownly-write-service.ts` 中新增两阶段写入（Prepare + Commit）：
  - `preparePlannerApplyAiPlan(tripId, plan)`：批量排期与更新
  - `preparePlannerSaveICalMarkdown(tripId, customMarkdown?)`：直接保存 iCal Pro Markdown 文件至 Vault 的 `Trips/` 目录供日历插件自动索引
- [x] 2.3 在 `packages/mcp/src/index.mjs` 中注册新 MCP 工具与文档说明
- [x] 2.4 编写 MCP 工具与写入服务契约测试

---

## 阶段三：Web 与 Obsidian 界面适配 (UI & Calendar Projection)
- [x] 3.1 在 `PlannerHome.tsx` 中增加 "📅 导出 Google Calendar (iCal Pro)" 动作
- [x] 3.2 在 Day 排期卡片上呈现 iCal Pro 风格的时间段（如 `09:00 - 11:30`）与优先级标记（`⏫/🔼/🔽`）
- [x] 3.3 在 `PlannerRepository.ts` 中支持将 iCal Pro Markdown 写入 Vault

---

## 阶段四：文档与使用指南 (Documentation & Guides)
- [x] 4.1 新增 `docs/AI_PLANNER_MCP.md`，介绍如何使用 Claude Desktop / Cursor / Antigravity + 本地 MCP 进行 AI 行程规划与 Google Calendar 同步
- [x] 4.2 更新 `docs/MCP.md`

---

## 阶段五：验证与提交 PR (Verification & PR)
- [x] 5.1 执行全套自动化验证（`validate:fast`, `validate:extension`, `validate:shared`, `validate:web`）
- [x] 5.2 提交 feature 分支并创建 Pull Request

---

## 六、Review 总结

- **去中心化 AI 架构**：不开发云端依赖或内置对话框，通过 `@ownly-app/mcp` 协议让 Claude Desktop / Cursor / Antigravity 等任意 MCP 客户端直接作为 AI Planner 驱动。
- **iCal Pro 语法双向互通**：100% 遵循 `obsidian-ical-plugin-pro` 规范（RFC 5545 VEVENT 时间块、优先级 `⏫/🔼/🔽`、闹钟 `⏰ 15`、缩进 Description），由 Obsidian iCal Pro 插件即可直接订阅并无缝同步至 Google Calendar。
- **全套验证指标**：
  - `validate:fast`: 0 error
  - `validate:extension`: 112/112 tests 全部通过
  - `validate:shared`: 全部通过
  - `validate:web`: Turbopack 编译成功，页面与 PWA 验证全部通过
