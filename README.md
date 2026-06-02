# Ownly

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/F1F7WYJ6B)

> **Own less, Live more, Decide better.**

**English** · [中文](#中文)

Ownly is an Obsidian-native, local-first decision ledger for tracking possessions, subscriptions, and experiences. All your data stays in your Vault as plain Markdown files. No cloud, no account required.

The design philosophy behind Ownly is not to encourage owning more, but to help you see clearly what you already own, what costs keep recurring, and which experiences are truly worth keeping — reducing decision noise through structured reviews.

## Screenshots

![Ownly Homepage](docs/screenshot-homepage.jpg)

## Features

- **Object tracking** — Log physical items, subscriptions, and one-time experiences with lifecycle status (seeded → observing → purchased → using → idle → discarded).
- **Net worth snapshots** — Record asset and liability balances over time.
- **Reviews & rankings** — Write exit records, experience reviews, and rank food, scenery, and experience.
- **Travel insights** (Pro) — World map with visited cities, timeline, and travel statistics.
- **Cost analysis** — Daily cost, monthly fixed cost, annual subscription cost, and acquisition cost breakdowns.
- **Archive & restore** — Soft-delete with full recovery. Your Markdown data is never locked or lost.
- **Doctor diagnostics** — Local data quality checks for your Vault.
- **Bilingual UI** — English and Chinese, with auto-detection.

## Free vs Pro

| Feature | Free | Pro |
|---|---|---|
| Object tracking | ✅ Up to 200 | ✅ Unlimited |
| Net worth snapshots | ✅ Up to 30 | ✅ Unlimited |
| Reviews | ✅ Up to 100 | ✅ Unlimited |
| Travel insights & world map | ❌ | ✅ |
| Doctor diagnostics | ✅ | ✅ |
| Archive & restore | ✅ | ✅ |
| Markdown data export | ✅ Always | ✅ Always |

**Pro** is unlocked when you support the project via [Ko-fi](https://ko-fi.com/F1F7WYJ6B) or [Gumroad](https://liuh886.gumroad.com/l/ownly). Free users always retain full access to their Markdown data — Ownly never locks, encrypts, deletes, or blocks export because of license state.

## Network Calls

Ownly is local-first. The **only** network call is the Gumroad License Verify API, used once when activating a Pro license key in the Obsidian plugin settings. After activation, the license state is stored locally and no further network calls are made. No telemetry, no analytics, no tracking.

## Support

If Ownly has been useful to you, consider supporting the project:

- [Ko-fi](https://ko-fi.com/F1F7WYJ6B) — One-time donation
- [Gumroad](https://liuh886.gumroad.com/l/ownly) — Support with Pro unlock

## Installation

### From Obsidian Community Plugins

1. Open Obsidian → Settings → Community plugins → Browse.
2. Search for **Ownly**.
3. Install and enable.

### Manual Installation

```bash
# Build and package
npm run package:obsidian

# Copy to your Vault
cp -R dist/obsidian/ownly /path/to/vault/.obsidian/plugins/ownly
```

Then enable `Ownly` from Obsidian → Settings → Community plugins.

### Web App

```bash
npm run dev        # Development
npm run build      # Production static export to out/
```

The Web App is always Pro (no license gating). It uses the File System Access API to connect to a local folder, or falls back to IndexedDB.

## Data Storage

All data is stored as Markdown files in your Vault under the `Ownly/` directory:

```text
Ownly/
  Objects/         # Physical items, subscriptions, experiences
  Accounts/        # Financial accounts
  Snapshots/       # Net worth snapshots
  Reviews/         # Exit records, experience reviews
  Archive/         # Soft-deleted items (recoverable)
```

Each entity is a standalone `.md` file with YAML frontmatter. You can edit, version-control, or move these files freely.

---

## 中文

> **拥有更少，生活更好，决策更优。**

Ownly 是一个帮助你追踪物品、订阅、资产与体验，并通过评分、回顾和排名做出更好生活决策的「意图生活」系统。

Ownly 的设计哲学是 **Own less, Live more, Decide better** —— 它不是鼓励你拥有更多，而是帮助你看清已经拥有的东西、持续消耗的成本和真正值得保留的体验，用结构化回顾降低决策噪音。

所有数据以 Markdown 文件存储在你的 Obsidian Vault 中，无需云端，无需账号。

### 功能

- **物品追踪** — 记录实物、订阅和一次性体验，支持完整生命周期（种草 → 观望 → 购入 → 使用 → 闲置 → 转让/丢弃）。
- **净资产快照** — 定期记录资产与负债余额，追踪净值变化。
- **复盘与排名** — 撰写退役复盘、体验复盘，对美食、风景和综合体验进行排名。
- **旅行洞察**（Pro）— 世界地图标记、时间线和旅行统计。
- **成本分析** — 日均成本、月固定成本、年化订阅成本、取得成本明细。
- **归档与恢复** — 软删除，随时恢复。Markdown 数据永远不会被锁定或丢失。
- **Doctor 诊断** — 本地数据质量检查。
- **双语界面** — 中英文自动检测。

### 免费版 vs Pro 版

| 功能 | 免费版 | Pro 版 |
|---|---|---|
| 物品追踪 | ✅ 最多 200 件 | ✅ 无限制 |
| 净资产快照 | ✅ 最多 30 次 | ✅ 无限制 |
| 复盘记录 | ✅ 最多 100 条 | ✅ 无限制 |
| 旅行洞察与世界地图 | ❌ | ✅ |
| Doctor 诊断 | ✅ | ✅ |
| 归档与恢复 | ✅ | ✅ |
| Markdown 数据导出 | ✅ 始终可用 | ✅ 始终可用 |

**Pro 版** 通过 [Ko-fi](https://ko-fi.com/F1F7WYJ6B) 或 [Gumroad](https://liuh886.gumroad.com/l/ownly) 捐助解锁。免费用户始终拥有完整的 Markdown 数据访问权限 —— Ownly 永远不会因许可状态而锁定、加密、删除或阻止导出数据。

### 网络调用

Ownly 以本地优先为原则。**唯一的网络调用**是 Gumroad License Verify API，仅在 Obsidian 插件设置中激活 Pro 许可证时使用一次。激活后，许可证状态存储在本地，不再进行任何网络调用。无遥测，无分析，无追踪。

### 支持

如果 Ownly 对你有帮助，欢迎支持：

- [Ko-fi](https://ko-fi.com/F1F7WYJ6B) — 一次性捐助
- [Gumroad](https://liuh886.gumroad.com/l/ownly) — 捐助并解锁 Pro

### 安装

**从 Obsidian 社区插件安装：**

1. 打开 Obsidian → 设置 → 社区插件 → 浏览。
2. 搜索 **Ownly**。
3. 安装并启用。

**手动安装：**

```bash
npm run package:obsidian
cp -R dist/obsidian/ownly /path/to/vault/.obsidian/plugins/ownly
```

然后在 Obsidian → 设置 → 社区插件中启用 `Ownly`。

### 数据存储

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

---

## Developer Documentation

### Validation

```bash
npm run validate           # Full gate: tsc + lint + web build + obsidian validation
npm run validate:obsidian  # Obsidian plugin only
```

### Agent CLI

```bash
npm run wyqd -- --vault /path/to/vault object list
```

### Sample Vault

A repeatable demo fixture is at `samples/wyqd-vault/`. Use it for QA and testing.

### Platform-Specific Dependency Reset

`esbuild` ships native binaries. If cross-platform builds fail:

```bash
npm run deps:reset
npm run package:obsidian
```

## Versioning

Ownly follows [Semantic Versioning](https://semver.org/). See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

MIT. See [LICENSE](LICENSE).

## Privacy

See [PRIVACY.md](PRIVACY.md). All data stays local. No telemetry. No cloud sync.
