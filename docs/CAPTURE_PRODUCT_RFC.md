# RFC: Next-Stage Capture Architecture & Product Form

**Status:** Adopted & Implemented  
**Date:** 2026-09-05  
**Scope:** Capture Extension (`src/extension/`), Modular Provider Adapters, Universal In-Page Inline Capture, Asynchronous Google Maps Entity Resolution, Web Planner Bridge  

---

## 1. 核心概念隐喻：案板（Inbox）与下锅（Planner 候选池/行程）

在用户的旅行调研与行前规划心智模型中，数据流向应当具有极高的层次感与明确的准备阶段划分：

```
                 【 广袤网络情报源 】
     Google Maps · Google Travel · Agoda · Booking · Tabelog · 小红书
                           │
                           ▼ （行内『📌 放入案板』/ 收藏夹批量导入）
       ┌─────────────────────────────────────────┐
       │             📥 INBOX（案板）             │
       │   - 零心智负担的轻量暂存与收集区             │
       │   - 快速打标、就地编辑、客观事实自动补强     │
       │   - 粗选与整理，支持多合集分类（如京都/芭提雅） │
       └─────────────────────────────────────────┘
                           │
                           ▼ （确认挑选 / 一键下锅）
       ┌─────────────────────────────────────────┐
       │        🍲 PLANNER TRIP（下锅 / 正式行程）│
       │   - 确定要纳入旅程的候选池 (Candidate Pool) │
       │   - 排入日程时间线 (Visits / Timelines)     │
       │   - 路线与交通耗时计算 (Routing & Legs)      │
       │   - 预算与实际记账核销 (Expense & Split)     │
       └─────────────────────────────────────────┘
```

* **Inbox（案板）**：负责“生鲜食材的采买与初加工”。随手浏览、随手抓取，不做强约束，不强求时间线排期。
* **Planner（下锅）**：负责“烹饪与出品”。排入具体哪一天去、几点去、和谁去、花多少钱，属于严格的行程生命周期管理。

---

## 2. 核心架构设计与数据所有权边界（Single Source of Truth）

### 2.1 三层采集与解析架构（3-Layer Capture & Resolution Pipeline）
1. **第一层：卡片/详情页行内注入（In-Page Inline Capture Button）**：
   - 采用 Shadow-DOM 封装样式，在各平台卡片或标题前端注入 `📌 放入案板` 按钮。
   - 绝对事件隔离（`stopPropagation` + `preventDefault`），防止误触父级 `<a>` 链接引发跳转。
2. **第二层：Service Worker 瞬时存储（0ms 交互延迟）**：
   - 点击后直接发送 `OWNLY_QUICK_SAVE_PLACE` 至 background worker 写入 `chrome.storage.local`（`ownlyCaptureStateV3`）。
   - 按钮即时呈现 `✓ 已放入案板` 或 `ℹ️ 该地点已在案板中`。
3. **第三层：后台异步 Google Maps 标准化解析（Background Entity Resolution）**：
   - 后台 Worker 触发 `resolveAndEnrichCapturedPlace`，自动查询 Google Maps `tbm=map` / protobuf 接口，补全 Place ID、精确坐标、星级评分、营业时间与标准分类。
   - 将所有外部来源（Agoda, Booking, Google Travel, Xiaohongshu）标准化为统一的 Google Maps 实体格式（`sourceProvider: 'google_maps'`）。

### 2.2 数据存储分层
1. **案板阶段（Inbox Collections）**：
   - 存储在浏览器扩展本地存储（`chrome.storage.local`），以 Collection 为单位（如 `Inbox-default`, `Tokyo-Food`）。
   - 具备高度的轻量性与便携性，无需强制打开 Web Planner 即可独立完成收集与整理。
2. **下锅阶段（Planner Trip Vault）**：
   - 存储在本地文件系统（Obsidian Markdown Vault）或 Web 端 IndexedDB/Trip Bundle。
   - 具备强 schema 版本控制（`Place` + `Visit` + `Expense`）。
3. **晋升机制（Promotion / 下锅流程）**：
   - 当用户在 Planner 中点击“导入 Capture 候选”或在 Extension 中“推送至行程”时，执行**幂等合并（Idempotent Merge）**。
   - 基于 Place ID / CID / 经纬度对齐，生成正式的 Planner Place 实体，绝不产生重复脏数据。

---

## 3. 智能鲜活度同步与非破坏性合并原则（Non-Destructive Update）

当用户在浏览器中再次打开已经位于案板（Inbox）或已下锅（Planner）的地点网页时：

* **自动/一键更新项（客观事实 Objective Facts）**：
  * 最新价格（如在 Google Travel / Agoda 选定日期后的每晚房费与税费）
  * 评分与评论数（Rating & Review Count）
  * 营业时间与法定闭馆日（Opening Hours）
  * 电话、Plus Code、官方预订/菜单链接
* **坚决锁定项（用户主观决策 User-Owned Decisions）**：
  * 用户写的为什么选（Why）、个人备注（Notes）
  * 优先级标记（Must / Want / Optional）
  * 自定义标签与偏好时段（Tags & Preferred Window）
  * 已在 Planner 中排定的具体日程（Visits）

---

## 4. 跟踪 Issue 状态与里程碑

* **#CAPTURE-RFC-01**: [x] 确立 Inbox 案板与 Planner Trip 的单向晋升与双向身份对齐协议。
* **#CAPTURE-RFC-02**: [x] Google Travel (`google.com/travel/*`) 与 Agoda (`agoda.com/*`) 结构化数据解析与深度实体解析器开发。
* **#CAPTURE-RFC-03**: [x] 页面内行内快捷采集按钮（In-Page Inline Capture Button）与 Shadow-DOM 样式封装。
* **#CAPTURE-RFC-04**: [x] 跨平台地点严格规范化为 Google Maps 实体标准（统一坐标、分类与导航链接）。
