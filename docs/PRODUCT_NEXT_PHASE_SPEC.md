# 产品下一阶段 Spec（已拍板四项）

> 依据 2026-09 产品力评估，用户拍板：**1 行程复盘 / 2 信任底座（Gate 1+2）/ 3 行中移动 / 6 Pro 第二支柱**。
> 第 4 项（Trip Booking 实体）经用户确认**不做**；日历 feed 功能定位为另一个 PRO（归入第 6 项）。
> 各项相互独立，可分别派发执行。通用纪律见文末。

---

## WS-1 行程复盘：行程结束 → Review 草稿

**目标**：把 Travel 闭环接回所有权记忆核心——行程收尾时一键生成复盘草稿，让"这笔经历进入人生账本"。

**范围**：
1. **入口**：Trip 详情头部新增"复盘"按钮，仅当 `end_date < 今天` 或用户手动标记行程完结时显示
2. **草稿生成**（纯本地、可编辑、绝不静默落库）：
   - 按现有 experience object 结构（见 PRO_TRAVEL_INSIGHTS_SPEC 的 Input Extraction 章节）生成结构化 frontmatter 草稿：country/region/city（取 trip.destinations）、日期区间、actual total（Trip Expenses 汇总）
   - **budget_total 来源规则**（评审补丁：PlannerTrip 无预算字段）：草稿默认留空；如有 estimateTripBudget 估算值可预填但必须标注 `(估算)` 后缀，由用户确认或改写，绝不伪装成实录
   - 正文摘要段（自动统计，用户可删改）：到访 place 数 / visit 数、交通方式构成（legs 统计）、花费 Top 3、评分最高 place
   - Review 分数字段留空，由用户填写（复游意愿、food/scenery/experience score）
3. **关联**：trip frontmatter 写入 `review_id?` 回链（可选字段，不 bump schema_version）；生成的对象进入与现有 review 录入一致的文件位置，**复用现有 review 保存路径**（不手写 frontmatter writer，保证与手动录入字节级一致）；ReviewEntry 本体以 `summary` 正文链回 trip（target_type 不扩展，关联以 trip 侧回链为主）
4. **看世界联动**：草稿确认后自动进入现有 TravelInsightsPanel 统计口径（无需新查询）

**不做**：不自动落库（始终经用户确认）、不做多行程批量复盘、不做 AI 文案生成。

**验收**：
- [ ] 行程完结后一键生成草稿，frontmatter 字段与手动录入格式完全一致（schema 校验通过）
- [ ] 草稿在确认前不进入任何统计口径
- [ ] 确认后看世界统计数字变化正确
- [ ] domain 层聚合逻辑（visit/expense/legs 统计）有单元测试

## WS-2 信任底座：Gate 1 状态面板 + Gate 2 恢复演练

**目标**：落地 PRODUCT_GOVERNANCE.md 中已设计好的两个 decision gates——信任是 local-first 产品的生死线。

**Gate 1 — 浏览器能力与数据安全状态面板**（Doctor 设置页内）：
- 展示 governance 列出的全部状态：PWA 已安装 vs 浏览器标签、File System Access 支持、当前读写授权状态、重启后需重新授权提示、persistence/storage 状态（如可用）、数据文件夹健康、最近一次已验证备份时间、精确的离线能力与限制、user-controlled storage 边界说明、个人云文件夹的"保持本地可用 + 单一同步商"建议
- **硬边界**：全部为确定性本地检查，**不做**任何 Dropbox/GDrive/OneDrive/iCloud 账号健康检查（governance 明文）
- 技术失败映射到明确的恢复动作，不显示泛化浏览器报错

**Gate 2 — 引导式恢复演练**：
- 非破坏性 drill 流程：创建一次性 fixture（真实记录之外）→ 导出备份 → 校验清单与 hash → 恢复到隔离临时目标 → 比对结果 → 输出明确 pass/fail → 安全清除演练数据
- **硬边界**：永不覆盖活动数据文件夹；复用现有 versioned backup / validation / restore preflight / rollback 机制，只做引导 UI 与编排

**验收**：
- [ ] Gate 1 面板覆盖 governance 10 项状态且全部为本地确定性检查
- [ ] drill 全流程跑通并输出 pass/fail；断言（测试级）确认活动文件夹未被写入
- [ ] 演练数据清除后无残留

## WS-3 行中移动：Trip Bundle + 移动只读视图

**目标**：绕过 iOS 无 File System Access API 的现实约束，让行程在手机上可用（行中是旅行产品主战场）。

**范围**：
1. **Trip Snapshot 导出**（评审补丁 P0：与现有分享 Bundle 硬隔离）：
   - 现有 `trip-bundle.ts`（kind `ownly.trip.bundle` v1、`.ownly-trip.json`）是**分享**语种：expenses/members/calendar_feed 按隐私设计**故意排除**，且已有 share-link 导入链路。移动快照是另一语种，**不得复用同 kind/同扩展名**，否则两类文件不可区分、旧解析器会误吞新文件。
   - 新制品：kind `ownly.trip.snapshot` v1，扩展名 `.ownly-trip-snapshot.json`，含 trip + places + visits + legs + expenses 五类实体 + `exported_at` + schema_version；members/calendar_feed 默认排除（与分享 Bundle 同等隐私线）。
   - **expenses 含入需用户显式勾选**（财务数据随文件经微信/AirDrop 流转，默认不含，勾选即知情同意）；未勾选时快照仍可生成（四类实体），移动端对应费用区显示"未包含"。
   - 入口在 Trip 详情"分享/导出"组，与现有 📤 分享导出并列但文案区分（"分享" vs "手机快照"）
