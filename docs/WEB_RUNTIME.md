# Ownly Web Runtime

Ownly Web is a static, local-first browser application. The hosted page serves only the interface code; personal data is read and written directly by the browser after the user explicitly grants access to a local folder.

## Hosted app

The production URL is:

- `https://liuh886.github.io/ownly/`

No local web server or Obsidian installation is required.

## Install as an app

Ownly Web is a Progressive Web App (PWA).

1. Open the hosted app in a current desktop Chrome or Microsoft Edge browser.
2. Select **Install app** when the button is offered in the Ownly header, or use the browser's install command.
3. Launch Ownly from the operating-system app list, desktop, or taskbar.

The installed app uses a standalone window and caches the application shell for offline startup. Personal Markdown files are never copied into the service-worker cache; they remain in the user-selected local folder and continue to be accessed through browser-granted File System Access permissions.

An offline launch can open the Ownly interface and previously cached frontend assets. The browser may still require renewed folder permission before local data can be read or edited.

## First use

When no previous local-folder permission is available, Ownly opens a first-use chooser with two paths.

### Create new local data

1. Select **Create new local data**.
2. Choose a parent directory such as `Documents`, an Obsidian Vault root, or an empty directory already named `Ownly`.
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

Obsidian is optional. Keeping this `Ownly/` directory inside an Obsidian Vault is still recommended because the Markdown remains directly readable and searchable in Obsidian, while the Web app, installed PWA, Obsidian plugin, and Agent CLI can share one dataset.

### Open existing data

Select **Open existing data**, then choose one of these locations:

- an initialized Ownly data root containing `Objects/`;
- an empty or initialized directory named `Ownly`;
- an Obsidian Vault root containing an `Ownly/` child directory;
- an Obsidian Vault using the Ownly plugin's configured data folder.

The selected directory handle is stored in browser IndexedDB. The browser may still require the user to approve access again after a restart or permission reset.

Users can choose **Continue in demo mode** and reopen the chooser later with **Create or open data** in the header or status banner.

## Browser support

Direct folder access depends on the File System Access API.

- Recommended: current desktop Chrome or Microsoft Edge.
- Unsupported browsers remain in demo mode and cannot connect local data.
- Mobile browser support is not a production target for direct local-folder access.
- Install availability is controlled by the browser. The in-app installation button appears only when the browser emits an install prompt.

## Privacy and security boundary

- Personal Markdown files stay on the user's device.
- The GitHub Pages host does not receive or store personal data.
- Ownly does not require a backend API for local folder access.
- Access is limited to the directory selected by the user and the permission granted by the browser.
- The service worker caches only same-origin application resources; it does not cache personal Markdown files.
- The hosted Web runtime should not add analytics or third-party scripts that can inspect application state without an explicit privacy review.

Because browser permissions are scoped to the site origin, moving from localhost to GitHub Pages or from GitHub Pages to a custom domain requires the user to connect the local data again.

## Local development

```bash
npm ci
npm run dev
```

Local development continues to use the root path and does not register the production service worker. GitHub Pages builds set:

```text
OWNLY_BASE_PATH=/ownly
```

The Next.js static export, PWA package, and standalone directory-layout behavior are validated with:

```bash
npm run validate:pages
```

## Deployment

`.github/workflows/pages.yml` performs the following on pull requests and pushes to `main`:

1. Install dependencies.
2. Run the full project validation gate.
3. Validate the static export, `/ownly` asset prefix, manifest, icons, service worker, and local-data layout behavior.
4. Upload the `out/` directory as a Pages artifact.
5. Deploy only for non-pull-request runs.

Repository Settings → Pages must use **GitHub Actions** as the publishing source.
