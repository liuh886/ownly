import { rm, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const outdir = path.join(root, 'dist', 'extension');
const staticDir = path.join(root, 'extension');

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: {
    background: path.join(root, 'src/extension/background.ts'),
    content: path.join(root, 'src/extension/content.ts'),
    'ownly-bridge': path.join(root, 'src/extension/ownly-bridge.ts'),
    sidepanel: path.join(root, 'src/extension/sidepanel.ts'),
  },
  outdir,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});

for (const file of ['manifest.json', 'sidepanel.html', 'sidepanel.css']) {
  await copyFile(path.join(staticDir, file), path.join(outdir, file));
}

console.log(`Ownly Capture built at ${path.relative(root, outdir)}`);
