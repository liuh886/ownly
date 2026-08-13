import { chmod, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(packageDirectory, '../..');
const outdir = resolve(packageDirectory, 'dist');

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await esbuild.build({
  absWorkingDir: repositoryRoot,
  entryPoints: ['packages/mcp/src/index.mjs'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: resolve(outdir, 'index.js'),
  banner: { js: '#!/usr/bin/env node' },
  external: [
    '@modelcontextprotocol/server',
    '@modelcontextprotocol/server/stdio',
    'yaml',
    'zod',
    'zod/v4',
  ],
  sourcemap: false,
  minify: false,
  treeShaking: true,
  logLevel: 'info',
});

await chmod(resolve(outdir, 'index.js'), 0o755);
