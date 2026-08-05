import type { Metadata } from 'next';
import { MarketingHome } from '@/components/marketing/MarketingHome';

function getBasePath(): string {
  const configured = process.env.OWNLY_BASE_PATH?.trim() ?? '';
  if (!configured || configured === '/') return '';
  return `/${configured.replace(/^\/+|\/+$/g, '')}`;
}

const basePath = getBasePath();
const publicUrl = 'https://liuh886.github.io/ownly/';
const socialImage = 'https://liuh886.github.io/ownly/icons/ownly-512.svg';

export const metadata: Metadata = {
  title: 'Ownly — Know what deserves to stay',
  description:
    'A local-first ownership memory and decision ledger for possessions, subscriptions and important experiences, with usage and subscription costs beside real use and review.',
  alternates: {
    canonical: publicUrl,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'Ownly — Know what deserves to stay',
    description:
      'Remember what entered your life, understand usage and subscription costs, and review before the next purchase or renewal.',
    type: 'website',
    url: publicUrl,
    siteName: 'Ownly',
    images: [
      {
        url: socialImage,
        width: 512,
        height: 512,
        alt: 'Ownly',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Ownly — Know what deserves to stay',
    description:
      'A local-first ownership memory and decision ledger with portable Markdown data.',
    images: [socialImage],
  },
};

export default function Home() {
  return (
    <MarketingHome
      appHref={`${basePath}/app/`}
      githubHref="https://github.com/liuh886/ownly"
      obsidianHref="https://obsidian.md/plugins?id=ownly"
      brandMarkHref={`${basePath}/icons/ownly-mark.svg`}
    />
  );
}
