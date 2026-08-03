import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

function getBasePath(): string {
  const configured = process.env.OWNLY_BASE_PATH?.trim() ?? '';
  if (!configured || configured === '/') return '';
  return `/${configured.replace(/^\/+|\/+$/g, '')}`;
}

export default function manifest(): MetadataRoute.Manifest {
  const basePath = getBasePath();
  const siteRoot = `${basePath}/`;
  const appRoot = `${basePath}/app/`;

  return {
    id: appRoot,
    name: 'Ownly — Local-first ownership memory',
    short_name: 'Ownly',
    description:
      'Track possessions, subscriptions, experiences, and reviews in local Markdown files without uploading personal records.',
    start_url: appRoot,
    scope: siteRoot,
    display: 'standalone',
    background_color: '#fafaf9',
    theme_color: '#1c1917',
    orientation: 'any',
    categories: ['productivity', 'finance', 'utilities'],
    icons: [
      {
        src: `${basePath}/icons/ownly-192.svg`,
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: `${basePath}/icons/ownly-512.svg`,
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: `${basePath}/icons/ownly-maskable.svg`,
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
