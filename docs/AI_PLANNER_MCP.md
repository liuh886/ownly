# Ownly AI Planner via MCP + iCal Pro Projection

Ownly 不内置第二套 AI Planner。MCP Client / LLM 负责提出方案；Ownly 只提供事实、确定性验证、两阶段写入和日历投影。

## 唯一数据闭环

```text
Capture facts
    ↓
Trip Place（可复用地点事实）
    ↓
Trip Visit（一次具体访问）
    ↓
Trip Leg（地点间交通事实）
    ↓
MCP proposal → deterministic validation → user commit
    ↓
iCal Pro Markdown projection
```

`Trip Place` 永远不保存日期、开始时间、顺序或锁定状态。所有一次性排程事实都只属于 `Trip Visit`：

```yaml
type: trip_visit
id: visit:...
trip_id: trip-1
place_id: wat-pho
date: 2026-10-05
start: "09:30"
duration_minutes: 90
sort_order: 0
locked: false
is_anchor: false
```

同一个 `place_id` 可以在同一天出现多次，也可以跨天重复出现。删除其中一个 Visit 不会删除 Place，也不会影响其它 Visit。

结束时间永远由 `start + duration_minutes` 计算，不保存第二份结束时间。缺少开始时间、停留时长或交通事实时保持 unknown，不虚构默认值。

## MCP 读取

- `ownly_planner_summary`：旅行、地点、Visit 与费用概览。
- `ownly_planner_get_trip`：返回 reusable places、repeatable visits、travel legs、冲突与 execution timeline。
- `ownly_planner_get_ical_markdown`：从当前 canonical Visit schedule 生成只读 iCal Pro Markdown 投影。

## MCP 两阶段写入

- `ownly_planner_prepare_add_visit`：为一个 Place 新增一次 Visit；Place 仍留在候选池，可再次添加。
- `ownly_planner_prepare_remove_visit`：只删除指定 Visit occurrence。
- `ownly_planner_prepare_reorder_day`：按 Visit ID 调整当天顺序。
- `ownly_planner_prepare_set_stay_span`：把同一酒店 Place 展开为多天锁定 Visit。
- `ownly_planner_prepare_apply_schedule_proposal`：验证并预览一组 `visits[]`。省略 `visit_id` 时创建新的 occurrence，因此同一 Place 可重复出现。
- `ownly_planner_prepare_optimize_day_travel_time`：用 ORS 临时矩阵优化 Visit 顺序；只提交最终 Visit order 与相邻 Trip Legs。
- `ownly_planner_prepare_save_ical_markdown`：从 canonical Visit schedule 重新生成日历投影。
- `ownly_commit_operation`：用户确认后提交 prepared operation。

Schedule proposal 的核心结构：

```json
{
  "trip_id": "trip-1",
  "visits": [
    {
      "place_id": "wat-pho",
      "date": "2026-10-05",
      "start": "09:30",
      "duration_minutes": 90,
      "sort_order": 0
    },
    {
      "place_id": "wat-pho",
      "date": "2026-10-05",
      "start": "18:30",
      "duration_minutes": 60,
      "sort_order": 4
    }
  ]
}
```

两项拥有相同 `place_id`，但提交后是两个独立 Visit。AI proposal 不会自动锁定新 Visit；已有 locked / anchored Visit 是硬约束，不允许被 proposal 移动。

## iCal Pro 边界

```markdown
- [ ] 2026-10-05 09:30-11:00 Wat Pho ⏫
- [ ] 2026-10-05 18:30-19:30 Wat Pho ⏫
```

Ownly 只做 Planner → iCal Pro 的单向投影，不反向解析 `.itinerary.md`，因此 Calendar 不是第二事实源。

## 推荐 Agent 请求

> 读取我的 Ownly trip，按真实地点事实提出 Visit 排程。允许同一地点重复访问；保持所有 locked/anchored Visit 不变。调用 `ownly_planner_prepare_apply_schedule_proposal` 给我预览，等我确认后再 commit。不要虚构营业时间、交通时间、开始时间或停留时长。
