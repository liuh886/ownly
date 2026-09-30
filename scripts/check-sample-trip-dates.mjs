#!/usr/bin/env node
/**
 * Report Sample Trips whose dates have gone stale.
 *
 * Sample Trips use fixed dates so the shipped data is byte-stable and a test
 * can assert exact day counts. The cost is that they eventually describe a trip
 * in the past: calendar export lands before today, and "upcoming trip" framing
 * stops making sense.
 *
 * This is deliberately a *report*, not a gate. Wiring it into `npm run validate`
 * would turn a content refresh into a CI outage the day after the dates pass.
 * Run it before a release and re-author the data in
 * `src/data/sample-trips/*.ts` when it reports a stale trip.
 *
 * Usage: node scripts/check-sample-trip-dates.mjs
 * Exit:  0 always (informational), unless --strict, which is for local use.
 */
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');
const today = process.argv.find((arg) => arg.startsWith('--today='))?.slice('--today='.length);

/** Days before start_date at which the trip is already fully in the past. */
const files = ['thailand.ts', 'china.ts', 'kansai.ts'];
const rows = [];

for (const file of files) {
  const path = join(root, 'src', 'data', 'sample-trips', file);
  const source = readFileSync(path, 'utf-8');
  const start = /startDate:\s*'([\d-]+)'/.exec(source)?.[1];
  const end = /endDate:\s*'([\d-]+)'/.exec(source)?.[1];
  const title = /title:\s*'([^']+)'/.exec(source)?.[1];
  if (!start || !end) {
    console.error(`Could not read dates from ${file}`);
    process.exit(1);
  }
  rows.push({ file, title: title ?? file, start, end });
}

const now = today ? new Date(`${today}T00:00:00Z`) : new Date();
const nowMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const days = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - nowMs) / 86_400_000);

const STALE_WITHIN_DAYS = 30;

console.log('\nSample Trip calendar (run before a release):\n');
let stale = 0;

for (const row of rows) {
  const remaining = days(row.end);
  const status = remaining < 0 ? 'STALE — already in the past' : remaining < STALE_WITHIN_DAYS ? `expiring in ${remaining}d` : `ok — ends in ${remaining}d`;
  if (remaining < STALE_WITHIN_DAYS) stale += 1;
  console.log(`  ${row.title}`);
  console.log(`    ${row.start} → ${row.end}   ${status}\n`);
}

if (stale === 0) {
  console.log('All Sample Trips are still upcoming.\n');
} else {
  console.log(`${stale} Sample Trip(s) need new dates in src/data/sample-trips/.\n`);
  console.log('Re-author the dates, then re-run: npm run test:samples\n');
}

if (strict && stale > 0) process.exit(1);
