# Ownly Web Runtime

Ownly Web is a static, local-first browser application. The hosted page serves only the interface code; Vault data is read and written directly by the browser after the user explicitly grants access to a local folder.

## Hosted app

The production URL is:

- `https://liuh886.github.io/ownly/`

No local web server is required.

## Install as an app

Ownly Web is a Progressive Web App (PWA).

1. Open the hosted app in a current desktop Chrome or Microsoft Edge browser.
2. Select **Install app** when the button is offered in the Ownly header, or use the browser's install command.
3. Launch Ownly from the operating-system app list, desktop, or taskbar.

The installed app uses a standalone window and caches the application shell for offline startup. Vault files are never copied into the service-worker cache; they remain in the user-selected local folder and continue to be accessed through browser-granted File System Access permissions.

An offline launch can open the Ownly interface and previously cached frontend assets. The browser may still require renewed folder permission before the local Vault can be read or edited.

## Connect a Vault

1. Open Ownly Web in a supported desktop browser.
2. Select **Connect Vault**.
3. Choose either the Obsidian Vault root or the `Ownly` data folder.
4. Approve local folder access in the browser prompt.

Ownly detects the supported layouts below:

```text
<Vault>/Ownly/Objects
<Vault>/Ownly/Reviews
<Vault>/Ownly/Snapshots
```

or a directly selected Ownly data root:

```text
<Ownly data root>/Objects
<Ownly data root>/Reviews
<Ownly data root>/Snapshots
```

The selected directory handle is stored in browser IndexedDB. The browser may still require the user to approve access again after a restart or permission reset.

## Browser support

Direct folder access depends on the File System Access API.

- Recommended: current desktop Chrome or Microsoft Edge.
- Unsupported browsers remain in demo mode and cannot connect a local Vault.
- Mobile browser support is not a production target for direct Vault access.
- Install availability is controlled by the browser. The in-app installation button appears only when the browser emits an install prompt.

## Privacy and security boundary

- Vault files stay on the user's device.
- The GitHub Pages host does not receive or store Vault contents.
- Ownly does not require a backend API for local folder access.
- Access is limited to the directory selected by the user and the permission granted by the browser.
- The service worker caches only same-origin application resources; it does not cache Vault files.
- The hosted Web runtime should not add analytics or third-party scripts that can inspect application state without an explicit privacy review.

Because browser permissions are scoped to the site origin, moving from localhost to GitHub Pages or from GitHub Pages to a custom domain requires the user to connect the Vault again.

## Local development

```bash
npm ci
npm run dev
```

Local development continues to use the root path and does not register the production service worker. GitHub Pages builds set:

```text
OWNLY_BASE_PATH=/ownly
```

The Next.js static export and PWA package are validated with:

```bash
npm run validate:pages
```

## Deployment

`.github/workflows/pages.yml` performs the following on pull requests and pushes to `main`:

1. Install dependencies.
2. Run the full project validation gate.
3. Validate the static export, `/ownly` asset prefix, manifest, icons, and service worker.
4. Upload the `out/` directory as a Pages artifact.
5. Deploy only for non-pull-request runs.

Repository Settings → Pages must use **GitHub Actions** as the publishing source.
