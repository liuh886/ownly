import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outputDir = resolve(process.cwd(), 'out');
const indexPath = join(outputDir, 'index.html');
const configuredBasePath = (process.env.OWNLY_BASE_PATH ?? '').trim();
const basePath = configuredBasePath && configuredBasePath !== '/'
  ? `/${configuredBasePath.replace(/^\/+|\/+$/g, '')}`
  : '';

function fail(message) {
  console.error(`[pages validation] ${message}`);
  process.exitCode = 1;
}

function listFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

if (!existsSync(indexPath)) {
  fail('out/index.html is missing. Run the static Next.js build first.');
} else {
  const html = readFileSync(indexPath, 'utf8');
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);

  if (basePath) {
    const wrongNextReferences = references.filter((reference) => reference.startsWith('/_next/'));
    if (wrongNextReferences.length > 0) {
      fail(`found root-relative Next.js assets that bypass ${basePath}: ${wrongNextReferences.join(', ')}`);
    }

    const nextReferences = references.filter((reference) => reference.includes('/_next/'));
    if (nextReferences.length === 0 || nextReferences.some((reference) => !reference.startsWith(`${basePath}/_next/`))) {
      fail(`Next.js assets are not consistently prefixed with ${basePath}.`);
    }
  }
}

const staticDir = join(outputDir, '_next', 'static');
if (!existsSync(staticDir)) {
  fail('out/_next/static is missing.');
} else if (listFiles(staticDir).length === 0) {
  fail('out/_next/static is empty.');
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`[pages validation] static export is ready${basePath ? ` for ${basePath}` : ''}.`);
