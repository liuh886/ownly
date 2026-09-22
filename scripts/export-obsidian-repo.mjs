// Generates a standalone Obsidian plugin repository from the Ownly monorepo.
//
// The Obsidian community review runs eslint-plugin-obsidianmd over every *.ts
// in the submitted repo, so the plugin must live in a repo that does not also
// contain the Next.js web app (src/app) or the Chrome extension (src/extension).
// This script computes the plugin's exact dependency closure with esbuild and
// copies only those sources plus the plugin build tooling into a target tree.
//
// Usage: node scripts/export-obsidian-repo.mjs [outDir]
import esbuild from 'esbuild';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const outRoot = process.argv[2] || join('dist', 'obsidian-repo');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));

async function copyInto(relPath) {
  if (!existsSync(relPath)) throw new Error(`export: missing required file ${relPath}`);
  const dest = join(outRoot, relPath);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(relPath, dest);
}

// 1. Compute the exact plugin dependency closure.
const build = await esbuild.build({
  entryPoints: ['src/obsidian/main.ts'],
  bundle: true,
  write: false,
  metafile: true,
  outdir: join(outRoot, '__closure'),
  external: ['obsidian', 'electron', '@codemirror/*'],
  format: 'cjs',
  target: 'es2018',
  platform: 'browser',
  alias: { '@': './src' },
  loader: { '.tsx': 'tsx', '.ts': 'ts', '.css': 'css', '.json': 'json' },
  resolveExtensions: ['.tsx', '.ts', '.jsx', '.js'],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
});

const srcFiles = Object.keys(build.metafile.inputs)
  .map((p) => p.replace(/\\/g, '/'))
  .filter((p) => p.startsWith('src/'));

await rm(outRoot, { recursive: true, force: true });

// 2. Copy the closure sources.
for (const rel of srcFiles) await copyInto(rel);

// 3. Copy plugin build tooling and metadata.
for (const rel of [
  'manifest.json',
  'versions.json',
  'LICENSE',
  'esbuild.obsidian.mjs',
  'scripts/gen-git-sha.mjs',
  'scripts/package-obsidian-plugin.mjs',
  'scripts/validate-obsidian-release.mjs',
]) {
  await copyInto(rel);
}

// 4. Stylesheets read directly by esbuild.obsidian.mjs (not part of the JS graph).
await copyInto('src/obsidian/styles.css');
await copyInto('src/obsidian/tailwind-input.css');

// 5. Generated package.json — only the deps the closure actually needs, pinned
// to the exact versions this monorepo built and validated against (the Obsidian
// directory flags broad ranges and prefers reproducible builds).
async function installedVersion(name) {
  try {
    const meta = JSON.parse(await readFile(join('node_modules', name, 'package.json'), 'utf8'));
    return typeof meta.version === 'string' ? meta.version : null;
  } catch {
    return null;
  }
}

async function pinned(deps, list) {
  const out = {};
  for (const name of list) {
    if (!deps[name]) continue;
    out[name] = (await installedVersion(name)) ?? deps[name];
  }
  return out;
}

const outPkg = {
  name: 'ownly-obsidian',
  version: pkg.version,
  license: pkg.license,
  private: true,
  description:
    'Ownly — Obsidian plugin. Generated from the Ownly monorepo (https://github.com/liuh886/ownly).',
  scripts: {
    build: 'node scripts/gen-git-sha.mjs && node esbuild.obsidian.mjs --production',
    package: 'npm run build && node scripts/package-obsidian-plugin.mjs',
    check: 'tsc -p tsconfig.json --noEmit',
    validate: 'npm run package && node scripts/validate-obsidian-release.mjs',
  },
  dependencies: await pinned(pkg.dependencies, [
    'd3-geo',
    'framer-motion',
    'idb-keyval',
    'lucide-react',
    'next',
    'react',
    'react-dom',
    'topojson-client',
    'yaml',
  ]),
  devDependencies: await pinned(pkg.devDependencies, [
    '@tailwindcss/postcss',
    '@types/d3-geo',
    '@types/node',
    '@types/react',
    '@types/react-dom',
    '@types/topojson-client',
    'esbuild',
    'obsidian',
    'postcss',
    'tailwindcss',
    'typescript',
  ]),
};
await writeFile(join(outRoot, 'package.json'), JSON.stringify(outPkg, null, 2) + '\n');

// 5b. Lockfile — lets the plugin repo build reproducibly (npm ci) and lets the
// Obsidian directory's build verification run instead of reporting it as
// unavailable. Network is required; fall back gracefully when offline.
try {
  execSync('npm install --package-lock-only --ignore-scripts --no-audit --no-fund', {
    cwd: outRoot,
    stdio: 'inherit',
  });
} catch (error) {
  console.warn(
    `export: package-lock.json was not generated (${error instanceof Error ? error.message : error}); the directory's build check will be skipped.`,
  );
}

// 6. Standalone tsconfig for type checking the closure.
const tsconfig = {
  compilerOptions: {
    target: 'ES2018',
    lib: ['dom', 'dom.iterable', 'esnext'],
    allowJs: false,
    skipLibCheck: true,
    strict: true,
    noEmit: true,
    esModuleInterop: true,
    module: 'ESNext',
    moduleResolution: 'Bundler',
    resolveJsonModule: true,
    isolatedModules: false,
    jsx: 'react-jsx',
    types: [],
    paths: { '@/*': ['./src/*'] },
  },
  include: ['src/**/*.ts', 'src/**/*.tsx'],
  exclude: ['node_modules', 'dist'],
};
await writeFile(join(outRoot, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n');

// 7. .gitignore — build artifacts and the generated git-sha module.
// Patterns are root-anchored: an unanchored "styles.css" would also ignore the
// source stylesheet at src/obsidian/styles.css, breaking a fresh-clone build.
await writeFile(
  join(outRoot, '.gitignore'),
  ['/node_modules/', '/dist/', '/main.js', '/main.css', '/styles.css', '/src/core/git-sha.ts', ''].join('\n'),
);

await writeFile(
  join(outRoot, 'README.md'),
  [
    '# Ownly (Obsidian plugin)',
    '',
    'This repository is generated from the Ownly monorepo and contains only the',
    'Obsidian plugin and the source it depends on:',
    '',
    '- https://github.com/liuh886/ownly (source of truth)',
    '',
    'Do not edit here — changes are overwritten on the next release sync.',
    '',
    'Build:',
    '',
    '```sh',
    'npm install',
    'npm run validate',
    '```',
    '',
  ].join('\n'),
);

console.log(
  `Exported ${srcFiles.length} source files + tooling to ${outRoot} (ownly-obsidian v${pkg.version}).`,
);
