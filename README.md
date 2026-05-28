# Ownly

Ownly is an Obsidian-native, local-first decision ledger for possessions, subscriptions, and experiences.

**Own less, Live more, Decide better.**

It currently ships as:

- a Web App for browser/PM2 use
- a private Obsidian plugin alpha for Vault-native use

The product direction is Obsidian plugin first, while the Web App remains supported as a compatible browser runtime and development surface.

## Version

Current target: `0.2.4`

`0.2.4` is an alpha refinement line for the native Obsidian workspace, shared Web-compatible runtime, premium visual polish, and the first Pro travel insight surface. It should not be described as a mature product yet.

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

Then enable `Ownly` from Obsidian community plugins.

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

3. In Obsidian, open `Settings -> Community plugins`, turn off Restricted mode if needed, then enable `Ownly`.

4. Open Ownly from the ribbon icon or the command palette command `Open Ownly workspace`.

The current Obsidian workspace runs as a native React-mounted `ItemView`.
It uses the shared Ownly workspace UI and the Obsidian Vault repository adapter,
so the plugin can read, write, archive, restore, and review Vault Markdown data
without requiring a local Web server or `localhost` iframe.

The Web App remains a compatible browser runtime and development surface. Both
runtime shells share the same core models, repository interface, Markdown schema,
and main workspace experience.

### Platform-Specific Dependency Reset

`esbuild` ships native binaries. If the same checkout is used from Docker/Linux and Windows, `node_modules` can contain the wrong platform binary.

If `npm run package:obsidian` reports that `@esbuild/linux-x64` is installed but `@esbuild/win32-x64` is needed, reset dependencies on the platform where you are building:

```bash
npm run deps:reset
npm run package:obsidian
```

Run the same reset again inside Docker/Linux before building there.

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

- Ownly Workspace view
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
- Ownly Doctor diagnostic summary
- Obsidian theme-aware styling and Web dark mode via system color preference

## Data Storage

Ownly stores all data as Markdown files in your Obsidian Vault under the `Ownly/` directory:

```text
Ownly/
  Objects/
  Accounts/
  Snapshots/
  Reviews/
  Archive/
    Objects/
    Accounts/
    Snapshots/
    Reviews/
```

Free users must always retain access to their Markdown data. Ownly must not lock, encrypt, delete, or block export because of license state.
