const CACHE_NAME = 'ownly-pwa-v1';
const scopeUrl = new URL(self.registration.scope);
const basePath = scopeUrl.pathname.replace(/\/$/, '');
const rootUrl = `${basePath}/`;

const coreAssets = [
  rootUrl,
  `${basePath}/manifest.webmanifest`,
  `${basePath}/icons/ownly-192.svg`,
  `${basePath}/icons/ownly-512.svg`,
  `${basePath}/icons/ownly-maskable.svg`,
];

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);

  await Promise.allSettled(
    coreAssets.map(async (asset) => {
      const response = await fetch(asset, { cache: 'reload' });
      if (response.ok) await cache.put(asset, response);
    }),
  );

  try {
    const response = await fetch(rootUrl, { cache: 'reload' });
    if (!response.ok) return;

    const html = await response.clone().text();
    await cache.put(rootUrl, response);

    const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter(Boolean)
      .map((value) => new URL(value, self.location.origin))
      .filter(
        (url) =>
          url.origin === self.location.origin &&
          (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`)),
      );

    await Promise.allSettled(
      assetUrls.map(async (url) => {
        const assetResponse = await fetch(url, { cache: 'reload' });
        if (assetResponse.ok) await cache.put(url, assetResponse);
      }),
    );
  } catch (error) {
    console.warn('[Ownly PWA] App-shell precache was incomplete.', error);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
      self.clients.claim(),
    ]),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match(rootUrl)) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  const isStaticAsset =
    url.pathname.includes('/_next/static/') ||
    url.pathname.startsWith(`${basePath}/icons/`) ||
    url.pathname.endsWith('/manifest.webmanifest');

  event.respondWith(isStaticAsset ? cacheFirst(request) : staleWhileRevalidate(request));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
