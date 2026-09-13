import { rm, mkdir, copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
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

for (const file of ['sidepanel.html', 'sidepanel.css']) {
  await copyFile(path.join(staticDir, file), path.join(outdir, file));
}

// Store packages must not contain the `_`-prefixed authoring notes in
// extension/manifest.json (Chrome/Edge tolerate unknown keys, but a clean
// manifest avoids review noise).
{
  const manifest = JSON.parse(await readFile(path.join(staticDir, 'manifest.json'), 'utf8'));
  for (const key of Object.keys(manifest)) {
    if (key.startsWith('_')) delete manifest[key];
  }
  await writeFile(path.join(outdir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

// Store icons: PNG builds of the Ownly mark live in public/icons
// (ownly-16/48/128.png) and are copied into dist/extension/icons
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
