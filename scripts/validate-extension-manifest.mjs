import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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

// Chrome Web Store readiness: version + icons
if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
  console.error(`Invalid manifest version: ${JSON.stringify(manifest.version)} (expected SemVer)`);
  process.exit(1);
}
for (const size of ['16', '48', '128']) {
  const iconPath = manifest.icons?.[size];
  if (typeof iconPath !== 'string' || !iconPath) {
    console.error(`Missing manifest icons[${size}] (Chrome Web Store requires 16/48/128)`);
    process.exit(1);
  }
  // Icons ship from public/icons via scripts/build-extension.mjs; accept either
  // the packaged dist copy or the public source so `validate:extension` works pre-build.
  const candidates = [join('extension', iconPath), join('dist/extension', iconPath), join('public/icons', iconPath.split('/').pop())];
  if (!candidates.some((p) => existsSync(p))) {
    console.error(`Manifest icons[${size}] target missing: ${iconPath} (checked ${candidates.join(', ')})`);
    process.exit(1);
  }
}
const actionIcon = manifest.action?.default_icon ?? {};
for (const size of ['16', '48', '128']) {
  if (typeof actionIcon[size] !== 'string' || !actionIcon[size]) {
    console.error(`Missing manifest action.default_icon[${size}]`);
    process.exit(1);
  }
}
console.log(`extension manifest permissions OK (version ${manifest.version}, icons 16/48/128 OK)`);
