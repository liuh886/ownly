import { rm, mkdir, copyFile, readdir } from 'node:fs/promises';
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
    'fx-tooltip': path.join(root, 'src/extension/fx-tooltip.ts'),
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

// Store icons: wired from public/icons (existing SVGs) into dist/extension/icons
// so manifest `icons` + `action.default_icon` (16/48/128) resolve in the package.
const publicIconsDir = path.join(root, 'public', 'icons');
const outIconsDir = path.join(outdir, 'icons');
await mkdir(outIconsDir, { recursive: true });
const iconFiles = await readdir(publicIconsDir);
for (const file of iconFiles) {
  if (!/\.(svg|png)$/i.test(file)) continue;
  await copyFile(path.join(publicIconsDir, file), path.join(outIconsDir, file));
}

console.log(`Ownly Capture built at ${path.relative(root, outdir)}`);
