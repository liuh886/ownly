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
