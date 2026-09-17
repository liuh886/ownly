import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

function getBasePath(): string {
  const configured = process.env.OWNLY_BASE_PATH?.trim() ?? '';
  if (!configured || configured === '/') return '';
  return `/${configured.replace(/^\/+|\/+$/g, '')}`;
}

function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_OWNLY_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return 'https://liuh886.github.io/ownly';
}

export default function robots(): MetadataRoute.Robots {
  const basePath = getBasePath();
  const siteUrl = getSiteUrl();
  return {
    rules: {
      userAgent: '*',
      // Marketing landing is indexable; the local-first app shell is private.
      allow: `${basePath}/`,
      disallow: `${basePath}/app/`,
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
