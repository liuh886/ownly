import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://liuh886.github.io/ownly/',
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}
