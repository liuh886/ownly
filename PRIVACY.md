# Ownly Privacy Policy

Ownly is designed as a local-first personal ledger with user-controlled storage.

## Data Storage

Ownly stores user data as plain Markdown in an **Ownly data folder** selected by the user. The canonical structure includes:

- `Ownly/Objects`
- `Ownly/Accounts`
- `Ownly/Snapshots`
- `Ownly/Reviews`
- `Ownly/Logs`
- `Ownly/Archive`

Ownly does not host the user's personal ledger data and does not require an Ownly cloud database, hosted account, or Ownly-managed sync service.

The selected filesystem location may be:

- a normal local folder on the current device; or
- a local folder synchronized by a provider the user already controls, such as Dropbox, Google Drive, OneDrive, iCloud Drive, or another filesystem-sync service.

If the user chooses a synchronized folder, that provider may upload and synchronize the files under its own privacy, security, retention, and account policies. Ownly does not authenticate to those providers, store their credentials, or operate their synchronization.

## Local File Permission

When used in a browser, Ownly may request folder access through the File System Access API. This permission is used only to read and write the Ownly Markdown files in the selected folder.

A personal cloud folder is still accessed by Ownly as a normal local filesystem folder. Ownly does not use Dropbox, Google Drive, OneDrive, or iCloud APIs for this capability.

## Network

The core app does not need to send personal ledger data to an Ownly server. The hosted Web/PWA may load documented aggregate analytics, but Ownly custom analytics events must not contain Markdown contents, filenames, local paths, amounts, form values, object records, reviews, account snapshots, selected-folder metadata, or MCP tool results.

If the selected Ownly data folder is synchronized by a third-party storage provider, network transfer performed by that provider is outside Ownly's runtime and is governed by that provider.

## Agent CLI and MCP

The Agent CLI and local MCP server operate on the same user-selected Ownly data folder.

The MCP source-of-truth remains in the selected folder. Facts explicitly returned through an MCP tool can enter the connected external agent or model provider's context, according to that provider's own data-handling policy. Ownly therefore does not claim that every fact remains on-device during an active agent session.

## User Control

Users retain direct access to all raw Markdown files through the filesystem and, when they choose, through Obsidian or their own filesystem-sync provider.

Ownly's storage principle is:

> **Ownly doesn't host your data. You choose where your files live.**

## Extension Appendix (Ownly Capture)

Ownly Capture is a Chromium MV3 side panel for collecting the user's own travel research. English is the store default; switching language in-panel never changes the data model.

- **Local queue (`ownlyCaptureStateV3` in `chrome.storage.local`)**: Capture keeps a pending handoff queue only — `collections`, `places`, `active_collection_id`, and `settings` (currency override, preferences). It does not store trips, schedules, budgets, members, or history. Only the MV3 background service worker writes the queue; the side panel, content scripts, and website bridge send message commands to the worker. After Planner writes pending places to Markdown it acknowledges those IDs and Capture removes only the imported ones.
- **Google Maps enrichment**: when the user triggers one-click strengthen, the extension resolves the captured place against Google Maps to fill canonical facts (Place ID, coordinates, rating, hours, address). This fetches public place facts; it does not upload the user's ledger.
- **Reference FX (`open.er-api.com`)**: selection FX and trip display convert mixed-currency prices for display only using built-in USD-pivot reference rates (optionally refreshed from `open.er-api.com`). Raw captured price text is never rewritten, and personal ledger data is not sent with the rate request.
- **No sale, deletion on demand**: Ownly does not sell personal data. Removing the extension's queue happens by deleting candidates/collections in-panel, clearing `chrome.storage.local` for the extension, or uninstalling the extension. Planner Markdown remains in the user's Ownly data folder until the user archives or permanently deletes it there.
