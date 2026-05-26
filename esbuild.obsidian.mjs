import esbuild from 'esbuild';
import { copyFile } from 'node:fs/promises';

const production = process.argv.includes('--production');

try {
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
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('another platform') || message.includes('@esbuild/')) {
    console.error(
      [
        'Ownly Obsidian build failed because esbuild was installed for a different platform.',
        'This usually happens when the same checkout is used from Docker/Linux and Windows.',
        'Run `npm run deps:reset` on the platform where you are building, then retry `npm run package:obsidian`.',
      ].join('\n'),
    );
  }
  throw error;
}

await copyFile('src/obsidian/styles.css', 'styles.css');
