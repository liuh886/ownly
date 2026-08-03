import type { Metadata } from 'next';
import { WebShell } from '@/components/shells/WebShell';

export const metadata: Metadata = {
  title: 'Ownly App',
  description: 'Open your local Ownly data folder and use the Ownly Web/PWA runtime.',
};

export default function OwnlyAppPage() {
  return <WebShell />;
}
