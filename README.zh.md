# Ownly

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-blue?logo=obsidian)](https://obsidian.md/plugins?id=ownly)
[![Status](https://img.shields.io/badge/status-stable_1.x-brightgreen.svg)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/F1F7WYJ6B)

> **拥有更少，生活更好，决策更优。**

[English](README.md)

Ownly 是一个本地优先的决策账本，适合想减少冲动消费、看清自己真正使用了什么、并把过去的购买转化为下一次更好决策的人。

- **本地优先决策账本**：追踪从欲望到复盘的完整生命周期，而不只是花了多少钱。
- **纯 Markdown 的个人数据**：每个物品、快照和复盘都是 Obsidian vault 中的普通 `.md` 文件。默认私密，无云同步或遥测。
- **为人类和 AI Agent 构建**：你可以通过 Obsidian 界面手动编辑，也可以使用内置的 Agent CLI 让 AI 帮你自动化打理生活。

![Ownly Homepage](docs/screenshot-homepage.jpg)

## 项目状态

Ownly `1.x` 是公开的 Obsidian 插件版本；Obsidian 是主要支持的使用形态；当前验证状态见 [docs/QUALITY_BASELINE.md](docs/QUALITY_BASELINE.md)。Web runtime 保留用于本地浏览器使用、开发调试和共享核心层验证。

| 领域 | 状态 |
|---|---|
| Obsidian 插件 | 主要运行时；见质量基线 |
| Web runtime | 兼容的本地运行时 |
| 数据格式 | 纯 Markdown + YAML frontmatter |
| 存储模型 | 本地 Vault / 本地文件夹 |
| 网络模型 | 不上传个人账本数据 |

## 为什么选择 Ownly？

大多数追踪工具关注的是**你花了多少钱**。Ownly 关注的是**你是否应该花**。

它不是记账 App，不是愿望清单，而是一个结构化的消费决策系统：

- **种草**一个欲望 → **观察**一段时间 → **决定**买或不买 → **使用** → 退役后**复盘**
- 每个物品都有生命周期，每次体验都有复盘，数据指导下一次决策
- 欲望值得先被观察，而不是立刻变成购买。
- 物品只有在看见使用、成本和退场故事之后，才真正有意义。
- 复盘会把旧消费变成下一次决策的训练数据。

你的数据以纯 Markdown 形式存储在 Obsidian Vault 中。你可以自由编辑、版本控制或移动文件。Ownly 读写 frontmatter —— 永远不会锁定、加密或删除你的数据。

## 快速开始

1. **安装** — 打开 Obsidian → 设置 → 社区插件 → 浏览 → 搜索 "Ownly" → 安装并启用。
2. **打开** — 点击左侧 Ribbon 的 Ownly 图标，或从命令面板运行 `Open Ownly workspace`。
3. **探索** — 首次连接时自动填充演示数据，你会看到示例物品、快照和复盘记录。

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
- **仪表盘** — 物品概览、成本压力、快速录入、复盘行动和数据规模。

## 安装

### Obsidian 插件（推荐）

从 Obsidian 社区插件目录直接安装：

👉 **[安装 Ownly](https://obsidian.md/plugins?id=ownly)**

### Web Runtime（本地浏览器 / 开发者）

Ownly 也可以在浏览器中运行，并通过 File System Access API 连接本地文件夹。这适合在 Obsidian 之外试用共享界面、本地开发，以及静态部署实验。

Obsidian 插件仍然是主要运行时。Web runtime 与共享 Markdown 数据模型兼容，但浏览器文件访问能力取决于用户的浏览器和授权状态。

```bash
# 克隆并安装
git clone https://github.com/liuh886/ownly.git
cd ownly
npm ci

# 开发服务器 localhost:3000
npm run dev

# 或构建并启动静态服务
npm run build
npx pm2 start ecosystem.config.cjs   # 在 3000 端口提供 out/ 目录
```

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

每个实体是一个独立的 `.md` 文件，使用 YAML frontmatter。你可以自由编辑、版本控制或移动这些文件。

## 网络调用

Ownly 在应用运行时**不会发起任何涉及个人数据的网络调用**。所有数据保存在你的 Vault 中。无遥测，无分析，无追踪，无许可证验证。

## 赞助

Ownly 采用赞助模式。它不做付费许可证联网校验，也不会为激活功能发起网络请求。基础版开箱即用，提供宽裕的额度（如 200 件物品、100 条复盘），所有用户始终拥有完整的 Markdown 数据访问权限 —— Ownly 永远不会因许可状态而锁定、加密、删除或阻止导出数据。

当前版本（1.x）允许你使用 App 中直接展示的免费激活码解锁无限制使用和额外功能（如旅行洞察）。

## 常见问题

**Ownly 支持移动端吗？**
Obsidian 插件标记为仅桌面端（`isDesktopOnly: true`），因为尚未在移动端测试。可能会正常工作，但不保证移动端支持。

**卸载 Ownly 后数据怎么办？**
不会有任何影响。你的数据是 Vault 中的纯 Markdown 文件。卸载插件不会删除你的文件，你可以用任何文本编辑器读取、编辑和移动它们。

**不用 Obsidian 能用 Ownly 吗？**
可以。Web runtime 可在支持本地文件夹访问的桌面浏览器中运行。参见 [Web Runtime 安装](#web-runtime本地浏览器--开发者)。

## 已知限制

- Obsidian 插件仅支持桌面端。
- 浏览器文件夹访问依赖 File System Access API 支持。
- Web runtime 聚焦本地兼容和共享核心验证；Obsidian 是主要支持体验。
- Web 中账户快照可用，但完整的独立账户实体管理在 Obsidian repository adapter 中更完整。

## 界面截图

*(更多截图即将上线)*

## 支持

如果 Ownly 对你有帮助，欢迎支持：

- [Ko-fi](https://ko-fi.com/F1F7WYJ6B) — 一次性捐助
- [Gumroad](https://liuh886.gumroad.com/l/ownly) — 可选项目赞助

## 文档

- [用户指南 (User Guide)](docs/USER_GUIDE.md) — 如何使用首页、物品、快照和复盘等核心功能。
- [数据模型 (Data Model)](docs/DATA_MODEL.md) — 解释 Markdown frontmatter 结构和存储原理。
- [常见问题排查 (Troubleshooting)](docs/TROUBLESHOOTING.md) — 如何修复损坏的数据以及使用 Doctor 工具。
- [Agent CLI 接口 (Agent CLI Guide)](docs/AGENT_CLI_GUIDE.md) — 了解 AI Agent 如何安全地读写你的 Ownly 数据。
- [发版流程 (Release Checklist)](docs/RELEASE_CHECKLIST.md) — 发版检查单。
- [Obsidian 审核合规规范 (Obsidian Reviewer Compliance)](docs/OBSIDIAN_REVIEWER_CHECKLIST.md) — 提交 Obsidian 插件 PR 前的强制检查单。

## 开发者文档

### 验证

```bash
npm run validate           # 完整验证：tsc + lint + web 构建 + obsidian 验证
npm run validate:obsidian  # 仅 Obsidian 插件
npm run smoke:install      # 首次安装 Python Playwright 浏览器烟测依赖
npm run smoke:web          # 启动本地 Next 并烟测 Web runtime
```

### Ownly CLI

CLI 工具可通过历史内部别名 `wyqd` 调用：

```bash
npm run wyqd -- --vault /path/to/vault object list
```

完整文档参见 [AGENT_CLI_GUIDE.md](docs/AGENT_CLI_GUIDE.md)。

### 示例 Vault

可重复使用的演示 fixture 位于 `samples/wyqd-vault/`（使用历史内部别名），可用于 QA 和测试。

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
