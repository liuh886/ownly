# Ownly

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-blue?logo=obsidian)](https://obsidian.md/plugins?id=ownly)
[![Web App](https://img.shields.io/badge/Web-打开_Ownly-111827?logo=googlechrome&logoColor=white)](https://liuh886.github.io/ownly/app/)
[![PWA](https://img.shields.io/badge/PWA-可安装-0f766e?logo=pwa&logoColor=white)](https://liuh886.github.io/ownly/app/)
[![Status](https://img.shields.io/badge/status-stable_1.x-brightgreen.svg)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/F1F7WYJ6B)

> **拥有更少，生活更好，决策更优。**

[English](README.md)

**本地优先的所有权记忆与决策账本。**

Ownly 帮助你记录拥有什么、花费多少、实际如何使用，以及最终学到了什么。个人数据以带 YAML frontmatter 的纯 Markdown 文件保存在 **Ownly 数据目录** 中。

> **Ownly 不托管你的个人数据。数据保存在哪里，由你决定。**

Ownly 数据目录既可以放在普通本地目录中，也可以放进由你自己控制的 Dropbox、Google Drive、OneDrive、iCloud Drive 等本地同步目录。Obsidian 便于直接阅读和编辑 Markdown，但在线 Web App、PWA、Agent CLI 和本地 MCP 都**不要求安装 Obsidian**。

## 打开 Ownly

- **[浏览产品主页](https://liuh886.github.io/ownly/)**
- **[查看首页内嵌产品预览](https://liuh886.github.io/ownly/#preview)**
- **[打开 Web App / PWA](https://liuh886.github.io/ownly/app/)**

| 使用入口 | 是否需要 Obsidian | 是否需要本地进程 | 适合场景 |
|---|---:|---:|---|
| GitHub Pages Web App | 否 | 否 | 在支持的桌面浏览器中直接使用 |
| 安装为 PWA | 否 | 否 | 独立应用窗口，并支持离线启动应用界面 |
| Obsidian 插件 | 是 | 否 | 原生 Vault 集成与 Markdown 工作流 |
| Agent CLI | 否 | 是 | 确定性脚本与经过验证的本地写入 |
| 本地 MCP | 否 | 是 | 提供有边界的读取，以及可选的“预览后提交”维护能力 |

Web App 和 PWA 是同一个浏览器运行时。安装 PWA 只改变启动方式，不改变数据模型。

## 首次使用：选择数据保存在哪里

Ownly 尚未取得目录权限时，先选择存储位置，再创建新数据或打开已有数据。

### 保存在这台设备上

选择普通本地文件夹。Ownly 直接读写这个目录；除非你在 Ownly 之外主动配置同步，否则文件不会被同步。

### 保存在个人云盘目录中

选择一个已经由 Dropbox、Google Drive、OneDrive、iCloud Drive 或其它服务同步到本机的目录。

Ownly 仍然只读写普通本地文件，不接入云盘 API、不做 OAuth、不保存云盘凭据、不建立 Ownly 云端副本，也不维护第二套 remote filesystem。

同步由你的云盘服务按照其自己的隐私与安全政策负责。如果服务支持“仅在线”文件，请让 Ownly 数据目录保持可离线使用；同时遵守 **一个 Ownly 数据目录只使用一个同步服务** 的规则，以减少冲突副本。

### 创建新数据

选择 `Documents`、Obsidian Vault 根目录、个人云盘本地同步目录，或一个已经命名为 `Ownly` 的空文件夹。

Ownly 会自动初始化：

```text
Ownly/
  Objects/
  Accounts/
  Snapshots/
  Reviews/
  Logs/
    Object Experiences/
  Archive/
    Objects/
    Accounts/
    Snapshots/
    Reviews/
    Object Logs/
```

如果所选文件夹本身已经叫 `Ownly`，系统会直接使用它，不会生成 `Ownly/Ownly`。

### 打开已有数据

可以选择：

- 已包含 `Objects/` 的 Ownly 数据根目录；
- 一个空的或已有数据的 `Ownly` 文件夹；
- 包含 `Ownly/` 子目录的 Obsidian Vault；
- 使用插件自定义 Ownly 数据目录的 Obsidian Vault；
- 上述任何一种位于用户自己的本地同步目录中的位置。

浏览器会明确请求读写权限。个人 Markdown 文件不会上传到 GitHub Pages，也不会被复制进 PWA 的 service worker 缓存。如果所选目录本身由第三方云盘同步，该服务可能会独立于 Ownly 上传和同步这些文件。

托管 Web/PWA 使用 Google Analytics 4 测量 ID `G-KXXVS33FQ2` 了解产品采用情况，同时可加载 Cloudflare Web Analytics 统计整体访问与 Web Vitals。Ownly 自定义分析事件不会发送 Markdown 正文、文件名、本地路径、表单值、对象记录、复盘内容、账户快照、所选目录信息、从路径推断的云盘服务名或 MCP tool result。Obsidian 插件、Agent CLI 和 MCP runtime 均不加载这两类 Web Analytics。

## 推荐的数据存储方式

纯本地：

```text
<你的本地文件夹>/
  Ownly/
    Objects/
    Accounts/
    Snapshots/
    Reviews/
    Logs/
    Archive/
```

放在 Obsidian Vault 内：

```text
<你的 Obsidian Vault>/
  Ownly/
    Objects/
    Accounts/
    Snapshots/
    Reviews/
    Logs/
    Archive/
```

放在个人云盘的本地同步目录内：

```text
<你的 Dropbox / Google Drive / OneDrive / iCloud Drive 本地目录>/
  Ownly/
    Objects/
    Accounts/
    Snapshots/
    Reviews/
    Logs/
    Archive/
```

三种布局都使用同一套 Ownly 数据模型。个人云盘选项不会产生第二套 storage backend；同步由外部服务完成。

## 产品原则

- **用户控制存储** —— Ownly 不托管你的个人账本，文件保存在哪里由你决定。
- **默认本地** —— 不要求云端账号、托管数据库、provider OAuth 或强制同步。
- **Markdown 原生** —— 数据长期可读、可迁移、无私有格式锁定。
- **以决策为主线** —— 观察、购买或放弃、使用、退出与复盘。
- **数据操作可恢复** —— 归档与恢复不同于永久删除。
- **一套数据模型** —— Web、PWA、Obsidian、CLI 和 MCP 使用相同 schema 与目录结构。
- **Fact-ready** —— 脚本和外部 AI Agent 可以通过稳定契约读取事实；Ownly 本身不是 AI 助手。

## Ownly 记录什么

| 记录类型 | 用途 |
|---|---|
| 实体物品 | 购买、使用、成本、状态、退役、转让或丢弃生命周期 |
| 周期性支出 | 订阅和其它重复支出、账单周期、状态与年化成本 |
| 一次性体验 | 计划、预算、实际花费、地点、完成与复盘 |
| 快照 | 某一时点的净资产和账户余额事实 |
| 复盘 | 使用后、退出后、月度或年度的结构化总结 |
| 对象体验记录 | 追加式记录使用、问题、维护、后悔、经验、比较或退出事件 |

## Agent CLI 与 MCP

Ownly 为脚本和外部 Agent 提供确定性的 JSON CLI；同时提供本地 MCP server，让支持 stdio MCP 的 Agent 查询和维护同一份 Ownly 数据。MCP 默认只读；只有显式启用写入并完成“预览 → 用户确认 → 提交”后，才会修改文件。每次提交前都会在数据目录外创建安全备份。

MCP 不建立第二数据库，也不托管你的 Markdown。source of truth 始终是你选择的 Ownly 数据目录。通过 MCP 明确返回给外部 Agent 的事实可能进入该 Agent / 模型服务商的上下文，因此 Ownly 不声称 Agent 会话中的所有数据都永远留在本机。

相关文档：

- [Agent CLI Contract](docs/AGENT_CLI_CONTRACT.md)
- [Agent CLI Guide](docs/AGENT_CLI_GUIDE.md)
- [Agent / MCP Guide](docs/MCP.md)
- [数据模型](docs/DATA_MODEL.md)

## 当前运行时状态

| 领域 | 状态 |
|---|---|
| 产品主页 | 静态双语产品介绍，并内嵌可交互产品预览 |
| 在线 Web App | 托管于 GitHub Pages，通过浏览器访问用户选择的文件系统目录 |
| 安装版 PWA | 独立启动和应用界面离线缓存，与 Web 使用同一数据行为 |
| Obsidian 插件 | 基于共享 Ownly 数据模型的原生 Vault 界面 |
| Agent CLI | 稳定、严格类型化的 fact-ready JSON 契约 |
| 本地 MCP | 默认只读；可显式启用基于同一数据源的两阶段写入 |
| 数据存储 | 用户控制文件系统目录中的纯 Markdown + YAML frontmatter |
| 数据操作安全 | 校验、预览确认、原子写入、安全备份、审计日志、冲突检测、归档恢复和 CI 契约 |

## 浏览器支持

直接访问目录依赖 File System Access API。

- 推荐使用最新版桌面 Chrome 或 Microsoft Edge。
- 不支持的浏览器可以浏览产品主页和内嵌产品预览，但不能连接真实 Ownly 数据目录。
- 移动端直接目录访问不是当前生产目标。
- 浏览器重启、权限清理后，可能需要重新授权目录。
- 个人云盘目录必须由对应服务以可用的本地文件系统目录形式暴露；Ownly 不提供 remote-drive API fallback。

隐私边界、PWA 行为和部署说明见 [Web Runtime](docs/WEB_RUNTIME.md)。

## Obsidian 插件

从 Obsidian 社区插件目录安装：

👉 **[安装 Ownly](https://obsidian.md/plugins?id=ownly)**

Obsidian 插件并非 Web/PWA 用户的必需条件。只有在明确指代真实 Vault 或 Obsidian 运行时时，才使用“Obsidian Vault”；跨运行时的统一存储术语是 **Ownly 数据目录**。

## 数据健康

Ownly 提供确定性的 Doctor 数据检查，包括：

- 重复实体 ID；
- 不支持的 schema 版本；
- 异常成本或日期；
- 缺失的对象与复盘引用；
- 过期快照；
- 缺失的数据目录。

这些检查只处理 Ownly 事实和文件系统可访问性，不使用 AI，也不检查 Dropbox、Google Drive 等云盘账户状态。

## 文档

- [用户指南](docs/USER_GUIDE.md)
- [Web Runtime](docs/WEB_RUNTIME.md)
- [术语契约](docs/TERMINOLOGY.md)
- [产品治理](docs/PRODUCT_GOVERNANCE.md)
- [质量基线](docs/QUALITY_BASELINE.md)
- [Agent CLI Contract](docs/AGENT_CLI_CONTRACT.md)
- [Agent CLI Guide](docs/AGENT_CLI_GUIDE.md)
- [Agent / MCP Guide](docs/MCP.md)
- [数据模型](docs/DATA_MODEL.md)
- [问题排查](docs/TROUBLESHOOTING.md)
- [发版检查](docs/RELEASE_CHECKLIST.md)

## 开发

```bash
npm ci
npm run validate
npm run test
npm run test:e2e:data
npm run test:mcp
```

## 许可证

MIT。参见 [LICENSE](LICENSE)。Ownly 不托管个人账本；用户自己选择的文件同步服务或外部 MCP Agent 可能按照各自的隐私与安全政策处理相关数据。托管 Web/PWA 可使用 GA4 记录有限产品采用事件，并使用 Cloudflare Web Analytics 统计整体访问与 Web Vitals；Obsidian 插件、CLI 和 MCP runtime 均不加载这两类分析服务。
