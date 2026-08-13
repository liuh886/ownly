# Ownly Web Runtime

Ownly Web is a static, local-first browser application with user-controlled storage. The hosted page serves the interface code; personal Ownly records are read and written directly by the browser after the user explicitly grants access to a filesystem folder.

That selected folder may be a normal local folder or a local folder synchronized by a personal cloud provider. Ownly itself does not host the user's ledger or operate a synchronization backend.

## Hosted app

The production URL is:

- `https://liuh886.github.io/ownly/`

No local web server or Obsidian installation is required.

## Install as an app

Ownly Web is a Progressive Web App (PWA).

1. Open the hosted app in a current desktop Chrome or Microsoft Edge browser.
2. Select **Install app** when the button is offered in the Ownly header, or use the browser's install command.
3. Launch Ownly from the operating-system app list, desktop, or taskbar.

The installed app uses a standalone window and caches the application shell for offline startup. Personal Markdown files are never copied into the service-worker cache; Ownly continues to access them through browser-granted File System Access permissions.

An offline launch can open the Ownly interface and previously cached frontend assets. The browser may still require renewed folder permission before Ownly data can be read or edited. If a personal cloud provider uses online-only placeholders, keep the Ownly data folder available offline so the browser has real filesystem access when Ownly needs it.

## First use

When no previous folder permission is available, Ownly asks where the user wants the Ownly data folder to live.

### Storage location

The onboarding exposes two user-facing storage intents:

- **On this device** — select a normal local filesystem folder.
- **In your personal cloud folder** — select a local folder already synchronized by Dropbox, Google Drive, OneDrive, iCloud Drive, or another provider.

These choices do not create separate runtime implementations. They converge on the same directory picker, repository, serializer, schemas, and Ownly data folder.

Ownly does not:

- call cloud-provider APIs for this capability;
- request provider OAuth access;
- store provider credentials;
- upload a second copy to an Ownly backend;
- merge provider sync conflicts.

For personal cloud folders, the provider handles synchronization under its own privacy and security policies. Use **one sync provider per Ownly data folder** to reduce conflicting copies.

### Create new data

1. Select **Create new data**.
2. Choose a parent directory in the selected storage location, such as `Documents`, an Obsidian Vault root, a local Dropbox/Drive folder, or an empty directory already named `Ownly`.
3. Ownly creates and initializes the required directory structure automatically.

If the selected directory is already named `Ownly`, Ownly uses it directly and does not create an `Ownly/Ownly` path. Otherwise, Ownly creates an `Ownly` child directory:

```text
<selected location>/
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

Obsidian is optional. Keeping the Ownly data folder inside an Obsidian Vault remains useful when the user wants the Markdown directly readable and searchable in Obsidian. An Obsidian Vault may itself live inside a personal cloud folder, subject to the same one-folder / one-sync-provider rule.

### Open existing data

Select **Open existing data**, then choose one of these locations:

- an initialized Ownly data root containing `Objects/`;
- an empty or initialized directory named `Ownly`;
- an Obsidian Vault root containing an `Ownly/` child directory;
- an Obsidian Vault using the Ownly plugin's configured data folder;
- any of the above inside a local folder synchronized by the user's own provider.

The selected directory handle is stored in browser IndexedDB. The browser may still require the user to approve access again after a restart or permission reset.

Users can choose **Continue in demo mode** and reopen the chooser later with **Choose data folder** in the header or status banner.

## Browser support

Direct folder access depends on the File System Access API.

- Recommended: current desktop Chrome or Microsoft Edge.
- Unsupported browsers remain in demo mode and cannot connect real Ownly data.
- Mobile browser support is not a production target for direct filesystem access.
- Install availability is controlled by the browser. The in-app installation button appears only when the browser emits an install prompt.
- Personal cloud folder support depends on the provider exposing the synchronized location as a usable local filesystem folder; Ownly does not provide a remote-drive API fallback.

## Privacy and security boundary

- Ownly reads and writes only the filesystem folder explicitly selected by the user and permitted by the browser.
- GitHub Pages does not receive or store the contents of the selected Ownly data folder.
- Ownly does not require a backend API, cloud account, or provider OAuth flow for folder access.
- The service worker caches only same-origin application resources; it does not cache personal Markdown files.
- If the selected folder is synchronized by a third-party provider, that provider may upload and synchronize the files under its own privacy, security, retention, and account policies.
- Ownly does not inspect provider account state or infer provider identity from local paths for analytics.
- Hosted Web/PWA loads Google Analytics 4 measurement ID `G-KXXVS33FQ2` for product adoption and can also load Cloudflare Web Analytics when `NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN` is configured for the production build.
- Ownly custom analytics events must not receive Markdown contents, local file names, form values, object records, reviews, account snapshots, selected-folder data, local paths, provider names inferred from paths, or MCP tool results.
- The Obsidian plugin, Agent CLI, and MCP runtime do not load either web analytics provider.

Adding any future custom event, advertising integration, session replay, user identifier, provider API integration, or application-state instrumentation requires a separate privacy review and corresponding documentation update.

Because browser permissions are scoped to the site origin, moving from localhost to GitHub Pages or from GitHub Pages to a custom domain requires the user to connect the data folder again.

## Data safety and synchronization guidance

Ownly's data-safety surface should report Ownly facts and filesystem capability, not cloud-provider account health.

It may explain:

- whether direct folder access is supported;
- current read/write permission;
- whether the selected Ownly data folder is readable and writable;
- Doctor/data-integrity status;
- backup status where available;
- that personal cloud folders should remain available offline;
- that simultaneous edits on several devices can create provider-level conflicting copies;
- the rule: **one Ownly data folder, one sync provider**.

Doctor remains deterministic and provider-agnostic. It does not call Dropbox, Google Drive, OneDrive, or iCloud APIs.

## Local development

```bash
npm ci
npm run dev
```

Local development continues to use the root path and does not register the production service worker. GitHub Pages builds set:

```text
OWNLY_BASE_PATH=/ownly
```

Cloudflare Web Analytics remains opt-in at build time:

```text
NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN=<public site token>
```

GA4 uses the fixed public measurement ID `G-KXXVS33FQ2`; no secret is required in the browser build.

The Next.js static export, PWA package, analytics boundary, manifest, icons, service worker, and directory-layout behavior are validated with:

```bash
npm run validate:pages
```

## Deployment

`.github/workflows/pages.yml` performs the following on pull requests and pushes to `main`:

1. Install dependencies.
2. Run the project validation gate scoped to affected runtimes.
3. Validate the static export, `/ownly` asset prefix, analytics boundary, manifest, icons, service worker, and filesystem-layout behavior.
4. Upload the `out/` directory as a Pages artifact when Web/PWA output is affected.
5. Deploy only for non-pull-request runs.

Repository Settings → Pages must use **GitHub Actions** as the publishing source.
