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

// MV3 + store listing basics
if (manifest.manifest_version !== 3) {
  console.error(`manifest_version must be 3 (got ${JSON.stringify(manifest.manifest_version)})`);
  process.exit(1);
}
if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
  console.error('Manifest name is missing');
  process.exit(1);
}
if (typeof manifest.description !== 'string' || manifest.description.length === 0 || manifest.description.length > 132) {
  console.error(`Manifest description must be 1-132 chars for the Chrome Web Store (got ${manifest.description?.length ?? 0})`);
  process.exit(1);
}

// Entry points referenced by the manifest must exist in the source tree
const entryFiles = [
  ['side_panel.default_path', manifest.side_panel?.default_path],
  ['background.service_worker', manifest.background?.service_worker],
  ...(manifest.content_scripts ?? []).flatMap((cs, i) => (cs.js ?? []).map((js) => [`content_scripts[${i}].js`, js])),
];
for (const [label, rel] of entryFiles) {
  if (typeof rel !== 'string' || !rel) {
    console.error(`Manifest ${label} is missing`);
    process.exit(1);
  }
  if (!existsSync(join('extension', rel)) && !existsSync(join('dist/extension', rel))) {
    console.error(`Manifest ${label} target missing: ${rel}`);
    process.exit(1);
  }
}

// Store packages must never carry an update_url (self-hosted only)
if ('update_url' in manifest) {
  console.error('Manifest must not contain update_url in store submissions');
  process.exit(1);
}

// content_scripts matches vs host_permissions consistency report.
// Note: matches grant their own access, so uncovered entries are warnings, not
// failures (e.g. the localhost-only bridge origins intentionally have no host_permissions).
{
  const hosts = manifest.host_permissions ?? [];
  const stripHost = (pattern) => pattern.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const coveredBy = (matchHost) => hosts.some((h) => {
    const hh = stripHost(h);
    if (hh === matchHost) return true;
    if (hh.startsWith('*.')) {
      const base = hh.slice(2);
      return matchHost === base || matchHost.endsWith(`.${base}`);
    }
    return false;
  });
  for (const [i, cs] of (manifest.content_scripts ?? []).entries()) {
    for (const match of cs.matches ?? []) {
      if (match === 'http://*/*' || match === 'https://*/*') {
        console.warn(`[warn] content_scripts[${i}] matches all hosts (${match}): intentional for the opt-in FX tooltip — keep the submission justification in docs/STORE_LISTING.md`);
        continue;
      }
      if (!coveredBy(stripHost(match))) {
        console.warn(`[warn] content_scripts[${i}] match ${match} has no host_permissions entry (ok if the match itself grants access, e.g. localhost bridge origins)`);
      }
    }
  }
}

// commands shortcut sanity (Edge reserves some combos; Alt+Shift+C is allowed)
for (const [name, cmd] of Object.entries(manifest.commands ?? {})) {
  const key = cmd?.suggested_key?.default;
  if (typeof key !== 'string' || !/^(Alt|Ctrl|Command|MacCtrl)\+Shift\+[A-Z]$/.test(key)) {
    console.error(`commands[${name}].suggested_key.default looks invalid: ${JSON.stringify(key)}`);
    process.exit(1);
  }
}
console.log(`extension manifest permissions OK (version ${manifest.version}, icons 16/48/128 OK)`);
