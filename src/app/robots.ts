import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/ownly/',
      disallow: '/ownly/app/',
    },
    sitemap: 'https://liuh886.github.io/ownly/sitemap.xml',
  };
}
