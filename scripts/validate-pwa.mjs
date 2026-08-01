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

const indexHtml = read('index.html');
const serviceWorker = read('sw.js');
const manifestText = read('manifest.webmanifest');
const manifest = JSON.parse(manifestText);

for (const icon of ['icons/ownly-192.svg', 'icons/ownly-512.svg', 'icons/ownly-maskable.svg']) {
  read(icon);
}

const expectedRoot = `${basePath}/`;
const expectedManifestUrl = `${basePath}/manifest.webmanifest`;

assert(
  indexHtml.includes(expectedManifestUrl),
  `index.html does not reference ${expectedManifestUrl}`,
);
assert(manifest.start_url === expectedRoot, `start_url must be ${expectedRoot}`);
assert(manifest.scope === expectedRoot, `scope must be ${expectedRoot}`);
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
  manifest.icons.every((icon) => String(icon.src).startsWith(`${basePath}/icons/`)),
  `all icon URLs must use the ${basePath || '/'} deployment root`,
);

assert(
  serviceWorker.includes("self.addEventListener('install'") &&
    serviceWorker.includes("self.addEventListener('fetch'") &&
    serviceWorker.includes('caches.open'),
  'service worker must install an application cache and handle fetches',
);

console.log(`[pwa validation] Ownly is installable and offline-ready at ${expectedRoot}`);