2. **移动只读视图**：PWA 内新增 bundle 导入入口（`<input type=file>`，iOS Safari 可用，无需 FSA）→ 内存态渲染只读的候选池 + 时间线 + 地图（复用现有组件，禁用全部 mutation）
3. **桌面↔手机流转**：导出文件经系统分享/AirDrop/微信传输到手机即可打开；数据仍以桌面数据文件夹为唯一真源（bundle 是快照，明确标注"生成时间"，过期提示）

**不做**：不做手机端写回（绝不从 bundle 反向同步）、不做 Ownly 托管云、不做账号体系（governance deferred 列表红线）。

**验收**：
- [ ] snapshot 含声明的实体且 schema 校验通过；缺失实体优雅降级；旧分享 Bundle 文件被投入快照入口时报明确错误（不误解析）
- [ ] iPhone Safari 实测（**由用户验收**，执行方无法覆盖）：导入 snapshot → 只读浏览候选池/时间线/地图可用
- [ ] 只读视图下无任何写路径：机制为**只读 Repository adapter（写操作抛错）+ 无写路径测试**，隐藏按钮不算数
- [ ] snapshot 标注生成时间并显示已过时长；>24h 显示"可能已过期"（启发式阈值，非精确语义）

## WS-4 Pro 第二支柱：对象侧洞察 + 日历 feed PRO 化

**目标**：Pro 目前只有"看世界"一个付费理由；建立对象侧洞察为第二支柱，日历 feed 功能定位为另一个 PRO。

**范围**：
1. **对象侧洞察面板**（与 TravelInsightsPanel 同级的 Pro surface，遵守 runtime-consistency contract：共享 React 组件 + 共享 domain 聚合，Web/Obsidian 行为一致）：
   - 订阅年度成本排行（Objects 中的订阅对象；**多币种不相加**，按币种分别排行，与现有 agent 约束一致）
   - 净值趋势（Snapshots 时间序列）
   - 持有成本/未使用提醒：基于 Object Experiences 日志的"X 天未使用"列表（兑现 "Own less" slogan 的产品化出口）
   - 全部本地计算，零遥测（governance：绝不发送对象标题/金额/文件名）
2. **日历 feed PRO 化**：CalendarSubscriptionModal / feed 生成按现有 activation 模型挂 Pro（Web 运行时本就恒为 Pro，实际门禁作用于 Obsidian 运行时——沿用 `membership` 解析）；免费层保留一次性 .ics 导出，持续订阅 feed 为 Pro
3. **与 WS-1 联动**：行程复盘确认后，行程 .ics/feed 事件纳入日历口径

**不做**：不做云同步、不做 embeddings/AI 推荐（governance deferred 红线）、不在免费层撤功能只增门禁。

**用户知情事项**（评审补丁，非阻塞）：持续订阅 feed 依赖 `calendar.ownly.app` + Supabase 存 ICS（含行程标题/地点，属个人内容上 Ownly 服务端）。把 feed 立为 Pro 支柱前，请确认接受该依赖；建议在订阅 UI 加一行数据去向说明。

**验收**：
- [ ] 对象侧洞察在 Web 与 Obsidian 对同一 Vault 数据输出一致
- [ ] 无坐标/无评分数据优雅降级（同 Travel Insights 先例）
- [ ] 日历 feed 在 Obsidian 免费态被门禁、激活后可用、离线重启后状态保持（沿用 PRO_ACTIVATION 契约）
- [ ] domain 聚合逻辑单元测试

---

## 通用纪律（各 WS 通用）

- 每 WS 独立分支/commit 流：`feat(planner): ...` / `feat(trust): ...` / `feat(mobile): ...` / `feat(pro): ...`；纯移动用 `refactor`
- 每 commit 验证：`npx tsc --noEmit -p tsconfig.json` + `npx eslint`（涉及目录）+ `npm run test:planner`（涉及 planner 时）
- 并发纪律：开工前 `git status --short` 必须 clean；`git fetch && git status -sb`；只 add 本 WS 文件，禁止 `git add -A`
- 行号/结构标记：本 spec 不含行号，定位用结构标记（组件名/aria-label/接口名）
- 双语 UI：所有面向用户文案中英双语（沿用现有 `zh ?` 模式），i18n key 缺失即视为未完成
- schema 变更：新增可选字段不 bump 版本；凡改 kind/必填/语义必须升版 + 保留旧版解析（参考 trip-bundle v1 兼容做法）
- Obsidian parity：WS-1/WS-2 的 domain 逻辑必须双运行时一致；WS-3 明确仅 PWA（Obsidian Mobile 另议，不在本 WS）
- 派发顺序建议：WS-2（信任地基，治理文档已设计好）→ WS-1（复盘，接回核心）→ WS-4（Pro 第二支柱）→ WS-3（移动，工作量最大）
