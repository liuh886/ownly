import type { Metadata } from 'next';
import Script from 'next/script';
import './account-shell.css';

const HAO_ACCOUNT_ASSET_ROOT = 'https://liuh886.github.io/admin/shared';

function getBasePath(): string {
  const configured = process.env.OWNLY_BASE_PATH?.trim() ?? '';
  if (!configured || configured === '/') return '';
  return `/${configured.replace(/^\/+|\/+$/g, '')}`;
}

const basePath = getBasePath();

export const metadata: Metadata = {
  manifest: `${basePath}/app/manifest.webmanifest`,
};

export default function OwnlyAppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <Script src={`${HAO_ACCOUNT_ASSET_ROOT}/account-shell.js?v=3`} strategy="afterInteractive" />
    </>
  );
}
