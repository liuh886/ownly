import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('out');
const configuredBasePath = process.env.OWNLY_BASE_PATH?.trim() ?? '';
const basePath =
  configuredBasePath === '' || configuredBasePath === '/'
    ? ''
    : `/${configuredBasePath.replace(/^\/+|\/+$/g, '')}`;

function assert(condition, message) {
  if (!condition) throw new Error(`[pwa validation] ${message}`);
}

function read(relativePath) {
  const absolutePath = path.join(outDir, relativePath);
  assert(fs.existsSync(absolutePath), `Missing ${relativePath}`);
  return fs.readFileSync(absolutePath, 'utf8');
}

function listFiles(directory) {
  return fs.readdirSync(directory).flatMap((entry) => {
    const absolutePath = path.join(directory, entry);
    return fs.statSync(absolutePath).isDirectory()
      ? listFiles(absolutePath)
      : [absolutePath];
  });
}

const landingHtml = read('index.html');
const appHtml = read('app/index.html');
const serviceWorker = read('sw.js');
const manifestText = read('app/manifest.webmanifest');
const manifest = JSON.parse(manifestText);
const staticDir = path.join(outDir, '_next', 'static');
assert(fs.existsSync(staticDir), 'Missing _next/static client assets');
const clientBundle = listFiles(staticDir)
  .filter((filePath) => filePath.endsWith('.js'))
  .map((filePath) => fs.readFileSync(filePath, 'utf8'))
  .join('\n');

const brandMark = read('icons/ownly-mark.svg');
const installIcons = [
  read('icons/ownly-192.svg'),
  read('icons/ownly-512.svg'),
  read('icons/ownly-maskable.svg'),
];
const brandCss = fs.readFileSync(path.resolve('src/app/brand.css'), 'utf8');
const canonicalArc = 'M50.5 32A18.5 18.5 0 1 1 35.213 13.782';

const expectedRoot = `${basePath}/`;
const expectedApp = `${basePath}/app/`;
const expectedManifestUrl = `${basePath}/app/manifest.webmanifest`;
const expectedBrandMarkUrl = `${basePath}/icons/ownly-mark.svg`;

assert(
  !landingHtml.includes('manifest.webmanifest'),
  'the marketing homepage must not expose a PWA manifest',
);
assert(
  appHtml.includes(expectedManifestUrl),
  `app page does not reference ${expectedManifestUrl}`,
);
assert(
  landingHtml.includes(expectedApp),
  `landing page does not link to ${expectedApp}`,
);
assert(
  landingHtml.includes(expectedBrandMarkUrl) && appHtml.includes(expectedBrandMarkUrl),
  'the marketing page and application must share the canonical favicon mark',
);
assert(manifest.start_url === './', 'start_url must resolve relative to the app manifest');
assert(manifest.scope === './', 'scope must remain inside the app route');
assert(manifest.id === './', 'id must resolve to the app route');
assert(manifest.display === 'standalone', 'display must be standalone');
assert(typeof manifest.name === 'string' && manifest.name.length > 0, 'name is required');
assert(typeof manifest.short_name === 'string' && manifest.short_name.length > 0, 'short_name is required');
assert(Array.isArray(manifest.icons) && manifest.icons.length >= 3, 'at least three icons are required');
assert(
  manifest.icons.some((icon) => icon.sizes === '192x192'),
  'a 192x192 install icon is required',
);
assert(
  manifest.icons.some((icon) => icon.sizes === '512x512'),
  'a 512x512 install icon is required',
);
assert(
  manifest.icons.some((icon) => String(icon.purpose).includes('maskable')),
  'a maskable icon is required',
);
assert(
  manifest.icons.every((icon) => String(icon.src).startsWith('../icons/')),
  'all icon URLs must resolve from the app manifest to the shared icon directory',
);

assert(
  brandMark.includes(canonicalArc) && brandMark.includes('#10b981'),
  'the canonical Ownly mark must retain the open ring and decision node',
);
assert(
  installIcons.every((icon) => icon.includes(canonicalArc) && icon.includes('#10b981')),
  'all install icons must derive from the canonical Ownly mark',
);
for (const selector of [
  'a[aria-label="Ownly home"]',
  '#preview aside',
  'aside.fixed.bottom-24',
  '.wyqd-web-shell header',
  'main.grid.min-h-screen',
]) {
  assert(brandCss.includes(selector), `brand treatment is missing the ${selector} surface`);
}

assert(
  serviceWorker.includes("self.addEventListener('install'") &&
    serviceWorker.includes("self.addEventListener('fetch'") &&
    serviceWorker.includes('caches.open'),
  'service worker must install an application cache and handle fetches',
);
assert(
  serviceWorker.includes("const appUrl = `${siteBase}/app/`"),
  'service worker must derive and cache the application route',
);
assert(
  serviceWorker.includes("const manifestUrl = `${siteBase}/app/manifest.webmanifest`"),
  'service worker must cache the app-scoped manifest',
);
assert(
  !serviceWorker.includes('cachePageAndAssets(cache, rootUrl)'),
  'service worker must not cache the marketing homepage',
);
assert(
  clientBundle.includes('Install Ownly as a standalone app') ||
    clientBundle.includes('ownly_pwa_install_nudge_dismissed'),
  'the app client bundle must include the first-use PWA install invitation',
);

console.log(`[pwa validation] unified Ownly mark is active; marketing root stays non-PWA at ${expectedRoot}; installed app is scoped to ${expectedApp}`);
