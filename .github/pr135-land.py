from pathlib import Path
import json
import re

VERSION = '0.7.0'


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing expected text for {label}')
    return text.replace(old, new)

# Public MCP contract gains repeatable Visit scheduling and replaces Place scheduling tools.
p = Path('packages/mcp/package.json')
data = json.loads(p.read_text())
data['version'] = VERSION
p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

p = Path('server.json')
data = json.loads(p.read_text())
data['version'] = VERSION
data['description'] = 'Local-first Ownly evidence and repeatable Planner visits with preview-before-commit writes.'
for package in data.get('packages', []):
    if package.get('identifier') == '@ownly-app/mcp':
        package['version'] = VERSION
p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

p = Path('packages/mcp/src/index.mjs')
s = p.read_text()
s = re.sub(r"const SERVER_VERSION = '[^']+';", f"const SERVER_VERSION = '{VERSION}';", s, count=1)
p.write_text(s)

# Planner docs: one authority — Place facts, Visit occurrences, Leg travel facts.
p = Path('docs/PLANNER.md')
s = p.read_text()
s = replace_required(s,
"Ownly/\n  Trips/\n  Trip Places/\n  Trip Legs/\n  Trip Expenses/",
"Ownly/\n  Trips/\n  Trip Places/\n  Trip Visits/\n  Trip Legs/\n  Trip Expenses/",
'planner directories')
s = replace_required(s,
"Google Maps source reference plus user research and planning state. Place state is one of `candidate`, `scheduled`, `done`, `dropped`. Priority is independent: `must`, `want`, `optional`.",
"Google Maps source reference plus reusable user research facts. Place state is one of `candidate`, `done`, `dropped`; scheduling never lives on the place. Priority is independent: `must`, `want`, `optional`.\n\n### Trip Visit\n\nOne concrete occurrence of a place in the itinerary. `Trip Visits/` owns date, optional start, occurrence duration, order, lock and anchor state. The same `place_id` may have multiple visits on the same day or across different days. Removing a visit never deletes the reusable place.",
'place/visit authority')
s = s.replace('preserving the user\'s edits and any scheduling state', 'preserving the user\'s Planner-owned research edits')
s = s.replace('Manual placement locks the item so a later AI proposal layer can treat user edits as hard constraints instead of silently overwriting them.', 'Manual placement creates a Visit occurrence. A Visit can be locked explicitly so a later AI proposal treats that occurrence as a hard constraint without mutating the reusable Place.')
s = s.replace('preserves the first stop plus locked/anchored slots, and commits the chosen order together with only the final adjacent ORS legs.', 'preserves the first Visit plus locked/anchored Visit slots, and commits the chosen Visit order together with only the final adjacent ORS legs.')
s = replace_required(s,
"Execution Timeline is a deterministic projection, not a new persistence layer. `Trip Places/` remains the authority for stop order/start/duration, and `Trip Legs/` remains the authority for travel facts. `planner-schedule.ts` combines them into ordered `stop`, `travel`, `gap`, `conflict`, and `unknown` blocks.",
"Execution Timeline is a deterministic projection, not a new persistence layer. `Trip Places/` owns reusable place facts, `Trip Visits/` owns occurrence order/start/duration/locks, and `Trip Legs/` owns travel facts between canonical place pairs. `planner-schedule.ts` combines them into ordered `stop`, `travel`, `gap`, `conflict`, and `unknown` blocks.",
'execution authority')
p.write_text(s)

# MCP package README reflects Visit tools and canonical directories.
p = Path('packages/mcp/README.md')
s = p.read_text()
s = s.replace('Planner reads canonical `Trip Places/` and `Trip Legs/` facts and exposes the derived execution timeline', 'Planner reads canonical `Trip Places/`, `Trip Visits/`, and `Trip Legs/` facts and exposes the derived execution timeline')
s = s.replace('- `ownly_planner_prepare_set_travel_leg`, `ownly_planner_prepare_refresh_day_travel`\n- `ownly_planner_prepare_optimize_day_travel_time`, `ownly_planner_prepare_apply_schedule_proposal`', '- `ownly_planner_prepare_add_visit`, `ownly_planner_prepare_remove_visit`, `ownly_planner_prepare_reorder_day`\n- `ownly_planner_prepare_set_stay_span`, `ownly_planner_prepare_drop_place`\n- `ownly_planner_prepare_set_travel_leg`, `ownly_planner_prepare_refresh_day_travel`\n- `ownly_planner_prepare_optimize_day_travel_time`, `ownly_planner_prepare_apply_schedule_proposal`')
p.write_text(s)

