import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outputDir = resolve(process.cwd(), 'out');
const indexPath = join(outputDir, 'index.html');
const appIndexPath = join(outputDir, 'app', 'index.html');
const configuredBasePath = (process.env.OWNLY_BASE_PATH ?? '').trim();
const basePath = configuredBasePath && configuredBasePath !== '/'
  ? `/${configuredBasePath.replace(/^\/+|\/+$/g, '')}`
  : '';
const cloudflareAnalyticsToken = (process.env.NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN ?? '').trim();
const cloudflareAnalyticsLoader = 'https://static.cloudflareinsights.com/beacon.min.js';
const publicUrl = 'https://liuh886.github.io/ownly/';
const appUrl = 'https://liuh886.github.io/ownly/app/';
const previewUrl = 'https://liuh886.github.io/ownly/#preview';

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

function requireFile(relativePath) {
  const path = join(outputDir, relativePath);
  if (!existsSync(path)) {
    fail(`out/${relativePath} is missing.`);
    return null;
  }
  return readFileSync(path, 'utf8');
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

  if (html.includes('googletagmanager.com') || html.includes('google-analytics.com')) {
    fail('Ownly must not ship Google Analytics; aggregate RUM uses Cloudflare Web Analytics only.');
  }

  if (cloudflareAnalyticsToken) {
    if (!html.includes(cloudflareAnalyticsLoader)) {
      fail('Cloudflare Web Analytics loader is missing while a token is configured.');
    }
    if (!html.includes(cloudflareAnalyticsToken)) {
      fail('Cloudflare Web Analytics token is not present in the static export.');
    }
  }

  if (!html.includes(publicUrl)) {
    fail(`The public homepage must expose the canonical URL ${publicUrl}.`);
  }

  if (!html.includes('og:site_name') || !html.includes('Ownly')) {
    fail('The public homepage is missing its Open Graph product identity.');
  }

  for (const scene of ['overview', 'cost', 'review']) {
    if (!html.includes(`data-ownly-scene="${scene}"`)) {
      fail(`The focused homepage is missing its ${scene} product scene.`);
    }
  }

  if (!html.includes('id="preview"') || !html.includes('id="review"') || !html.includes('id="local"')) {
    fail('The homepage must expose stable cost, review, and local-data anchors.');
  }

  if (html.includes('/app/?demo=1')) {
    fail('The homepage must not route visitors to a separate demo page.');
  }
}

if (!existsSync(appIndexPath)) {
  fail('out/app/index.html is missing.');
} else {
  const appHtml = readFileSync(appIndexPath, 'utf8');
  if (!appHtml.includes('noindex') || !appHtml.includes('nofollow')) {
    fail('The local-data application route must remain outside search indexes.');
  }
}

requireFile('robots.txt');
const sitemap = requireFile('sitemap.xml');
requireFile('404.html');

if (sitemap && !sitemap.includes(publicUrl)) {
  fail(`sitemap.xml must contain ${publicUrl}.`);
}

const staticDir = join(outputDir, '_next', 'static');
if (!existsSync(staticDir)) {
  fail('out/_next/static is missing.');
} else {
  const staticFiles = listFiles(staticDir);
  if (staticFiles.length === 0) {
    fail('out/_next/static is empty.');
  } else {
    const clientBundle = staticFiles
      .filter((path) => path.endsWith('.js'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    for (const contract of [
      'Sample data',
      'Price is only the beginning.',
      'Review before the next purchase or renewal.',
      'No hosted personal database',
    ]) {
      if (!clientBundle.includes(contract)) {
        fail(`The focused homepage client bundle is missing: ${contract}`);
      }
    }
  }
}

for (const readmePath of ['README.md', 'README.zh.md']) {
  const readme = readFileSync(resolve(process.cwd(), readmePath), 'utf8');
  for (const url of [publicUrl, appUrl, previewUrl]) {
    if (!readme.includes(url)) {
      fail(`${readmePath} is missing the product entry point ${url}.`);
    }
  }
  if (readme.includes('/app/?demo=1')) {
    fail(`${readmePath} still points to the retired standalone demo route.`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`[pages validation] three-scene homepage, local-data trust rail and app route are ready${basePath ? ` for ${basePath}` : ''}.`);
