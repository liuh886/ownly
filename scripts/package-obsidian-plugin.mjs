import { mkdir, rm, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const outputDir = join('dist', 'obsidian', 'wyqd');
const releaseFiles = ['manifest.json', 'versions.json', 'main.js', 'styles.css'];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const file of releaseFiles) {
  await copyFile(file, join(outputDir, file));
}

console.log(`Ownly Obsidian plugin package written to ${outputDir}.`);
