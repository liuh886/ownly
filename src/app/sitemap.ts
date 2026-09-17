import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_OWNLY_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return 'https://liuh886.github.io/ownly';
}

export default function sitemap(): MetadataRoute.Sitemap {
  // Marketing landing + privacy policy are indexable; /app, /trip and /c are private or noindex.
  return [
    {
      url: `${getSiteUrl()}/`,
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${getSiteUrl()}/privacy/`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
