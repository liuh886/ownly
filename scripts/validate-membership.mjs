import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(root, 'public/membership-config.js');
const headerPath = resolve(root, 'src/components/app-shell/AppHeader.tsx');
const stylesPath = resolve(root, 'src/components/app-shell/account-integration.css');
const appLayoutPath = resolve(root, 'src/app/app/layout.tsx');
const routeAccountStylesPath = resolve(root, 'src/app/app/account-shell.css');
await Promise.all([
  access(configPath),
  access(headerPath),
  access(stylesPath),
  access(appLayoutPath),
  access(routeAccountStylesPath),
]);

const syntax = spawnSync(process.execPath, ['--check', configPath], { encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`${configPath} syntax check failed:\n${syntax.stderr}`);

const [rootLayout, appLayout, routeAccountStyles, config, header, styles] = await Promise.all([
  readFile(resolve(root, 'src/app/layout.tsx'), 'utf8'),
  readFile(appLayoutPath, 'utf8'),
  readFile(routeAccountStylesPath, 'utf8'),
  readFile(configPath, 'utf8'),
  readFile(headerPath, 'utf8'),
  readFile(stylesPath, 'utf8'),
]);

if (!rootLayout.includes('membership-config.js')) {
  throw new Error('Ownly root layout must keep the membership config bootstrap available before app entry.');
}
for (const reference of [
  'https://liuh886.github.io/admin/shared',
  'account-shell.js?v=7',
  "import './account-shell.css'",
]) {
  if (!appLayout.includes(reference)) throw new Error(`Ownly app layout is missing ${reference}`);
}
if (!routeAccountStyles.includes('account-shell.css?v=6')) {
  throw new Error('Ownly app route must load canonical Account Shell v6 styles.');
}
for (const forbiddenRootAsset of ['account-shell.css?v=6', 'account-shell.js?v=7']) {
  if (rootLayout.includes(forbiddenRootAsset)) {
    throw new Error(`Ownly marketing root must not load app-only account asset ${forbiddenRootAsset}`);
  }
}
for (const contract of [
  "window.location.pathname.startsWith('/ownly/app/')",
  'window.HaoAccountConfig',
  "productCode: 'ownly'",
  "entitlementCode: 'ownly.pro'",
  "mountSelectors: ['[data-account-slot]']",
  'compactTrigger: false',
  'billingEnabled: true',
  'feedbackEnabled: false',
  'sb_publishable_',
  'Markdown、附件、归档和本地目录不会自动上传',
  'Ownly Pro 当前不锁定或减少任何现有本地核心功能',
]) {
  if (!config.includes(contract)) throw new Error(`Ownly account config is missing ${contract}`);
}
for (const forbiddenCopy of [
  '共享账户',
  '支持产品持续开发',
  '未来正式上线',
  'support continued development',
  'Future released advanced templates',
  'shared account',
]) {
  if (config.includes(forbiddenCopy)) throw new Error(`Ownly account UI contains internal or roadmap copy: ${forbiddenCopy}`);
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

const combined = `${rootLayout}\n${appLayout}\n${routeAccountStyles}\n${config}\n${header}\n${styles}`;
for (const forbidden of [/sk_(live|test)_/, /whsec_/, /sb_secret_/, /service_role/]) {
  if (forbidden.test(combined)) throw new Error(`Ownly browser assets contain forbidden secret material: ${forbidden}`);
}
if (combined.includes('membership-widget.js') || combined.includes('membership-widget.css')) {
  throw new Error('Ownly must not load the retired local membership widget');
}
if (combined.includes('account-upgrade.js') || combined.includes('account-upgrade.css')) {
  throw new Error('Ownly must not load the retired secondary account-upgrade runtime');
}
for (const forbidden of ['Objects/', 'Accounts/', 'Snapshots/', 'Reviews/', 'Logs/']) {
  if (config.includes(forbidden)) throw new Error(`Ownly account config must not inspect local data paths: ${forbidden}`);
}

console.log('Ownly scopes canonical Account Shell v7/v6 to /app, keeps the native header slot, preserves local-data isolation, and rejects owner-facing roadmap copy.');
