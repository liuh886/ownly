# WYQD

WYQD is an Obsidian-native, local-first decision ledger for possessions, subscriptions, and experiences.

**Own less, Live more, Decide better.**

It currently ships as:

- a Web App for browser/PM2 use
- a private Obsidian plugin alpha for Vault-native use

The product direction is Obsidian plugin first, while the Web App remains supported as a compatible browser runtime and development surface.

## Version

Current target: `0.2.0`

`0.2.0` is an alpha baseline for dual runtime support. It should not be described as a mature product yet.

License: MIT.

## Web App

Development:

```bash
npm run dev
```

Production static build:

```bash
npm run build
```

The production export is written to `out/` and can be served by the existing PM2 static server flow.

## Obsidian Plugin

Build the private plugin package:

```bash
npm run build:obsidian
```

Create an installable private plugin folder:

```bash
npm run package:obsidian
```

Generated plugin files:

- `manifest.json`
- `versions.json`
- `main.js`
- `styles.css`

Packaged output:

```text
dist/obsidian/wyqd/
  manifest.json
  versions.json
  main.js
  styles.css
```

Install manually into a test Vault:

```text
.obsidian/plugins/wyqd/
  manifest.json
  versions.json
  main.js
  styles.css
```

Then enable `WYQD` from Obsidian community plugins.

### Real Vault Installation

1. Build and package the plugin:

```bash
npm run package:obsidian
```

2. Copy the packaged plugin folder into a Vault:

```bash
mkdir -p /path/to/vault/.obsidian/plugins
cp -R dist/obsidian/wyqd /path/to/vault/.obsidian/plugins/wyqd
```

For the normal Ductor Vault mount, replace `/path/to/vault` with `/mnt/zhihaol`.

3. In Obsidian, open `Settings -> Community plugins`, turn off Restricted mode if needed, then enable `WYQD`.

4. Open WYQD from the ribbon icon or the command palette command `Open WYQD workspace`.

## Validation

Run the full validation gate:

```bash
npm run validate
```

Run the agent-friendly CLI against a Vault:

```bash
npm run wyqd -- --vault /path/to/vault object list
```

## Sample Vault

A repeatable demo fixture is available at:

```text
samples/wyqd-vault/
```

Use it as a disposable Vault fixture for Web and Obsidian plugin QA.

Run only the Obsidian plugin validation gate:

```bash
npm run validate:obsidian
```

The Obsidian validation gate checks:

- TypeScript plugin compilation
- plugin bundle generation
- non-empty release files
- `package.json` / `manifest.json` / `versions.json` version consistency

## Current Plugin Capability

The Obsidian plugin currently supports:

- WYQD Workspace view
- Ribbon entry
- command palette entries
- Settings tab
- Vault Markdown Repository for `Objects`, `Accounts`, `Snapshots`, `Reviews`, and `Archive/*`
- object console summary
- object detail preview
- open source Markdown
- save minimal object fields
- advance object status with confirmation
- archive and restore objects
- local Free / Pro Annual / Lifetime Early Supporter license-state alpha
- WYQD Doctor diagnostic summary
- Obsidian theme-aware styling and Web dark mode via system color preference

## Stability Boundary

Not yet completely stabilized / Work in Progress:

- Cloud sync features outside of Vault native sync
- Real Lemon Squeezy license validation (currently local alpha key evaluation)
- Obsidian screenshot-level QA across custom themes
- Public Obsidian community plugin submission

Free users must always retain access to their Markdown data. WYQD must not lock, encrypt, delete, or block export because of license state.
