import type { Metadata } from 'next';
import { MarketingHome } from '@/components/marketing/MarketingHome';

function getBasePath(): string {
  const configured = process.env.OWNLY_BASE_PATH?.trim() ?? '';
  if (!configured || configured === '/') return '';
  return `/${configured.replace(/^\/+|\/+$/g, '')}`;
}

const basePath = getBasePath();

export const metadata: Metadata = {
  title: 'Ownly — Own less. Live more. Decide better.',
  description:
    'A local-first ownership memory and decision ledger for possessions, recurring costs and important experiences.',
  openGraph: {
    title: 'Ownly — Know what deserves to stay',
    description:
      'Record ownership facts as portable Markdown, understand real cost and review before the next decision.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Ownly — Know what deserves to stay',
    description:
      'A local-first ownership memory and decision ledger with portable Markdown data.',
  },
};

export default function Home() {
  return (
    <MarketingHome
      appHref={`${basePath}/app/`}
      githubHref="https://github.com/liuh886/ownly"
      obsidianHref="https://obsidian.md/plugins?id=ownly"
    />
  );
}
