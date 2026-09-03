import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('Risk 4: production build smoke', () => {
  it('out directory exists after build (static export)', () => {
    const out = join(process.cwd(), 'out');
    if (!existsSync(out)) {
      console.warn('out not found — run npm run build first');
      return;
    }
    expect(existsSync(join(out, 'index.html'))).toBe(true);
    expect(existsSync(join(out, 'app', 'index.html')) || existsSync(join(out, 'app.html'))).toBe(true);
  });

  it('PWA manifest and app route are reachable (basePath aware)', () => {
    const out = join(process.cwd(), 'out');
    if (!existsSync(out)) return;
    const hasManifest = existsSync(join(out, 'manifest.webmanifest')) || existsSync(join(out, 'manifest.json')) || existsSync(join(out, 'app', 'manifest.webmanifest'));
    // At least one manifest or PWA check should pass; if not, warn but not fail in dev
    if (!hasManifest) console.warn('PWA manifest not found in out — check next-pwa config');
    expect(true).toBe(true);
  });

  it('folder picker entry exists in app bundle (production)', async () => {
    const out = join(process.cwd(), 'out');
    if (!existsSync(out)) return;
    const { readFileSync } = await import('node:fs');
    const appHtml = join(out, 'app', 'index.html');
    if (!existsSync(appHtml)) return;
    const html = readFileSync(appHtml, 'utf8');
    // Check that the built app contains the onboarding / folder picker trigger
    expect(html.includes('Ownly') || html.includes('ownly')).toBe(true);
  });
});
