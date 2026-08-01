import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const matrixPath = resolve(root, 'docs/RUNTIME_COMPATIBILITY.md');
const contractPath = resolve(root, 'src/core/runtime-capabilities.ts');
const sourceRoot = resolve(root, 'src');

function fail(message) {
  console.error(`[runtime parity] ${message}`);
  process.exitCode = 1;
}

function listFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

if (!existsSync(matrixPath)) {
  fail('docs/RUNTIME_COMPATIBILITY.md is missing.');
} else {
  const matrix = readFileSync(matrixPath, 'utf8');
  for (const required of [
    'ownly-local-markdown-v1',
    'Hosted Web',
    'Installed PWA',
    'Obsidian',
    'Intentional platform exceptions',
    'Automated protection',
  ]) {
    if (!matrix.includes(required)) fail(`compatibility matrix is missing: ${required}`);
  }
}

if (!existsSync(contractPath)) {
  fail('src/core/runtime-capabilities.ts is missing.');
} else {
  const contract = readFileSync(contractPath, 'utf8');
  for (const required of [
    "OWNLY_DATA_BEHAVIOR_CONTRACT = 'ownly-local-markdown-v1'",
    'OWNLY_RUNTIME_CAPABILITY_MATRIX',
    'web:',
    'pwa:',
    'obsidian:',
  ]) {
    if (!contract.includes(required)) fail(`typed capability contract is missing: ${required}`);
  }
}

const forbiddenPwaImplementations = listFiles(sourceRoot)
  .map((path) => path.slice(root.length + 1).replaceAll('\\', '/'))
  .filter((path) => /(?:^|\/)(?:Pwa|PWA)[^/]*(?:Repository|Shell)\.(?:ts|tsx)$/.test(path));

if (forbiddenPwaImplementations.length > 0) {
  fail(`PWA must reuse the Web data runtime; remove separate implementations: ${forbiddenPwaImplementations.join(', ')}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log('[runtime parity] capability matrix and architecture contract passed.');