# Main MCP guide: delete old Place scheduling tool path rather than documenting compatibility.
p = Path('docs/MCP.md')
s = p.read_text()
s = s.replace('`ownly_planner_summary` | Trips overview with place-state and expense counts', '`ownly_planner_summary` | Trips overview with reusable-place, Visit-occurrence and expense counts')
s = s.replace('`ownly_planner_get_trip` | Full trip context: budget, conflicts, canonical travel legs, derived execution timeline, places, bookings, expenses', '`ownly_planner_get_trip` | Full trip context: reusable places, repeatable visits, budget, conflicts, travel legs, execution timeline, bookings, expenses')
s = replace_required(s,
"| `ownly_planner_prepare_schedule_place` | Preview scheduling a place on a date (locks it) |\n| `ownly_planner_prepare_return_to_pool` | Preview returning a place to the research pool |\n| `ownly_planner_prepare_reorder_day` | Preview moving one scheduled place ±1 within its day |",
"| `ownly_planner_prepare_add_visit` | Preview adding one occurrence of a reusable place to a day |\n| `ownly_planner_prepare_remove_visit` | Preview removing one occurrence while keeping the reusable place and other visits |\n| `ownly_planner_prepare_reorder_day` | Preview moving one Visit occurrence ±1 within its day |",
'mcp visit tools')
s = s.replace('keep the first/locked/anchored stops fixed', 'keep the first/locked/anchored Visit occurrences fixed')
s = s.replace('Preview hotel stay-span anchors (retires stale stays on those dates)', 'Preview hotel stay-span Visit anchors (replaces stale hotel visits on those dates)')
s = s.replace('without changing locked/anchored stops', 'without changing locked/anchored Visit occurrences; repeated `place_id` values create separate visits')
p.write_text(s)

# Replace obsolete AI Planner field model with the Visit contract; no migration/fallback documentation.
Path('docs/AI_PLANNER_MCP.md').write_text(r'''# Ownly AI Planner via MCP + iCal Pro Projection

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
''')

# Guard the final source tree against the removed Place-scheduling authority.
legacy_needles = {
    'src/domain/planner.ts': [
        "'candidate' | 'scheduled'",
        'scheduled_date?: string;',
        'scheduled_start?: string;',
        'sort_order?: number;',
        'locked?: boolean;',
    ],
    'src/services/PlannerRepository.ts': [
        'updatePlaceTiming(',
        'unschedulePlace(',
    ],
}
for file_name, needles in legacy_needles.items():
    text = Path(file_name).read_text()
    for needle in needles:
        if needle in text:
            raise SystemExit(f'legacy Place scheduling authority remains in {file_name}: {needle}')

# The repeatable-visit regression must exist before landing.
regression = Path('src/services/PlannerRepository.schedule.test.ts').read_text()
for required in [
    'allows the same place multiple times on the same day and across days',
    'removes only the selected occurrence and keeps the place plus other visits',
    'sets a hotel span as repeatable locked visits without cloning the hotel place',
]:
    if required not in regression:
        raise SystemExit(f'missing repeatable Visit regression: {required}')

# Remove every temporary landing helper and its workflow. The pushed branch contains only product code/docs/tests.
for path in list(Path('.github').glob('pr135-*.py')):
    path.unlink()
workflow = Path('.github/workflows/pr135-web.yml')
if workflow.exists():
    workflow.unlink()

print(f'production landing staged; MCP {VERSION}; temporary PR135 helpers removed')
