# Ownly Terminology Contract

This document defines the canonical product vocabulary for Ownly across the hosted Web app, installed PWA, Obsidian plugin, Agent CLI, MCP, documentation, and error messages.

Ownly supports user-controlled filesystem storage. Product language must describe the shared data model accurately without implying that Obsidian is required or that Ownly operates a cloud-storage backend.

## Core storage terms

| Canonical English | Canonical Chinese | Use |
|---|---|---|
| Ownly data folder | Ownly 数据目录 | Cross-runtime name for the folder containing Ownly Markdown data |
| user-controlled storage | 用户控制存储 | Umbrella principle: the user chooses where the filesystem folder lives |
| local folder | 本地目录 | Normal filesystem folder stored on the current device without a user-selected sync location |
| personal cloud folder | 个人云盘目录 | Normal local filesystem folder synchronized by the user's own provider |
| data location | 数据位置 | The filesystem directory selected or created by the user |
| Obsidian Vault | Obsidian Vault / Obsidian 知识库 | Only when referring to an actual Obsidian Vault or plugin runtime |
| data root | 数据根目录 | Developer-facing term for the directory containing `Objects/`, `Reviews/`, and related folders |

### Required distinction

- Web/PWA users **choose an Ownly data folder**.
- That folder may be a **local folder** or a **personal cloud folder**.
- A personal cloud folder is still a local filesystem folder from Ownly's point of view; the user's provider performs synchronization.
- Obsidian plugin users may keep the same Ownly data folder inside an **Obsidian Vault**.
- Avoid using “Vault” as a generic synonym for every Ownly data folder.
- Avoid using “Cloud Storage” by itself because it can imply an Ownly-hosted backend.
- Do not say that every record necessarily remains on one physical device when a user may choose a synchronized folder.

Approved storage positioning:

> **Ownly doesn't host your data. You choose where your files live.**

Supporting line:

> **Local by default. Sync wherever you choose.**

### Synchronization boundary

Use this rule consistently:

> **One Ownly data folder, one sync provider.**

Ownly does not authenticate to Dropbox, Google Drive, OneDrive, iCloud Drive, or other filesystem-sync providers for this capability. It does not store provider credentials, operate a sync engine, or merge provider conflicts.

When documenting personal cloud folders, recommend keeping the selected folder available offline when the provider supports online-only placeholders.

## Actions and states

| Canonical English | Canonical Chinese | Meaning |
|---|---|---|
| Create new data | 创建新数据 | Select a location and initialize an Ownly data structure |
| Open existing data | 打开已有数据 | Select an existing Ownly data folder or an Obsidian Vault containing one |
| Choose data folder | 选择数据目录 | Main Web/PWA storage entry action |
| Connect data folder | 连接数据目录 | Grant or renew browser directory permission |
| Change data folder | 更换数据目录 | Replace the currently selected browser directory |
| Data folder connected | 数据目录已连接 | Web/PWA has read/write access to the selected location |
| Demo mode | 演示模式 | No real Ownly data folder is connected; demo content is not the source of truth |
| Archive | 归档 | Recoverable removal from active records |
| Restore | 恢复 | Return an archived record to active storage |
| Permanently delete | 永久删除 | Irreversible deletion of an archived record |

Do not use **Delete** for a recoverable archive action. Do not use **Archive** for irreversible deletion.

## Domain terms

| Canonical English | Canonical Chinese | Notes |
|---|---|---|
| object | 对象 / 条目 | Stable domain, schema, and API term; UI may use a more specific type label |
| physical item | 实体物品 | `object_type: physical` |
| recurring cost | 周期性支出 | Includes subscriptions; `object_type: recurring_cost` |
| one-time experience | 一次性体验 | Trips, dining, events, plans; `object_type: one_time_experience` |
| snapshot | 快照 | A point-in-time account/net-worth record |
| review | 复盘 | Structured post-use or post-exit reflection |
| object experience log | 对象体验记录 | Append-only usage, issue, maintenance, regret, lesson, comparison, or exit event |
| Doctor | 数据检查 / Doctor | Deterministic Ownly data-health diagnostics, not a cloud-provider or AI feature |

Stable frontmatter fields, JSON keys, directory names, and object-type identifiers are domain contracts rather than product copy.

## Runtime names

| Runtime | Canonical description |
|---|---|
| Web app | Hosted local-first browser runtime that reads and writes a user-selected filesystem folder |
| PWA | Installed form of the same Web runtime; data behavior remains identical |
| Obsidian plugin | Obsidian-native interface over the shared Ownly data model |
| Agent CLI | Deterministic fact-ready read/write interface for scripts and external agents |
| Local MCP | Read-only STDIO adapter over the same user-selected Ownly evidence store |

Avoid describing Web, PWA, Obsidian, CLI, and MCP as separate products. They are interfaces over one data model and one data folder.

## Privacy language

Approved:

> Ownly does not host your personal ledger. If you place the Ownly data folder inside a folder synchronized by your own provider, that provider handles synchronization under its own privacy and security policies.

For MCP, add the separate boundary that facts explicitly returned by an MCP tool can enter the connected external agent/provider context.

Avoid claims such as:

- every file always stays only on this device;
- no data can ever leave the device;
- Ownly cloud storage;
- Ownly syncs your Dropbox / Google Drive data.

## Fact-ready, not AI-powered

Approved positioning:

> Ownly stores structured, user-controlled, fact-ready data that humans, scripts, and external AI agents can read through stable contracts.

Avoid product claims such as:

- AI assistant
- AI recommendations
- AI-powered purchase decisions
- built-in chatbot
- automatic model-generated advice

Ownly provides trustworthy facts and deterministic mutations. Intelligence may be supplied by external tools under user control.

## Internal identifiers

Historical internal identifiers such as `WYQD`, `vault`, or old CLI names do not define current product terminology. New code and user-facing copy should use the canonical terms above; obsolete public aliases should be removed when their owning surface is changed rather than extended with additional compatibility names.

## Release check

Before each release:

1. Compare Web/PWA, Obsidian, README, user guide, MCP/CLI documentation, Privacy, and Product Governance against this contract.
2. Confirm Web/PWA does not imply that Obsidian is required.
3. Confirm local folder and personal cloud folder both converge on the same Ownly data-folder model.
4. Confirm no provider SDK/OAuth/cloud backend is implied by personal cloud folder support.
5. Confirm device-only privacy claims are narrowed where a sync provider or external MCP client may process selected data.
6. Confirm recoverable archive and irreversible deletion use distinct wording.
7. Confirm product copy describes fact-ready data rather than built-in AI functionality.
