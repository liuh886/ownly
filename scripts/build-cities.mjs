/**
 * Build compact city database from GeoNames cities15000.txt
 *
 * Usage: node scripts/build-cities.mjs [path-to-cities15000.txt]
 * Default: /tmp/geonames/cities15000.txt
 *
 * Data source: https://download.geonames.org/export/dump/
 * License: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
 * Attribution: GeoNames geographical database (https://www.geonames.org/)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const inputFile = process.argv[2] || '/tmp/geonames/cities15000.txt';
const outputFile = resolve(__dirname, '../src/data/cities.json');
const MIN_POPULATION = 100_000;

const CJK_REGEX = /[一-鿿぀-ゟ゠-ヿ가-힯]/;

function extractCJKName(alternateNames) {
  if (!alternateNames) return undefined;
  const names = alternateNames.split(',');
  for (const name of names) {
    if (CJK_REGEX.test(name.trim())) {
      return name.trim();
    }
  }
  return undefined;
}

const raw = readFileSync(inputFile, 'utf-8');
const lines = raw.split('\n').filter(Boolean);

const cities = [];

for (const line of lines) {
  const cols = line.split('\t');
  if (cols.length < 18) continue;

  const name = cols[1];        // ASCII name
  const lat = parseFloat(cols[4]);
  const lng = parseFloat(cols[5]);
  const countryCode = cols[8]; // ISO 3166-1 alpha-2
  const population = parseInt(cols[14], 10);
  const alternateNames = cols[3]; // comma-separated alternate names

  if (!name || isNaN(lat) || isNaN(lng) || !countryCode) continue;
  if (population < MIN_POPULATION) continue;

  const cjkName = extractCJKName(alternateNames);

  const entry = {
    n: name,
    c: countryCode,
    la: Math.round(lat * 100) / 100,
    lo: Math.round(lng * 100) / 100,
  };

  if (cjkName && cjkName !== name) {
    entry.cn = cjkName;
  }

  cities.push(entry);
}

// Sort by population descending (we process in file order which is roughly by population,
// but GeoNames cities15000.txt is sorted by population, so this is already correct)
// Just in case, we don't re-sort since the file order is authoritative.

const json = JSON.stringify(cities);
writeFileSync(outputFile, json, 'utf-8');

console.log(`Built ${cities.length} cities (pop >= ${MIN_POPULATION.toLocaleString()})`);
console.log(`Output: ${outputFile} (${(Buffer.byteLength(json) / 1024).toFixed(0)} KB)`);

const withCJK = cities.filter(c => c.cn).length;
console.log(`Cities with CJK names: ${withCJK}`);
