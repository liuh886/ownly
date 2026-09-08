/**
 * Static privacy guard for activation analytics (issue #48).
 * - No raw gtag( calls outside src/lib/analytics.ts
 * - Every trackOwnlyEvent/trackFirstEver literal name must be allowlisted
 * - No prohibited param keys (titles, paths, ids, amounts, content, ...)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');

const ALLOWLIST = new Set([
  'onboarding_opened',
  'local_data_connected',
  'demo_started',
  'first_object_saved',
  'object_archived',
  'object_restored',
  'backup_exported',
  'backup_validated',
  'pwa_installed',
  'app_return',
]);

const DENIED_KEY_FRAGMENTS = [
  'title', 'markdown', 'filename', 'filepath', 'path', 'url', 'href',
  'address', 'amount', 'price', 'content', 'body', 'text', 'description',
  'notes', 'note', 'collectionid', 'placeid', 'workspaceid', 'vault',
  'email', 'phone',
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const errors = [];
for (const file of walk(SRC)) {
  const rel = file.slice(SRC.length + 1).replace(/\\/g, '/');
  const text = readFileSync(file, 'utf8');
  const isLib = rel === 'lib/analytics.ts';
  // Tests intentionally probe the guard with hostile inputs.
  const isTest = /\.test\.(ts|tsx)$/.test(rel);

  // Only event emissions are gated; the GA loader bootstrap in
  // src/app/layout.tsx (gtag('js'/'config', no payload) is legitimate.
  if (!isLib && /(^|[^\w.])gtag\s*\(\s*['"`]event['"`]/.test(text)) {
    errors.push(`${rel}: raw gtag('event') call outside src/lib/analytics.ts`);
  }

  for (const m of text.matchAll(/track(?:FirstEver|OwnlyEvent)\(\s*['"`]([^'"`]+)['"`]/g)) {
    if (isTest) continue;
    if (!ALLOWLIST.has(m[1])) {
      errors.push(`${rel}: non-allowlisted analytics event "${m[1]}"`);
    }
  }

  const paramBlocks = [
    ...text.matchAll(/trackOwnlyEvent\(\s*['"`][^'"`]+['"`]\s*,\s*\{([^}]*)\}/g),
    ...text.matchAll(/trackFirstEver\(\s*['"`][^'"`]+['"`]\s*,\s*['"`][^'"`]+['"`]\s*,\s*\{([^}]*)\}/g),
  ];
  if (isTest) continue;
  for (const m of paramBlocks) {
    // Strip string literals so values can't trip the check; remaining
    // identifiers cover both `key: value` and `{ shorthand }` forms.
    const bare = m[1].replace(/['"`][^'"`]*['"`]/g, ' ');
    const keys = [...bare.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)].map((k) => k[1].toLowerCase());
    for (const key of keys) {
      if (DENIED_KEY_FRAGMENTS.some((frag) => key.includes(frag))) {
        errors.push(`${rel}: prohibited analytics param key "${key}"`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error('Analytics privacy guard failed:\n' + errors.map((e) => ` - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`Analytics privacy guard passed (${ALLOWLIST.size} allowlisted events).`);
