# Ownly Terminology Contract

This document defines the canonical product vocabulary for Ownly across the hosted Web app, installed PWA, Obsidian plugin, Agent CLI, documentation, and error messages.

Ownly began as an Obsidian-first project but now supports standalone local folders. Product language must describe the shared data model accurately without implying that Obsidian is required.

## Core storage terms

| Canonical English | Canonical Chinese | Use |
|---|---|---|
| Ownly data folder | Ownly 数据目录 | Cross-runtime name for the folder containing Ownly Markdown data |
| local data | 本地数据 | User-facing Web/PWA wording for data stored on the user's device |
| local data location | 本地数据位置 | The directory selected or created by the user |
| Obsidian Vault | Obsidian Vault / Obsidian 知识库 | Only when referring to an actual Obsidian Vault or plugin runtime |
| standalone local folder | 独立本地目录 | Ownly data used without Obsidian |
| data root | 数据根目录 | Developer-facing term for the directory containing `Objects/`, `Reviews/`, and related folders |

### Required distinction

- Web and PWA users **create or open local data**.
- Obsidian plugin users work with an **Obsidian Vault**.
- Obsidian is recommended as a storage environment but is not required by Web/PWA.
- Avoid using “Vault” as a generic synonym for every Ownly data folder.

## Actions and states

| Canonical English | Canonical Chinese | Meaning |
|---|---|---|
| Create new local data | 创建新的本地数据 | Select a location and initialize an Ownly data structure |
| Open existing data | 打开已有数据 | Select an existing Ownly data root or an Obsidian Vault containing Ownly data |
| Create or open data | 创建或打开数据 | Main Web/PWA entry action |
| Connect local data | 连接本地数据 | Grant or renew browser directory permission |
| Reconnect | 重新连接 | Renew or replace an existing browser directory permission |
| Local data connected | 本地数据已连接 | Web/PWA has read/write access to the selected location |
| Demo mode | 演示模式 | No real local data is connected; demo content is not the source of truth |
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
| Doctor | 数据检查 / Doctor | Deterministic data-health diagnostics, not an AI feature |

Stable frontmatter fields, CLI commands, JSON keys, directory names, and object-type identifiers are not renamed for copy consistency.

## Runtime names

| Runtime | Canonical description |
|---|---|
| Web app | Hosted local-first browser runtime on GitHub Pages |
| PWA | Installed form of the same Web runtime; data behavior must remain identical |
| Obsidian plugin | Obsidian-native interface over the shared Ownly data model |
| Agent CLI | Deterministic fact-ready read/write interface for scripts and external agents |

Avoid describing Web, PWA, and Obsidian as separate products. They are interfaces over one data model.

## Fact-ready, not AI-powered

Approved positioning:

> Ownly stores structured, local, fact-ready data that humans, scripts, and external AI agents can read through stable contracts.

Avoid product claims such as:

- AI assistant
- AI recommendations
- AI-powered purchase decisions
- built-in chatbot
- automatic model-generated advice

Ownly provides trustworthy facts and deterministic mutations. Intelligence may be supplied by external tools under user control.

## Legacy identifiers

Some internal identifiers retain the historical `WYQD` or `vault` naming for backward compatibility. These may remain in code where changing them would create migration or API risk, but new user-facing text must follow this contract.

Examples:

- `OWNLY_VAULT` remains a supported CLI environment variable unless a backward-compatible alias is introduced.
- Existing directory names such as `Ownly/Objects` and frontmatter keys remain stable.
- Internal class names may be migrated separately; they do not define user-facing terminology.

## Release check

Before each release:

1. Compare Web/PWA, Obsidian, README, user guide, and CLI documentation against this contract.
2. Confirm Web/PWA does not imply that Obsidian is required.
3. Confirm recoverable archive and irreversible deletion use distinct wording.
4. Confirm product copy describes fact-ready data rather than built-in AI functionality.
5. Document intentionally retained legacy identifiers.
