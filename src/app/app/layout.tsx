import type { Metadata } from 'next';

function getBasePath(): string {
  const configured = process.env.OWNLY_BASE_PATH?.trim() ?? '';
  if (!configured || configured === '/') return '';
  return `/${configured.replace(/^\/+|\/+$/g, '')}`;
}

const basePath = getBasePath();

export const metadata: Metadata = {
  manifest: `${basePath}/manifest.webmanifest`,
};

export default function OwnlyAppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
