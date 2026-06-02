# Ownly

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-blue?logo=obsidian)](https://obsidian.md/plugins?id=ownly)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/F1F7WYJ6B)

> **拥有更少，生活更好，决策更优。**

[English](README.md)

Ownly 是一个本地优先的决策账本，帮助你追踪物品、订阅和体验 —— 作为 Obsidian 插件和独立 Web 应用运行。所有数据以 Markdown 文件存储在你的 Vault 中，无需云端，无需账号，零网络调用。

![Ownly Homepage](docs/screenshot-homepage.jpg)

## 为什么选择 Ownly？

大多数追踪工具关注的是**你花了多少钱**。Ownly 关注的是**你是否应该花**。

它不是记账 App，不是愿望清单，而是一个结构化的消费决策系统：

- **种草**一个欲望 → **观察**一段时间 → **决定**买或不买 → **使用** → 退役后**复盘**
- 每个物品都有生命周期，每次体验都有复盘，数据指导下一次决策

你的数据以纯 Markdown 形式存储在 Obsidian Vault 中。你可以自由编辑、版本控制或移动文件。Ownly 读写 frontmatter —— 永远不会锁定、加密或删除你的数据。

## 快速开始

1. **安装** — 打开 Obsidian → 设置 → 社区插件 → 浏览 → 搜索 "Ownly" → 安装并启用。
2. **打开** — 点击左侧 Ribbon 的 Ownly 图标，或从命令面板运行 `Open Ownly workspace`。
3. **探索** — 首次连接时自动填充演示数据，你会看到示例物品、快照和复盘记录。

无需注册，无需配置，无需云同步。

## 功能

### 物品追踪

三种物品类型，完整的生命周期管理：

| 类型 | 生命周期 |
|---|---|
| **实物** | 种草 → 观望 → 购入 → 使用 → 闲置 → 转让 / 丢弃 |
| **订阅** | 活跃 → 暂停 → 取消 |
| **体验** | 计划中 → 进行中 → 已完成 → 已复盘 |

### 财务追踪

- **净资产快照** — 定期记录资产与负债余额，追踪净值变化趋势。
- **成本分析** — 日均成本、月固定成本、年化订阅成本、取得成本明细。
- **支付账户聚合** — 按支付账户查看固定成本压力。

### 复盘与排名

- 为物品撰写退役复盘，为体验撰写体验复盘。
- 对美食、风景和综合体验进行 1-10 分评分。
- 跨类别排名和对比体验。

### 旅行洞察

- 世界地图标记已访问的国家和城市。
- 旅行时间线和旅行统计。
- 旅行专属体验复盘。

### 数据健康

- **Doctor 诊断** — 本地数据质量检查：重复 ID、schema 验证、负成本检测、缺失引用。
- **归档与恢复** — 软删除，随时恢复。Markdown 数据永远不会丢失。

### 更多

- **双语界面** — 中英文自动检测。
- **快速录入** — 实物、订阅、体验模板。粘贴行解析快速输入。
- **仪表盘** — 净资产趋势、行动中心、优先队列、状态分布。

## 安装

### Obsidian 插件（推荐）

从 Obsidian 社区插件目录直接安装：

👉 **[安装 Ownly](https://obsidian.md/plugins?id=ownly)**

或手动操作：
1. 打开 Obsidian → 设置 → 社区插件 → 浏览。
2. 搜索 **Ownly**。
3. 安装并启用。

### Web App

Web App 是独立部署的浏览器版本，通过 File System Access API 连接本地文件夹。

```bash
npm run dev        # 开发服务器 localhost:3000
npm run build      # 静态导出到 out/
```

部署 `out/` 到任意静态托管（Vercel、Netlify、GitHub Pages）或本地运行：

```bash
npx pm2 start ecosystem.config.cjs
```

Web App 所有功能默认开启，无许可证限制。

## 数据存储

所有数据以 Markdown 文件存储在 Vault 的 `Ownly/` 目录下：

```text
Ownly/
  Objects/         # 实物、订阅、体验
  Accounts/        # 金融账户
  Snapshots/       # 净资产快照
  Reviews/         # 退役复盘、体验复盘
  Archive/         # 已归档（可恢复）
```

每个实体是一个独立的 `.md` 文件，使用 YAML frontmatter。你可以自由编辑、版本控制或移动这些文件。Ownly 读写标准 Markdown —— 无专有格式，无供应商锁定。

## 网络调用

Ownly **零网络调用**。所有数据保存在你的 Vault 中。无遥测，无分析，无追踪，无许可证验证。

## 免费版 vs Pro 版

| 功能 | 免费版 | Pro 版 |
|---|---|---|
| 物品追踪 | ✅ 最多 200 件 | ✅ 无限制 |
| 净资产快照 | ✅ 最多 30 次 | ✅ 无限制 |
| 复盘记录 | ✅ 最多 100 条 | ✅ 无限制 |
| 旅行洞察与世界地图 | ❌ | ✅ |
| Doctor 诊断 | ✅ | ✅ |
| 归档与恢复 | ✅ | ✅ |
| Markdown 数据导出 | ✅ 始终可用 | ✅ 始终可用 |

> **注意：** 当前版本（1.0.0）所有功能免费开放。Pro 版本可能在未来版本中推出。

**Pro 版** 通过 [Ko-fi](https://ko-fi.com/F1F7WYJ6B) 或 [Gumroad](https://liuh886.gumroad.com/l/ownly) 捐助解锁。免费用户始终拥有完整的 Markdown 数据访问权限 —— Ownly 永远不会因许可状态而锁定、加密、删除或阻止导出数据。

## 常见问题

**Ownly 支持移动端吗？**
Obsidian 插件仅支持桌面端（`isDesktopOnly: true`）。Web App 支持任何现代浏览器。

**卸载 Ownly 后数据怎么办？**
不会有任何影响。你的数据是 Vault 中的纯 Markdown 文件。卸载插件不会删除你的文件，你可以用任何文本编辑器读取、编辑和移动它们。

**不用 Obsidian 能用 Ownly 吗？**
可以。Web App 在任何现代浏览器中运行，通过 File System Access API 连接本地文件夹，所有功能默认开启。

**Ownly 支持离线使用吗？**
支持。Obsidian 插件和 Web App 都完全离线运行，无需网络连接。

**数据是如何存储的？**
每个实体是一个独立的 `.md` 文件，使用 YAML frontmatter。无数据库，无专有格式。你拥有你的数据。

## 支持

如果 Ownly 对你有帮助，欢迎支持：

- [Ko-fi](https://ko-fi.com/F1F7WYJ6B) — 一次性捐助
- [Gumroad](https://liuh886.gumroad.com/l/ownly) — 捐助并解锁 Pro

## 开发者文档

### 验证

```bash
npm run validate           # 完整验证：tsc + lint + web 构建 + obsidian 验证
npm run validate:obsidian  # 仅 Obsidian 插件
```

### Agent CLI

```bash
npm run wyqd -- --vault /path/to/vault object list
```

完整文档参见 [AGENT_CLI_GUIDE.md](docs/AGENT_CLI_GUIDE.md)。

### 示例 Vault

可重复使用的演示 fixture 位于 `samples/wyqd-vault/`，可用于 QA 和测试。

### 平台依赖重置

`esbuild` 使用原生二进制。如果跨平台构建失败：

```bash
npm run deps:reset
npm run package:obsidian
```

## 版本管理

Ownly 遵循 [语义化版本](https://semver.org/)。发布历史参见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

MIT。参见 [LICENSE](LICENSE)。

## 隐私

参见 [PRIVACY.md](PRIVACY.md)。所有数据本地存储，无遥测，无云同步。
