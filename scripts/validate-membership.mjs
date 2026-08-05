import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(root, 'public/membership-config.js');
const clientPath = resolve(root, 'public/membership-widget.js');
const cssPath = resolve(root, 'public/membership-widget.css');

for (const path of [configPath, clientPath, cssPath]) await access(path);
for (const path of [configPath, clientPath]) {
  const syntax = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (syntax.status !== 0) throw new Error(`${path} syntax check failed:\n${syntax.stderr}`);
}

const [layout, config, client] = await Promise.all([
  readFile(resolve(root, 'src/app/layout.tsx'), 'utf8'),
  readFile(configPath, 'utf8'),
  readFile(clientPath, 'utf8'),
]);

for (const reference of ['membership-widget.css', 'membership-config.js', 'membership-widget.js']) {
  if (!layout.includes(reference)) throw new Error(`Ownly layout is missing ${reference}`);
}
for (const contract of [
  "pathPrefix: '/ownly/app/'",
  "productCode: 'ownly'",
  "entitlementCode: 'ownly.pro'",
  'billingEnabled: false',
  'sb_publishable_',
  '/functions/v1/create-checkout-session',
  '/functions/v1/create-portal-session',
]) {
  if (!config.includes(contract)) throw new Error(`membership config is missing ${contract}`);
}
for (const contract of [
  "from('entitlements')",
  "Authorization: `Bearer ${token}`",
  'apikey: config.supabasePublishableKey',
  "window.dispatchEvent(new CustomEvent('hao:membership-changed'",
]) {
  if (!client.includes(contract)) throw new Error(`membership client is missing ${contract}`);
}

const combined = `${config}\n${client}`;
for (const forbidden of [/sk_(live|test)_/, /whsec_/, /sb_secret_/, /service_role/]) {
  if (forbidden.test(combined)) throw new Error(`membership browser assets contain forbidden secret material: ${forbidden}`);
}

for (const forbidden of ['Objects/', 'Accounts/', 'Snapshots/', 'Reviews/', 'Logs/']) {
  if (client.includes(forbidden)) throw new Error(`membership client must not inspect Ownly data paths: ${forbidden}`);
}

console.log('Ownly shared membership and local-data isolation contract passed.');
