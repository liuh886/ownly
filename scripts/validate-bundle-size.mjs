#!/usr/bin/env node
/**
 * Gzip bundle budget gate.
 *
 * Reads the static export in `out/`, sums the gzip size of the JS and CSS
 * actually referenced by each route's index.html, and fails when a route
 * exceeds its budget. Budgets live in `scripts/bundle-budgets.json` so they
 * are reviewable in PRs.
 *
 * Usage:
 *   node scripts/validate-bundle-size.mjs            # enforce budgets
 *   node scripts/validate-bundle-size.mjs --report   # print sizes only
 */
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'out');
const reportOnly = process.argv.includes('--report');

if (!existsSync(outDir)) {
  console.error('out/ not found — run `npm run build` first.');
  process.exit(1);
}

const routes = ['/', '/app/', '/c/', '/trip/'];
const budgets = JSON.parse(readFileSync(join(root, 'scripts', 'bundle-budgets.json'), 'utf8'));

function assetPathsFromHtml(html) {
  const paths = new Set();
  const scriptRe = /<script[^>]+src="([^"]+)"/g;
  const linkRe = /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g;
  for (const re of [scriptRe, linkRe]) {
    let match;
    while ((match = re.exec(html)) !== null) {
      const src = match[1];
      if (!src.startsWith('/') || src.startsWith('//')) continue;
      paths.add(src.slice(1));
    }
  }
  return [...paths];
}

/**
 * Resolve an HTML-referenced asset to a path inside out/. Handles `basePath`
 * deployments (e.g. OWNLY_BASE_PATH=/ownly) by progressively dropping leading
 * path segments until the file exists.
 */
function resolveAsset(relPath) {
  const candidates = [relPath];
  const segments = relPath.split('/').filter(Boolean);
  for (let i = 1; i < segments.length; i += 1) {
    candidates.push(segments.slice(i).join('/'));
  }
  for (const candidate of candidates) {
    if (existsSync(join(outDir, candidate))) return candidate;
  }
  return null;
}

function gzipSize(relPath) {
  const resolved = resolveAsset(relPath);
  if (resolved === null) return null;
  return gzipSync(readFileSync(join(outDir, resolved))).length;
}

let failed = false;
const rows = [];
for (const route of routes) {
  const indexPath = join(outDir, route === '/' ? 'index.html' : join(route, 'index.html'));
  if (!existsSync(indexPath)) {
    console.error(`missing export for route ${route}: ${indexPath}`);
    process.exit(1);
  }
  const html = readFileSync(indexPath, 'utf8');
  let js = 0;
  let css = 0;
  let missing = 0;
  for (const asset of assetPathsFromHtml(html)) {
    const size = gzipSize(asset);
    if (size === null) {
      missing += 1;
      continue;
    }
    if (asset.endsWith('.css')) css += size;
    else if (asset.endsWith('.js')) js += size;
  }
  const budget = budgets[route] ?? {};
  const jsOver = budget.jsGzip !== undefined && js > budget.jsGzip;
  const cssOver = budget.cssGzip !== undefined && css > budget.cssGzip;
  if (missing > 0) {
    console.error(`route ${route}: ${missing} referenced asset(s) missing from out/`);
    process.exit(1);
  }
  rows.push({ route, js, css, jsBudget: budget.jsGzip, cssBudget: budget.cssGzip });
  if (!reportOnly && (jsOver || cssOver)) failed = true;
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log('\nRoute gzip budgets (JS / CSS):');
for (const row of rows) {
  const jsPart = `${kb(row.js)}${row.jsBudget !== undefined ? ` / ${kb(row.jsBudget)}` : ''}`;
  const cssPart = `${kb(row.css)}${row.cssBudget !== undefined ? ` / ${kb(row.cssBudget)}` : ''}`;
  const over = (row.jsBudget !== undefined && row.js > row.jsBudget) || (row.cssBudget !== undefined && row.css > row.cssBudget);
  console.log(`  ${row.route.padEnd(7)} JS ${jsPart}${over ? '  ← over budget' : ''}   CSS ${cssPart}`);
}

if (reportOnly) {
  console.log('\nreport mode — budgets not enforced');
} else if (failed) {
  console.error('\nBundle budget exceeded. Reduce payload or update scripts/bundle-budgets.json with a reviewed reason.');
  process.exit(1);
} else {
  console.log('\nBundle budget OK.');
}
