# Ownly AI Planner & iCal Pro Calendar Sync Guide

Ownly 采用**本地优先（Local-First）**的去中心化架构，将 AI 规划能力与存储底座彻底解耦：
1. **无需在线 AI Agent 托管服务，亦无需内置冗余的 Web 对话框**：由本地 `@ownly-app/mcp` 服务提供确定性的 MCP 规划工具集。
2. **支持任意外部客户端**（Claude Desktop、Cursor、Antigravity、Codex、本地开源大模型）作为 AI Planner 驱动。
3. **100% 兼容 [obsidian-ical-plugin-pro](https://github.com/liuh886/obsidian-ical-plugin-pro) 语法**：行程单以标准 Markdown 存储，通过 iCal Pro 插件一键无缝投射/订阅至 **Google Calendar**、**Apple Calendar** 与 **Outlook**。

---

## 一、obsidian-ical-plugin-pro 语法规范

Ownly 生成的行程 Markdown 文件严格遵循 `obsidian-ical-plugin-pro` 规范：

```markdown
---
title: "Tokyo 2026 Autumn Tour"
type: trip_itinerary
trip_id: "trip-tokyo-2026"
start_date: "2026-10-20"
end_date: "2026-10-22"
destinations: ["Tokyo", "Asakusa", "Shinjuku"]
currency: "JPY"
generator: ownly-ai-planner-ical-pro
---

# ✈️ Tokyo 2026 Autumn Tour

## Day 1 · 2026-10-20
🗺️ [当天 Google Maps 路线导航](https://www.google.com/maps/dir/?api=1&origin=...)

- [ ] 2026-10-20 09:00-10:30 🏰 Senso-ji Temple ⏫ ⏰ 15
    - 🏷️ 类别: 景点 · Asakusa
    - 📍 地址: 2-3-1 Asakusa, Taito City, Tokyo
    - ⏰ 营业时间: 06:00 - 17:00
    - 💰 参考人均: Free
    - ⭐ 评分: ★ 4.6
    - 📞 电话: +81 3-3842-0181
    - 💡 理由: Oldest temple in Tokyo, iconic Kaminarimon gate
    - 🔗 链接: https://maps.google.com/?q=sensoji

- [ ] 2026-10-20 11:00-12:30 🏰 Tokyo Skytree 🔼
    - 🏷️ 类别: 景点 · Sumida
    - 📍 地址: 1-1-2 Oshiage, Sumida City, Tokyo

---

## 💡 备选研究灵感池 (VTODO)
- [ ] 🍜 Rokurinsha Ramen ⏫
    - Top-tier Tsukemen
    - 📍 Tokyo Station Ichibangai B1F
```

### 关键语法特性映射

| 元素 | 语法格式 | iCalendar (RFC 5545) 效果 |
| :--- | :--- | :--- |
| **定点日程** | `- [ ] YYYY-MM-DD HH:mm-HH:mm 标题` | `VEVENT`（在 Google Calendar 网格呈现） |
| **优先级** | `⏫` (必去) / `🔼` (想去) / `🔽` (备选) | `PRIORITY: 1 / 5 / 9` |
| **提前提醒** | `⏰ 15` (提前 15 分钟) | `VALARM` 闹钟提醒 |
| **缩进详情** | `    - 📍 地址: ...` | 自动映射到日历日程的 `DESCRIPTION` 描述字段 |
| **待选灵感池** | 位于灵感池标题下的无时间任务 | `VTODO`（在提醒列表/侧边栏展示） |

---

## 二、通过 MCP 驱动 AI Planner

Ownly MCP 服务暴露了完整的本地规划与日历同步工具：

### 1. 读取与排期推导工具 (Read-Only)

| MCP 工具 | 说明 |
| :--- | :--- |
| `ownly_planner_summary` | 获取所有旅行概览、状态与地点/账本计数 |
| `ownly_planner_get_trip` | 获取指定行程的详细地点、预算估算、冲突检测及账本 |
| `ownly_planner_get_ical_markdown` | 直接提取符合 `obsidian-ical-plugin-pro` 语法的 Markdown 文本 |
| `ownly_planner_ai_plan` | 运行本地确定性 AI 排期引擎，进行地理聚类、避开闭馆日并分配合理时段 |

### 2. 两阶段受控写入工具 (Prepare + Commit)

| MCP 工具 | 说明 |
| :--- | :--- |
| `ownly_planner_prepare_apply_ai_plan` | 预览并批量应用 AI 排期结果至 Vault（更新地点日程、顺位与时长） |
| `ownly_planner_prepare_save_ical_markdown` | 预览并将 `.itinerary.md` 写入 Vault 的 `Trips/` 目录供日历插件自动索引 |
| `ownly_commit_operation` | 经用户确认后，原子写入 Markdown 并生成安全备份与审计日志 |

---

## 三、配置与使用示例

### 在 Claude Desktop / Cursor / Antigravity 中配置

编辑 MCP 配置文件（如 `claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "ownly": {
      "command": "npx",
      "args": ["-y", "@ownly-app/mcp", "--data-dir", "D:\\Documents\\MyObsidianVault", "--allow-write"]
    }
  }
}
```

### 提示词范例 (Prompt Example)

> **用户提问：**  
> “请查看我的东京行程 `trip-tokyo-2026` 中的所有候选地点，帮我规划一份顺路、合理的 3 天日程，避开各景点的闭店日，生成 iCal Pro 格式的日程表并保存到我的 Vault 中。”

> **AI 执行流：**  
> 1. 调用 `ownly_planner_get_trip` 获取现有地点与开放时间  
> 2. 调用 `ownly_planner_ai_plan` 计算最优时段与路线分布  
> 3. 调用 `ownly_planner_prepare_apply_ai_plan` 与 `ownly_planner_prepare_save_ical_markdown`  
> 4. 向用户展示前后变动预览，等待用户确认后调用 `ownly_commit_operation` 写入本地 Markdown 文件。

---

## 四、Obsidian 自动同步至 Google Calendar

1. 在 Obsidian 中安装插件 **iCal Pro** (`obsidian-ical-plugin-pro`)。
2. 在 iCal Pro 设置中：
   - 将扫描路径指向 `Ownly/Trips/`。
   - 复制生成的本地 Webcal/iCalendar 订阅链接（或配置 Gist 同步）。
3. 打开 **Google Calendar** -> **其他日历 (+)** -> **通过网址添加**，粘贴 iCal Pro 提供的订阅链接。
4. 您的旅行安排将实时投射在 Google 日历中，包含时间块、地点详情、地址与导航链接！
