import { chmod, mkdir, rm } from 'node:fs/promises';
import esbuild from 'esbuild';

const outdir = 'packages/mcp/dist';

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await esbuild.build({
  entryPoints: ['packages/mcp/src/index.mjs'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: `${outdir}/index.js`,
  banner: { js: '#!/usr/bin/env node' },
  external: [
    '@modelcontextprotocol/server',
    '@modelcontextprotocol/server/stdio',
    'zod',
    'zod/v4',
  ],
  sourcemap: false,
  minify: false,
  treeShaking: true,
  logLevel: 'info',
});

await chmod(`${outdir}/index.js`, 0o755);
