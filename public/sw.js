const CACHE_NAME = 'ownly-pwa-v4';
const scriptUrl = new URL(self.location.href);
const siteBase = scriptUrl.pathname.replace(/\/sw\.js$/, '');
const appUrl = `${siteBase}/app/`;
const manifestUrl = `${siteBase}/app/manifest.webmanifest`;

const coreAssets = [
  appUrl,
  manifestUrl,
  `${siteBase}/icons/ownly-192.svg`,
  `${siteBase}/icons/ownly-512.svg`,
  `${siteBase}/icons/ownly-maskable.svg`,
];

function isCacheableNextAsset(pathname) {
  return pathname.includes('/_next/static/') && (pathname.endsWith('.js') || pathname.endsWith('.css'));
}

async function cachePageAndAssets(cache, pageUrl) {
  const response = await fetch(pageUrl, { cache: 'reload' });
  if (!response.ok) return;

  const html = await response.clone().text();
  await cache.put(pageUrl, response);

  // Whitelist only versioned Next static assets + icons to avoid unbounded precache.
  const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter(Boolean)
    .map((value) => new URL(value, self.location.origin))
    .filter((url) => url.origin === self.location.origin && url.pathname.startsWith(`${siteBase}/`))
    .filter((url) => isCacheableNextAsset(url.pathname) || url.pathname.startsWith(`${siteBase}/icons/`));

  await Promise.allSettled(
    assetUrls.map(async (url) => {
      const assetResponse = await fetch(url, { cache: 'reload' });
      if (assetResponse.ok) await cache.put(url, assetResponse);
    }),
  );
}

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);

  await Promise.allSettled(
    coreAssets.map(async (asset) => {
      const response = await fetch(asset, { cache: 'reload' });
      if (response.ok) await cache.put(asset, response);
    }),
  );

  try {
    await cachePageAndAssets(cache, appUrl);
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
      // Faster navigations on supporting browsers.
      (async () => {
        try {
          if ('navigationPreload' in self.registration) {
            await self.registration.navigationPreload.enable();
          }
        } catch {
          // ignore — preload is best-effort
        }
      })(),
    ]),
  );
});

async function networkFirst(request, event) {
  const cache = await caches.open(CACHE_NAME);
  try {
    if (event && event.preloadResponse) {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) {
          if (preloaded.ok) await cache.put(request, preloaded.clone());
          return preloaded;
        }
      } catch {
        // fall through to network
      }
    }
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match(appUrl)) || Response.error();
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

  if (request.mode === 'navigate') {
    if (!url.pathname.startsWith(appUrl)) return;
    event.respondWith(networkFirst(request, event));
    return;
  }

  if (!url.pathname.startsWith(`${siteBase}/`)) return;

  const isStaticAsset =
    url.pathname.includes('/_next/static/') ||
    url.pathname.startsWith(`${siteBase}/icons/`) ||
    url.pathname === manifestUrl;

  event.respondWith(isStaticAsset ? cacheFirst(request) : staleWhileRevalidate(request));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
