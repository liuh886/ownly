import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(root, 'public/membership-config.js');
const headerPath = resolve(root, 'src/components/app-shell/AppHeader.tsx');
const stylesPath = resolve(root, 'src/components/app-shell/account-integration.css');
await Promise.all([access(configPath), access(headerPath), access(stylesPath)]);

const syntax = spawnSync(process.execPath, ['--check', configPath], { encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`${configPath} syntax check failed:\n${syntax.stderr}`);

const [layout, config, header, styles] = await Promise.all([
  readFile(resolve(root, 'src/app/layout.tsx'), 'utf8'),
  readFile(configPath, 'utf8'),
  readFile(headerPath, 'utf8'),
  readFile(stylesPath, 'utf8'),
]);

for (const reference of [
  'https://liuh886.github.io/admin/shared',
  'account-shell.css?v=3',
  'membership-config.js',
  'account-shell.js?v=3',
]) {
  if (!layout.includes(reference)) throw new Error(`Ownly layout is missing ${reference}`);
}
for (const contract of [
  "window.location.pathname.startsWith('/ownly/app/')",
  'window.HaoAccountConfig',
  "productCode: 'ownly'",
  "entitlementCode: 'ownly.pro'",
  "mountSelectors: ['[data-account-slot]']",
  'compactTrigger: false',
  'billingEnabled: false',
  'feedbackEnabled: false',
  'sb_publishable_',
  'Markdown、附件、归档和本地目录不会上传',
]) {
  if (!config.includes(contract)) throw new Error(`Ownly account config is missing ${contract}`);
}
for (const contract of ['data-account-slot', 'ownly-account-slot', "import './account-integration.css'"]) {
  if (!header.includes(contract)) throw new Error(`Ownly app header is missing ${contract}`);
}
for (const contract of ['.ownly-account-slot .hao-account-trigger', 'box-shadow: none', 'backdrop-filter: none']) {
  if (!styles.includes(contract)) throw new Error(`Ownly account integration styles are missing ${contract}`);
}
if (styles.includes('is-floating')) {
  throw new Error('Ownly must not retain compatibility with the retired floating account state.');
}

const combined = `${layout}\n${config}\n${header}\n${styles}`;
for (const forbidden of [/sk_(live|test)_/, /whsec_/, /sb_secret_/, /service_role/]) {
  if (forbidden.test(combined)) throw new Error(`Ownly browser assets contain forbidden secret material: ${forbidden}`);
}
if (combined.includes('membership-widget.js') || combined.includes('membership-widget.css')) {
  throw new Error('Ownly must not load the retired local membership widget');
}
for (const forbidden of ['Objects/', 'Accounts/', 'Snapshots/', 'Reviews/', 'Logs/']) {
  if (config.includes(forbidden)) throw new Error(`Ownly account config must not inspect local data paths: ${forbidden}`);
}

console.log('Ownly account uses only the native app-header slot, preserves local-data isolation, and loads Turnstile-enabled Account Shell v3.');
