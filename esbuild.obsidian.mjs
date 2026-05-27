import esbuild from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';

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
    minify: production,
    outfile: 'main.js',
    define: {
      'process.env.NODE_ENV': production ? '"production"' : '"development"',
    },
    alias: {
      '@': './src',
    },
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
    },
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js'],
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

// Build Tailwind CSS for Obsidian using PostCSS
const baseStyles = await readFile('src/obsidian/styles.css', 'utf-8');
try {
  const tailwindInput = await readFile('src/obsidian/tailwind-input.css', 'utf-8');
  const result = await postcss([tailwindcss]).process(tailwindInput, {
    from: 'src/obsidian/tailwind-input.css',
  });
  await writeFile('styles.css', baseStyles + '\n' + result.css);
} catch (error) {
  console.warn('Tailwind CSS build skipped:', error instanceof Error ? error.message : error);
  await writeFile('styles.css', baseStyles);
}
