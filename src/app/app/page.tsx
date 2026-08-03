import type { Metadata } from 'next';
import { WebShell } from '@/components/shells/WebShell';

export const metadata: Metadata = {
  title: 'Ownly App',
  description: 'Open your local Ownly data folder and use the Ownly Web/PWA runtime.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default function OwnlyAppPage() {
  return <WebShell />;
}
