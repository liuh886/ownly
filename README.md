# Ownly

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-blue?logo=obsidian)](https://obsidian.md/plugins?id=ownly)
[![Web App](https://img.shields.io/badge/Web-Open_Ownly-111827?logo=googlechrome&logoColor=white)](https://liuh886.github.io/ownly/)
[![PWA](https://img.shields.io/badge/PWA-Installable-0f766e?logo=pwa&logoColor=white)](https://liuh886.github.io/ownly/)
[![Status](https://img.shields.io/badge/status-stable_1.x-brightgreen.svg)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/F1F7WYJ6B)

> **Own less, Live more, Decide better.**

[中文文档](README.zh.md)

**Local-first ownership memory for humans and AI agents.**

Ownly helps you track what you own, what it costs, how you used it, and what you learned. Your data is stored as plain Markdown in a local folder — preferably inside an Obsidian Vault, but Obsidian itself is not required for the Web or PWA experience.

- **Agent-readable ownership memory** — Stable CLI read surface with structured JSON output, designed for AI agents to read and safely interact with your data.
- **Markdown-native personal data** — Every object, snapshot, and review is a `.md` file with YAML frontmatter. No proprietary formats, no lock-in.
- **Decision-first object lifecycle** — Seed, observe, decide, use, and review. Each object earns its place through structured reflection.
- **Human UI + Agent CLI** — Hosted Web app, installable PWA, and Obsidian workspace for people; CLI for automation, scripting, and agent integration.

![Ownly Homepage](docs/screenshot-homepage.jpg)

## Use Ownly Your Way

Ownly supports two human-facing runtimes and three convenient entry points:

| Entry point | Requires Obsidian? | Local server? | Best for |
|---|---:|---:|---|
| **GitHub Pages Web app** | No | No | Opening Ownly instantly in a supported desktop browser |
| **Installed PWA** | No | No | Running Ownly in its own app window with offline startup support |
| **Obsidian plugin** | Yes | No | Deep Vault integration and working directly inside Obsidian |

👉 **[Open Ownly on GitHub Pages](https://liuh886.github.io/ownly/)**

The Web app and PWA are the same local-first browser runtime. They can connect directly to a standalone local Ownly data folder, so you can use Ownly without installing Obsidian.

**Recommended storage:** keep the `Ownly/` data directory inside an Obsidian Vault even when you mainly use the Web app or PWA. This keeps the files readable and searchable in Obsidian, lets the Web/PWA and Obsidian plugin share the same dataset, and preserves a simple migration path if your preferred interface changes later.

## Built for AI Agents

Agents can read your local ownership data through stable CLI JSON commands. Every command follows a documented JSON contract — no UI scraping needed.

```bash
# Set your vault path
export OWNLY_VAULT=/path/to/vault

# Read commands designed for agents
npm run --silent wyqd -- object list --json
npm run --silent wyqd -- object get --id <id> --json
npm run --silent wyqd -- object history --id <id> --json
npm run --silent wyqd -- object review-needed --json
npm run --silent wyqd -- recurring list --active --json
npm run --silent wyqd -- summary --json
```

See [Agent CLI Contract](docs/AGENT_CLI_CONTRACT.md) for the full stable API reference, JSON shapes, and error codes. For agent workflow guidance, see [Agent CLI Guide](docs/AGENT_CLI_GUIDE.md).

## Project Status

Ownly `1.x` supports two human-facing runtimes: the Obsidian plugin for deep Vault integration and a hosted local-first Web runtime that can also be installed as a PWA. Current validation status is tracked in [docs/QUALITY_BASELINE.md](docs/QUALITY_BASELINE.md).

| Area | Status |
|---|---|
| Obsidian plugin | Integrated Vault runtime |
| Web runtime | Hosted local-first browser runtime on GitHub Pages |
| PWA | Installable Web runtime with offline application-shell startup |
| Agent CLI | Stable read surface with JSON contract |
| Data format | Plain Markdown + YAML frontmatter |
| Storage model | Local Obsidian Vault recommended; standalone local folder supported |

## Why Ownly?

Most tracking tools focus on **how much you spend**. Ownly focuses on **whether you should**.

- **Seed** a desire → **Observe** it over time → **Decide** to buy or pass → **Use** → **Review** after retirement
- Every object has a lifecycle. Every experience gets a review. The data informs your next decision.
- Your data lives as plain Markdown in a local folder — preferably your Obsidian Vault — so you can edit, version-control, or move files freely.

## Quick Start

### Option A — GitHub Pages Web app

Obsidian is not required.

1. Open **[Ownly Web](https://liuh886.github.io/ownly/)** in a current desktop Chrome or Microsoft Edge browser.
2. Select **Connect Vault**.
3. Choose either:
   - your Obsidian Vault root (**recommended**), or
   - a standalone local `Ownly` data folder.
4. Approve local folder access in the browser prompt.

The Web app is a static site hosted on GitHub Pages. Vault contents stay on your device and are not uploaded to GitHub Pages.

### Option B — Install Ownly as a PWA

The PWA also does not require Obsidian.

1. Open **[Ownly Web](https://liuh886.github.io/ownly/)** in a supported desktop browser.
2. Select **Install app** when it appears in the Ownly header, or use the browser's install command.
3. Launch Ownly from your operating-system app list, desktop, or taskbar.
4. Connect the same local data folder you use in the browser or Obsidian.

The installed PWA runs in a standalone window and caches the application shell for offline startup. Your Markdown data remains in the local folder you selected and is never copied into the PWA cache.

### Option C — Obsidian plugin

1. **Install** — Open Obsidian → Settings → Community plugins → Browse → search "Ownly" → Install & Enable.
2. **Open** — Click the Ownly icon in the left ribbon or run `Open Ownly workspace` from the command palette.
3. **Explore** — Demo data is auto-seeded on first connect with sample objects, snapshots, and reviews.

## Features

### Ownership Ledger

Track three object types with full lifecycle management:

| Type | Lifecycle |
|---|---|
| **Physical items** | Seeded → Observing → Purchased → Using → Idle → Transferred / Discarded |
| **Subscriptions** | Active → Paused → Cancelled |
| **Experiences** | Planned → In Progress → Completed → Reviewed |

- Quick entry templates and paste-line parsing for fast capture.
- Cost tracking: purchase price, billing amount, budget vs actual, daily cost, annualized cost.
- Payment account aggregation for fixed costs.

### Agent CLI Read Surface

- Stable JSON output for all read commands: `object list`, `object get`, `object search`, `object history`, `review-needed`, `recurring list`, `summary`.
- Type-specific fields exposed automatically: cost fields for physical items, billing fields for subscriptions, location data for travel experiences.
- Enriched agent fields: `has_review`, `needs_review`, `review_ref`, source file path.
- JSON error format with documented error codes (`NOT_FOUND`, `MISSING_OPTION`, `INVALID_INPUT`, `VAULT_NOT_FOUND`).
- See [Agent CLI Contract](docs/AGENT_CLI_CONTRACT.md) for the full specification.

### Review Memory

- Write exit records for physical items and reviews for experiences.
- Score food, scenery, and experience on a 1-10 scale.
- Rank and compare across categories.
- Reviews link back to objects via bidirectional `review_ref` / `target_id`.

### Local Markdown Data

- All data is stored as plain `.md` files under `Ownly/Objects`, `Ownly/Reviews`, and `Ownly/Snapshots`.
- Each file is self-contained YAML frontmatter + Markdown body.
- The `Ownly/` directory can live inside an Obsidian Vault or in a standalone local folder.
- No database, no required cloud account, no telemetry.

### Data Health

- **Doctor diagnostics** — Local quality checks: duplicate IDs, schema validation, negative costs, dangling references, review ref integrity.
- **Repair tool** — Preview and fix `review_ref` mismatches with file-level confirmations.
- **Archive & restore** — Soft-delete with full recovery.

### Supporting UI

- **Dashboard** — Ownership overview, cost pressure, quick entry, review actions, and data scale.
- **Travel Insights** — World map with visited countries, travel timeline, statistics.
- **Ranking boards** — Top experiences by food, scenery, and experience scores.
- **Bilingual UI** — English and Chinese, auto-detected.

## Installation

### Web App and PWA — simplest start

Use the hosted app without installing Obsidian, installing Ownly locally, or running a local server:

👉 **[Open Ownly Web](https://liuh886.github.io/ownly/)**

From the hosted app, use **Install app** to add Ownly as a PWA when your browser offers the installation prompt.

Direct local-folder access requires a desktop browser that supports the File System Access API. For browser support, PWA behavior, privacy boundaries, deployment details, and local development, see [Web Runtime](docs/WEB_RUNTIME.md).

### Obsidian Plugin — deepest Vault integration

Install from the Obsidian Community Plugins directory:

👉 **[Install Ownly](https://obsidian.md/plugins?id=ownly)**

The plugin is optional for Web/PWA users, but storing data inside an Obsidian Vault remains the recommended layout.

## Data Storage

Recommended layout:

```text
<My Obsidian Vault>/
  Ownly/
    Objects/         # Physical items, subscriptions, experiences
    Snapshots/       # Net worth snapshots
    Reviews/         # Exit records, experience reviews
    Archive/         # Soft-deleted items (recoverable)
```

Standalone layout, without Obsidian:

```text
<Local folder>/
  Objects/
  Snapshots/
  Reviews/
  Archive/
```

The Web app can connect to either the Obsidian Vault root or the standalone Ownly data root.

## Sponsorship

Ownly is free with generous limits (200 objects, 100 reviews). A free activation code shown in the app unlocks unlimited usage and Pro features. No paid license verification, no network calls for activation.

## Documentation

- [User Guide](docs/USER_GUIDE.md) — Core features and workflows.
- [Web Runtime](docs/WEB_RUNTIME.md) — GitHub Pages, PWA installation, browser support, privacy boundary, and deployment.
- [Agent CLI Contract](docs/AGENT_CLI_CONTRACT.md) — Stable JSON API for AI agents.
- [Agent CLI Guide](docs/AGENT_CLI_GUIDE.md) — Agent workflow patterns and write commands.
- [Data Model](docs/DATA_MODEL.md) — Markdown frontmatter schemas.
- [Troubleshooting](docs/TROUBLESHOOTING.md) — Doctor tool and data repair.
- [Release Checklist](docs/RELEASE_CHECKLIST.md) — Release process.
- [Obsidian Reviewer Checklist](docs/OBSIDIAN_REVIEWER_CHECKLIST.md) — Plugin submission checklist.

## Developer Quick Reference

```bash
npm run validate           # Full gate: tsc + lint + build + obsidian validation
npm run test               # Unit tests (vitest)
npm run wyqd -- --vault <path> object list --json
```

## License

MIT. See [LICENSE](LICENSE). All data stays local. No telemetry. No required cloud sync.