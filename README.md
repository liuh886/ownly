# Ownly

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-blue?logo=obsidian)](https://obsidian.md/plugins?id=ownly)
[![Web App](https://img.shields.io/badge/Web-Open_Ownly-111827?logo=googlechrome&logoColor=white)](https://liuh886.github.io/ownly/app/)
[![PWA](https://img.shields.io/badge/PWA-Installable-0f766e?logo=pwa&logoColor=white)](https://liuh886.github.io/ownly/app/)
[![Status](https://img.shields.io/badge/status-stable_1.x-brightgreen.svg)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/F1F7WYJ6B)

> **Own less, Live more, Decide better.**

[中文文档](README.zh.md)

**A local-first ownership memory and decision ledger.**

Ownly helps you record what you own, what it costs, how you used it, and what you learned. Personal data stays in an **Ownly data folder** as plain Markdown with YAML frontmatter.

Obsidian is recommended as a convenient place to store and inspect the files, but it is **not required** for the hosted Web app or installed PWA.

## Open Ownly

- **[Explore the product page](https://liuh886.github.io/ownly/)**
- **[See the embedded product preview](https://liuh886.github.io/ownly/#preview)**
- **[Open the Web app / PWA](https://liuh886.github.io/ownly/app/)**

| Entry point | Obsidian required? | Local server required? | Best for |
|---|---:|---:|---|
| GitHub Pages Web app | No | No | Immediate use in a supported desktop browser |
| Installed PWA | No | No | A standalone app window with offline application-shell startup |
| Obsidian plugin | Yes | No | Native Vault integration and direct Markdown work |

The Web app and PWA are the same browser runtime. Installation changes the launch experience, not the data model. The product homepage itself is not a PWA surface.

## First use: create or open local data

When Ownly starts without an existing folder permission, choose one of two paths:

### Create new local data

Select a parent location such as `Documents`, an Obsidian Vault root, or an empty folder already named `Ownly`.

Ownly initializes:

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

If the selected folder is already named `Ownly`, Ownly uses it directly and does not create `Ownly/Ownly`.

### Open existing data

Select any supported location:

- an initialized Ownly data root containing `Objects/`;
- an empty or initialized folder named `Ownly`;
- an Obsidian Vault containing an `Ownly/` child folder;
- an Obsidian Vault using the plugin's configured Ownly data folder.

The browser asks for explicit local read/write permission. Personal Markdown files are not uploaded to GitHub Pages and are not copied into the PWA service-worker cache.

The hosted Web/PWA runtime uses Google Analytics measurement ID `G-KXXVS33FQ2` for aggregate site-traffic measurement. Ownly does not send Markdown contents, local file names, form values, object records, or selected-folder data as custom analytics events. The Obsidian plugin and Agent CLI do not load Google Analytics.

## Recommended storage

Recommended layout:

```text
<My Obsidian Vault>/
  Ownly/
    Objects/
    Accounts/
    Snapshots/
    Reviews/
    Logs/
    Archive/
```

Standalone use without Obsidian is also supported:

```text
<My local folder>/
  Ownly/
    Objects/
    Accounts/
    Snapshots/
    Reviews/
    Logs/
    Archive/
```

Keeping `Ownly/` inside an Obsidian Vault makes the Markdown easy to read, search, edit, version, and reuse across the Web/PWA, Obsidian plugin, and Agent CLI.

## Product principles

- **Local first** — no required cloud account, hosted database, or mandatory synchronization. Hosted Web/PWA uses aggregate traffic analytics; local Ownly records remain local.
- **Markdown native** — records remain portable and human-readable.
- **Decision led** — observe, acquire or pass, use, exit, and review.
- **Recoverable mutations** — archive and restore are distinct from permanent deletion.
- **One data model** — Web, PWA, Obsidian, and CLI operate on the same schemas and directory structure.
- **Fact ready** — scripts and external AI agents can consume deterministic data contracts; Ownly itself is not an AI assistant.

## What Ownly tracks

| Record | Purpose |
|---|---|
| Physical item | Purchase, use, cost, condition, retirement, transfer, or discard lifecycle |
| Recurring cost | Subscription or other repeating obligation, billing cycle, status, and annualized cost |
| One-time experience | Plan, budget, actual cost, location, completion, and review |
| Snapshot | Point-in-time net-worth and account-balance facts |
| Review | Structured post-use, post-exit, monthly, or annual reflection |
| Object experience log | Append-only usage, issue, maintenance, regret, lesson, comparison, or exit event |

## Fact-ready Agent CLI

Ownly exposes deterministic JSON read/write commands for scripts and external agents. It does not include model APIs, embeddings, AI chat, or generated recommendations.

```bash
export OWNLY_VAULT=/path/to/location-containing-Ownly

npm run --silent wyqd -- object list --json
npm run --silent wyqd -- object get --id <id> --json
npm run --silent wyqd -- object history --id <id> --json
npm run --silent wyqd -- object review-needed --json
npm run --silent wyqd -- recurring list --active --json
npm run --silent wyqd -- summary --json
```

See:

- [Agent CLI Contract](docs/AGENT_CLI_CONTRACT.md)
- [Agent CLI Guide](docs/AGENT_CLI_GUIDE.md)
- [Data Model](docs/DATA_MODEL.md)

`OWNLY_VAULT` is retained as a legacy-compatible environment-variable name. It may point to an Obsidian Vault or another local location containing the Ownly data folder.

## Current runtime status

| Area | Status |
|---|---|
| Product homepage | Static bilingual product explanation with an embedded interactive preview |
| Hosted Web app | Static GitHub Pages runtime with local-folder access |
| Installed PWA | App-route-only install surface, standalone launch and cached app shell |
| Obsidian plugin | Native Vault interface over the shared Ownly data model |
| Agent CLI | Stable, strict-typed fact-ready JSON contract |
| Data storage | Plain local Markdown + YAML frontmatter |
| Mutation safety | Repository create/update/archive/restore contract protected by CI |

Current validation and known coverage gaps are documented in [Quality Baseline](docs/QUALITY_BASELINE.md).

## Browser support

Direct local-folder access uses the File System Access API.

- Recommended: current desktop Chrome or Microsoft Edge.
- Unsupported browsers can view the product page and embedded preview but cannot connect local data.
- Mobile direct-folder access is not a production target.
- Browser permission may need to be renewed after restart or permission reset.

See [Web Runtime](docs/WEB_RUNTIME.md) for privacy boundaries, PWA behavior, and deployment details.

## Obsidian plugin

Install from Obsidian Community Plugins:

👉 **[Install Ownly](https://obsidian.md/plugins?id=ownly)**

The plugin is optional for Web/PWA users. Use the term **Obsidian Vault** only for a real Vault or the Obsidian runtime; the cross-runtime storage term is **Ownly data folder**.

## Data health

Ownly includes deterministic Doctor checks for issues such as:

- duplicate entity IDs;
- unsupported schema versions;
- invalid costs or dates;
- missing object/review references;
- stale snapshots;
- missing data directories.

These checks operate on local facts and do not use AI.

## Documentation

- [User Guide](docs/USER_GUIDE.md)
- [Web Runtime](docs/WEB_RUNTIME.md)
- [Terminology Contract](docs/TERMINOLOGY.md)
- [Quality Baseline](docs/QUALITY_BASELINE.md)
- [Agent CLI Contract](docs/AGENT_CLI_CONTRACT.md)
- [Agent CLI Guide](docs/AGENT_CLI_GUIDE.md)
- [Data Model](docs/DATA_MODEL.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Release Checklist](docs/RELEASE_CHECKLIST.md)

## Development

```bash
npm ci
npm run validate
npm run test
npm run test:e2e:data
npm run wyqd -- --vault <path> object list --json
```

## License

MIT. See [LICENSE](LICENSE). Personal Ownly records stay local. Hosted Web/PWA uses Google Analytics for aggregate site traffic; the Obsidian plugin and CLI do not.
