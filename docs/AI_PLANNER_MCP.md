# Ownly AI Planner via MCP + iCal Pro Projection

Ownly 的 AI Planner 不在 Ownly 内部再造一个“AI 引擎”。Claude Desktop、Cursor、Antigravity 等 **MCP Client / LLM 就是规划器**；Ownly 只提供事实、确定性验证、两阶段写入和日历投影。

## 唯一数据闭环

```text
Capture facts
    ↓
Planner / Vault (single source of truth)
    ↓
MCP client reads trip facts
    ↓
LLM proposes date + order + optional HH:mm + duration
    ↓
Ownly deterministic validation
    ↓
prepare → user confirmation → commit
    ↓
iCal Pro Markdown projection
    ↓
Calendar subscription
```

### Planner 的时间事实

`Trip Place` 只新增一个权威时间字段：

```yaml
scheduled_date: 2026-10-05
scheduled_start: "09:30"
duration_minutes: 90
sort_order: 0
```

结束时间永远由 `scheduled_start + duration_minutes` 计算，不再保存第二份 `scheduled_end`。

如果缺少开始时间或时长，Ownly **不会**虚构 `09:00`、90 分钟或统一交通缓冲。日历投影保持 date-only/VTODO 语义，直到 Planner 有足够事实生成明确时间块。

## MCP 工具

### 读取

- `ownly_planner_summary`：旅行概览。
- `ownly_planner_get_trip`：向 AI 客户端返回 Planner 事实，包括日期、`scheduled_start`、时长、顺位、锁定/anchor、营业时间、坐标、评分、评论量和结构化价格。
- `ownly_planner_get_ical_markdown`：从当前 Planner/Vault 生成只读 iCal Pro Markdown 投影。

### 两阶段写入

- `ownly_planner_prepare_apply_schedule_proposal`：验证并预览 AI 客户端提出的 schedule proposal。
- `ownly_planner_prepare_save_ical_markdown`：从当前 canonical Planner 重新生成 `trip--<id>.itinerary.md`；不接受任意 `custom_markdown`。
- `ownly_commit_operation`：用户确认后提交 prepared operation。

推荐流程：

1. AI 调用 `ownly_planner_get_trip`。
2. AI 根据真实地点事实提出 `places[]`：`id + scheduled_date + sort_order + optional scheduled_start + optional duration_minutes`。
3. 调用 `ownly_planner_prepare_apply_schedule_proposal`。
4. Ownly 拒绝越界日期、非法时间、时间重叠，以及任何对 locked / anchor 的移动；营业时间等软约束以 warning 返回。
5. 用户确认后调用 `ownly_commit_operation`。
6. 再调用 `ownly_planner_prepare_save_ical_markdown` → 确认 → commit，更新日历投影。

AI proposal 本身不会把地点设为 `locked`。只有用户显式 pin/lock 的地点才成为 hard constraint。

## obsidian-ical-plugin-pro 语法

iCal Pro 支持：

```markdown
- [ ] 2026-10-05 09:30-11:00 Wat Pho ⏫ ⏰ 15
- [ ] 2026-10-05 Grand Palace 🔼
- [ ] Candidate Cafe 🔽
```

- 有日期 + 开始/结束时间 → `VEVENT`
- 只有日期 → date-only task / `VTODO`（具体显示取决于插件目标设置）
- 无日期 → floating `VTODO`
- `⏫ / 🔼 / 🔽` → iCalendar priority
- `⏰ 15` → alarm

Ownly 不反向解析 `.itinerary.md`，因此 Calendar 永远不是第二事实源。修改日历投影文件不会反写 Planner。

## Calendar 同步边界

`obsidian-ical-plugin-pro` 负责把 Markdown 投影为 iCalendar 订阅源，可供 Google Calendar、Apple Calendar、Outlook 等客户端订阅。订阅客户端自行决定刷新周期，因此不要把它描述成“实时双向同步”。

---

## 场景化 AI Planner 提示词模板 (Prompt Presets)

你可以直接将以下 Prompt 复制给 Claude Desktop / Cursor / Antigravity 等 MCP 客户端：

### 1. 🚀 高密度特种兵打卡模式 (High-Intensity Sprint)
> “请调用 `ownly_planner_get_trip` 查看我的行程 `<trip_id>`。我希望以高效特种兵节奏打卡尽量多的地点：  
> 1. 请根据经纬度进行严格的地理聚类（同区域集中游览，减少往返通勤）；  
> 2. 每天从早晨 08:30 开始，安排 4~6 个地点，每个景点分配合理的 `scheduled_start` 与停留时长；  
> 3. 检查每个地点的营业时间和定休日，避开冲突；  
> 4. 调用 `ownly_planner_prepare_apply_schedule_proposal` 生成排期预览，待我确认后提交。”

### 2. ☕ 慢节奏松弛感漫游模式 (Relaxed & Leisurely Exploration)
> “请查看我的行程 `<trip_id>`。本次旅行追求舒适放松的松弛感：  
> 1. 每天只安排 2~3 个核心地点，上午 10:00 出门，下午预留至少 1.5 小时咖啡馆/休憩时间；  
> 2. 傍晚 18:00 之后不安排紧凑日程，留出自由漫步与晚餐时间；  
> 3. 保持我已锁定的地点不变，将其他候选合理分布在各天；  
> 4. 调用 `ownly_planner_prepare_apply_schedule_proposal` 生成排期预览。”

### 3. 👨‍👩‍👧‍👦 家庭亲子友好模式 (Family & Child-Friendly)
> “请查看我的行程 `<trip_id>`。本次有老人与小孩同行：  
> 1. 每天上午 1 个景点，中午 12:00~14:30 安排就近午餐与休息；  
> 2. 下午安排 1 个轻松的体验或公园类项目，单日总活动时长控制在 4 小时以内；  
> 3. 避免跨区域长途奔波；  
> 4. 生成包含合理起止时间与充足时长的 schedule proposal 并调用 `ownly_planner_prepare_apply_schedule_proposal`。”

### 4. 🌅 摄影机位与日落夜景优先 (Photography & Sunset Prioritized)
> “请查看我的行程 `<trip_id>`。我是摄影爱好者：  
> 1. 先根据目的地与日期确认当地当天真实日落时间，再将观景台、海滩/地标安排在日落前约 1 小时至蓝调时刻；如果无法确认日落时间，不要猜固定时刻；
> 2. 将夜景机位与夜市安排在 19:30 之后；  
> 3. 将博物馆、寺庙、室内展馆安排在上午或正午光线较硬的时段；  
> 4. 验证开放时间后生成排期提案并调用 `ownly_planner_prepare_apply_schedule_proposal`。”

### 5. 🍜 美食寻味与预订对齐模式 (Foodie & Dining Reservation Oriented)
> “请查看我的行程 `<trip_id>`。本次行程以美食体验为核心：  
> 1. 将所有 `food` / `cafe` 类的地点作为主轴，午餐严格固定在 12:00~13:30，晚餐固定在 18:30~20:30；  
> 2. 将周边的景点与购物点作为餐前/餐后的顺路搭配；  
> 3. 特别注意餐厅的定休日与闭店时间；  
> 4. 生成包含准确定点时间的 proposal 并调用 `ownly_planner_prepare_apply_schedule_proposal`。”

