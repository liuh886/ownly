import esbuild from 'esbuild';
import { copyFile } from 'node:fs/promises';

const production = process.argv.includes('--production');

await esbuild.build({
  entryPoints: ['src/obsidian/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', '@codemirror/*'],
  format: 'cjs',
  target: 'es2018',
  platform: 'browser',
  sourcemap: production ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
});

await copyFile('src/obsidian/styles.css', 'styles.css');
