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

> **Ownly doesn't host your data. You choose where your files live.**

The Ownly data folder can live in a normal local directory or inside a local folder synchronized by a personal cloud provider you control. Obsidian is useful for inspecting the Markdown, but it is **not required** for the hosted Web app, installed PWA, Agent CLI, or local MCP server.

## Open Ownly

- **[Explore the product page](https://liuh886.github.io/ownly/)**
- **[See the embedded product preview](https://liuh886.github.io/ownly/#preview)**
- **[Open the Web app / PWA](https://liuh886.github.io/ownly/app/)**

| Entry point | Obsidian required? | Local process required? | Best for |
|---|---:|---:|---|
| GitHub Pages Web app | No | No | Immediate use in a supported desktop browser |
| Installed PWA | No | No | A standalone app window with offline application-shell startup |
| Obsidian plugin | Yes | No | Native Vault integration and direct Markdown work |
| Agent CLI | No | Yes | Deterministic scripting and validated local mutations |
| Local MCP | No | Yes | Read-only Ownly evidence for Codex, Claude Code and compatible agents |

The Web app and PWA are the same browser runtime. Installation changes the launch experience, not the data model. The product homepage itself is not a PWA surface.

## First use: choose where your data lives

When Ownly starts without an existing folder permission, choose a storage location and then create new data or open an existing Ownly data folder.

### On this device

Choose a normal local filesystem folder. Ownly reads and writes that folder directly. Nothing is synchronized unless you configure synchronization outside Ownly.

### In your personal cloud folder

Choose a local folder already synchronized by Dropbox, Google Drive, OneDrive, iCloud Drive, or another provider you control.

Ownly still works with normal local files. It does not use provider APIs, OAuth, provider credentials, an Ownly cloud mirror, or a separate remote filesystem. Your provider handles synchronization under its own privacy and security policies.

Keep the folder available offline when the provider supports online-only placeholders, and use **one sync provider per Ownly data folder** to reduce conflicting copies.

### Create new data

Select a parent location such as `Documents`, an Obsidian Vault root, a local personal-cloud folder, or an empty folder already named `Ownly`.

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

Select any supported filesystem location:

- an initialized Ownly data root containing `Objects/`;
- an empty or initialized folder named `Ownly`;
- an Obsidian Vault containing an `Ownly/` child folder;
- an Obsidian Vault using the plugin's configured Ownly data folder;
- any of the above inside a local folder synchronized by the user's own provider.

The browser asks for explicit read/write permission. Personal Markdown files are not uploaded to GitHub Pages and are not copied into the PWA service-worker cache. If the selected folder is synchronized by a third-party provider, that provider may upload and synchronize those files independently of Ownly.

The hosted Web/PWA runtime uses Google Analytics 4 measurement ID `G-KXXVS33FQ2` for product adoption and can also load Cloudflare Web Analytics for aggregate traffic and Web Vitals when `NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN` is configured at build time. Ownly custom analytics events never include Markdown contents, local file names, form values, object records, reviews, account snapshots, selected-folder data, local paths, inferred provider names, or MCP tool results. The Obsidian plugin, Agent CLI and MCP runtime do not load either web analytics provider.

## Recommended storage

Standalone local use:

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

Inside an Obsidian Vault:

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

Inside a personal cloud-synced local folder:

```text
<My Dropbox / Google Drive / OneDrive / iCloud Drive folder>/
  Ownly/
    Objects/
    Accounts/
    Snapshots/
    Reviews/
    Logs/
    Archive/
```

All three layouts use the same Ownly data model. The personal-cloud option does not introduce a second storage backend; the external provider synchronizes the normal filesystem folder.

## Product principles

- **User-controlled storage** — Ownly does not host your personal ledger. You choose where the filesystem folder lives.
- **Local by default** — no required cloud account, hosted database, provider OAuth, or mandatory synchronization.
- **Markdown native** — records remain portable and human-readable.
- **Decision led** — observe, acquire or pass, use, exit, and review.
- **Recoverable mutations** — archive and restore are distinct from permanent deletion.
- **One data model** — Web, PWA, Obsidian, CLI and MCP operate on the same schemas and directory structure.
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

The CLI data location may point to an Obsidian Vault or another filesystem location containing the Ownly data folder, including a user-controlled synchronized local folder.

## Agent / MCP

Ownly also exposes a **read-only local MCP server** for Codex, Claude Code and other MCP clients that can start a local STDIO process.

The MCP server is an adapter over the same validated Ownly data model. It does not create a second database, hosted mirror or embedded AI assistant.

The v0.1 tool surface covers:

- data summary and Doctor health checks;
- object search and bounded object facts;
- object history with reviews and append-only experience logs;
- active recurring costs;
- upcoming subscription renewals;
- recurring costs grouped by payment account with currencies kept separate;
- deterministic review-needed records.

The source-of-truth stays in the user-selected Ownly data folder. Facts returned by an MCP tool can enter the connected external agent's context, so Ownly does not claim that every selected fact remains on-device during an agent session.

The publish-ready MCP package lives in [`packages/mcp`](packages/mcp). See the [Ownly MCP Guide](docs/MCP.md) for Codex and Claude Code setup, privacy boundaries and example prompts.

## Current runtime status

| Area | Status |
|---|---|
| Product homepage | Static bilingual product explanation with an embedded interactive preview |
| Hosted Web app | Static GitHub Pages runtime with user-selected filesystem access |
| Installed PWA | App-route-only install surface, standalone launch and cached app shell |
| Obsidian plugin | Native Vault interface over the shared Ownly data model |
| Agent CLI | Stable, strict-typed fact-ready JSON contract |
| Local MCP | Read-only STDIO adapter over the canonical Ownly evidence store |
| Data storage | Plain Markdown + YAML frontmatter in a user-controlled filesystem folder |
| Mutation safety | Repository create/update/archive/restore contract protected by CI; MCP v0.1 has no mutation tools |

Current validation and known coverage gaps are documented in [Quality Baseline](docs/QUALITY_BASELINE.md).

## Browser support

Direct folder access uses the File System Access API.

- Recommended: current desktop Chrome or Microsoft Edge.
- Unsupported browsers can view the product page and embedded preview but cannot connect a real Ownly data folder.
- Mobile direct-folder access is not a production target.
- Browser permission may need to be renewed after restart or permission reset.
- A personal cloud folder must be exposed by its provider as a usable local filesystem folder; Ownly does not provide a remote-drive API fallback.

See [Web Runtime](docs/WEB_RUNTIME.md) for privacy boundaries, PWA behavior, and deployment details.

## Obsidian plugin

Install from Obsidian Community Plugins:

👉 **[Install Ownly](https://obsidian.md/plugins?id=ownly)**

The plugin is optional for Web/PWA users. Use the term **Obsidian Vault** only for a real Vault or the Obsidian runtime; the cross-runtime storage term is **Ownly data folder**.

## Data health

Ownly includes deterministic Doctor checks for issues such as:

- duplicate IDs;
- unsupported schema versions;
- invalid costs or dates;
- missing object/review references;
- stale snapshots;
- missing data directories.

These checks operate on Ownly facts and filesystem accessibility. Doctor does not inspect cloud-provider accounts or use AI.

## Documentation

- [User Guide](docs/USER_GUIDE.md)
- [Web Runtime](docs/WEB_RUNTIME.md)
- [Terminology Contract](docs/TERMINOLOGY.md)
- [Product Governance](docs/PRODUCT_GOVERNANCE.md)
- [Quality Baseline](docs/QUALITY_BASELINE.md)
- [Agent CLI Contract](docs/AGENT_CLI_CONTRACT.md)
- [Agent CLI Guide](docs/AGENT_CLI_GUIDE.md)
- [Agent / MCP Guide](docs/MCP.md)
- [Data Model](docs/DATA_MODEL.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Release Checklist](docs/RELEASE_CHECKLIST.md)

## Development

```bash
npm ci
npm run validate
npm run test
npm run test:e2e:data
npm run test:mcp
npm run wyqd -- --vault <path> object list --json
```

MCP package validation additionally runs only for MCP-specific changes:

```bash
npm install --prefix packages/mcp --ignore-scripts --no-audit --no-fund
npm run build --prefix packages/mcp
node packages/mcp/dist/index.js --help
npm pack --prefix packages/mcp --dry-run
```

## License

MIT. See [LICENSE](LICENSE). Ownly does not host personal ledger data. A user-selected filesystem-sync provider or external MCP client may process data under its own privacy and security policies. Hosted Web/PWA may use GA4 for limited product-adoption events and Cloudflare Web Analytics for aggregate traffic and Web Vitals; the Obsidian plugin, CLI and MCP runtime do not load either analytics provider.
