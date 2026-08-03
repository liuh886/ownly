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

推荐把 Ownly 数据目录放在 Obsidian Vault 内，便于直接阅读、搜索和编辑；但使用在线 Web App 或安装后的 PWA **不要求安装 Obsidian**。

## 打开 Ownly

- **[浏览产品主页](https://liuh886.github.io/ownly/)**
- **[打开 Web App / PWA](https://liuh886.github.io/ownly/app/)**
- **[查看无需权限的产品预览](https://liuh886.github.io/ownly/app/?demo=1)**

| 使用入口 | 是否需要 Obsidian | 是否需要本地服务器 | 适合场景 |
|---|---:|---:|---|
| GitHub Pages Web App | 否 | 否 | 在支持的桌面浏览器中直接使用 |
| 安装为 PWA | 否 | 否 | 独立应用窗口，并支持离线启动应用界面 |
| Obsidian 插件 | 是 | 否 | 原生 Vault 集成与深度 Markdown 工作流 |

Web App 和 PWA 是同一个浏览器运行时。安装 PWA 只改变启动方式，不改变数据模型。

## 首次使用：创建或打开本地数据

当 Ownly 尚未取得本地目录权限时，会提供两条明确路径。

### 创建新的本地数据

选择一个父目录，例如 `Documents`、Obsidian Vault 根目录，或一个已经命名为 `Ownly` 的空文件夹。

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
- 使用插件自定义 Ownly 数据目录的 Obsidian Vault。

浏览器会明确请求本地读写权限。个人 Markdown 文件不会上传到 GitHub Pages，也不会被复制进 PWA 的 service worker 缓存。

托管 Web/PWA 使用 Google Analytics 测量 ID `G-KXXVS33FQ2` 统计整体访问情况。Ownly 不会把 Markdown 正文、本地文件名、表单值、对象记录或所选目录信息作为自定义分析事件发送。Obsidian 插件和 Agent CLI 不加载 Google Analytics。

## 推荐的数据存储方式

推荐布局：

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

不使用 Obsidian 时，也支持独立本地布局：

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

把 `Ownly/` 放在 Obsidian Vault 内，可以让同一套 Markdown 数据被 Web/PWA、Obsidian 插件和 Agent CLI 共同使用，并便于阅读、搜索、编辑和版本管理。

## 产品原则

- **本地优先** —— 无需云端账号、托管数据库或强制同步。托管 Web/PWA 只进行整体访问统计，本地 Ownly 记录仍保留在本地。
- **Markdown 原生** —— 数据长期可读、可迁移、无私有格式锁定。
- **以决策为主线** —— 观察、购买或放弃、使用、退出与复盘。
- **数据操作可恢复** —— 归档与恢复不同于永久删除。
- **一套数据模型** —— Web、PWA、Obsidian 和 CLI 使用相同 schema 与目录结构。
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

## Fact-ready Agent CLI

Ownly 为脚本和外部 Agent 提供确定性的 JSON 读写命令。项目不包含模型 API、embedding、AI 聊天或自动生成的消费建议。

```bash
export OWNLY_VAULT=/path/to/location-containing-Ownly

npm run --silent wyqd -- object list --json
npm run --silent wyqd -- object get --id <id> --json
npm run --silent wyqd -- object history --id <id> --json
npm run --silent wyqd -- object review-needed --json
npm run --silent wyqd -- recurring list --active --json
npm run --silent wyqd -- summary --json
```

相关文档：

- [Agent CLI Contract](docs/AGENT_CLI_CONTRACT.md)
- [Agent CLI Guide](docs/AGENT_CLI_GUIDE.md)
- [数据模型](docs/DATA_MODEL.md)

`OWNLY_VAULT` 是为兼容历史保留的环境变量名。它既可以指向 Obsidian Vault，也可以指向其它包含 Ownly 数据目录的本地位置。

## 当前运行时状态

| 领域 | 状态 |
|---|---|
| 产品主页 | 静态双语产品介绍与转化入口 |
| 在线 Web App | 托管于 GitHub Pages，通过浏览器直接访问本地目录 |
| 产品预览 | 使用虚构数据、无需权限、不写入本地文件 |
| 安装版 PWA | 与 Web 数据行为一致，增加独立启动和应用界面离线缓存 |
| Obsidian 插件 | 基于共享 Ownly 数据模型的原生 Vault 界面 |
| Agent CLI | 稳定、严格类型化的 fact-ready JSON 契约 |
| 数据存储 | 本地纯 Markdown + YAML frontmatter |
| 数据操作安全 | 创建、修改、归档和恢复的 repository 契约由 CI 保护 |

当前验证状态与剩余覆盖缺口见 [质量基线](docs/QUALITY_BASELINE.md)。

## 浏览器支持

直接访问本地目录依赖 File System Access API。

- 推荐使用最新版桌面 Chrome 或 Microsoft Edge。
- 不支持的浏览器可以浏览产品主页和无需权限的产品预览，但不能连接本地数据。
- 移动端直接目录访问不是当前生产目标。
- 浏览器重启、权限清理后，可能需要重新授权本地目录。

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

这些检查只处理本地事实，不使用 AI。

## 文档

- [用户指南](docs/USER_GUIDE.md)
- [Web Runtime](docs/WEB_RUNTIME.md)
- [术语契约](docs/TERMINOLOGY.md)
- [质量基线](docs/QUALITY_BASELINE.md)
- [Agent CLI Contract](docs/AGENT_CLI_CONTRACT.md)
- [Agent CLI Guide](docs/AGENT_CLI_GUIDE.md)
- [数据模型](docs/DATA_MODEL.md)
- [问题排查](docs/TROUBLESHOOTING.md)
- [发版检查](docs/RELEASE_CHECKLIST.md)

## 开发

```bash
npm ci
npm run validate
npm run test
npm run test:e2e:data
npm run wyqd -- --vault <path> object list --json
```

## 许可证

MIT。参见 [LICENSE](LICENSE)。个人 Ownly 记录始终保留在本地。托管 Web/PWA 使用 Google Analytics 统计整体访问情况；Obsidian 插件和 CLI 不使用该分析服务。
