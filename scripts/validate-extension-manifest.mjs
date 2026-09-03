import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
const required = ['sidePanel','storage','scripting','activeTab','tabs'];
const permissions = manifest.permissions ?? [];
const missing = required.filter(p => !permissions.includes(p));
if (missing.length) {
  console.error(`Missing permissions: ${missing.join(', ')}`);
  process.exit(1);
}
const hosts = manifest.host_permissions ?? [];
if (!hosts.some(h => h.includes('google'))) {
  console.error('Missing Google Maps host_permissions');
  process.exit(1);
}
console.log('extension manifest permissions OK');
