# WYQD Privacy Policy

WYQD is designed as a local-first personal ledger.

## Data Storage

WYQD stores user data in the Obsidian Vault selected by the user. Data is written as Markdown files under:

- `WYQD/Objects`
- `WYQD/Snapshots`
- `WYQD/Reviews`

The app does not require a hosted account, cloud database, or server-side sync.

## Local File Permission

When used in a browser, WYQD may request local folder access through the File System Access API. This permission is used only to read and write the WYQD Markdown files in the selected Vault.

## Network

The core app does not need to send personal ledger data to a remote server. If the app is later packaged for mobile stores, any added platform services must be documented before release.

## Agent CLI

The Agent CLI reads and writes the same local Vault Markdown files. Agents should use the project CLI protocol in `AGENTS.md` and `docs/AGENT_CLI_GUIDE.md`.

## User Control

Users retain direct access to all raw Markdown files through Obsidian or the filesystem.
