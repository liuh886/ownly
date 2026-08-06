import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(root, 'public/membership-config.js');
await access(configPath);

const syntax = spawnSync(process.execPath, ['--check', configPath], { encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`${configPath} syntax check failed:\n${syntax.stderr}`);

const [layout, config] = await Promise.all([
  readFile(resolve(root, 'src/app/layout.tsx'), 'utf8'),
  readFile(configPath, 'utf8'),
]);

for (const reference of [
  'https://liuh886.github.io/admin/shared',
  'account-shell.css?v=1',
  'membership-config.js',
  'account-shell.js?v=1',
]) {
  if (!layout.includes(reference)) throw new Error(`Ownly layout is missing ${reference}`);
}
for (const contract of [
  "window.location.pathname.startsWith('/ownly/app/')",
  'window.HaoAccountConfig',
  "productCode: 'ownly'",
  "entitlementCode: 'ownly.pro'",
  'billingEnabled: false',
  'feedbackEnabled: false',
  'sb_publishable_',
  '/functions/v1/create-checkout-session',
  '/functions/v1/create-portal-session',
  'Markdown、附件、归档和本地目录不会上传',
]) {
  if (!config.includes(contract)) throw new Error(`Ownly account config is missing ${contract}`);
}

const combined = `${layout}\n${config}`;
for (const forbidden of [/sk_(live|test)_/, /whsec_/, /sb_secret_/, /service_role/]) {
  if (forbidden.test(combined)) throw new Error(`Ownly browser assets contain forbidden secret material: ${forbidden}`);
}
if (combined.includes('membership-widget.js') || combined.includes('membership-widget.css')) {
  throw new Error('Ownly must not load the retired local membership widget');
}
for (const forbidden of ['Objects/', 'Accounts/', 'Snapshots/', 'Reviews/', 'Logs/']) {
  if (config.includes(forbidden)) throw new Error(`Ownly account config must not inspect local data paths: ${forbidden}`);
}

console.log('Ownly shared account and local-data isolation contract passed.');
