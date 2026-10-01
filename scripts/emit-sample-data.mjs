/**
 * One-off emitter: rewrite public/sample-data/ledger.json from the typed source.
 * Kept in the repo so the data can be regenerated rather than hand-edited.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_DATA } from '../src/data/sample-data/ledger';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/sample-data/ledger.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(SAMPLE_DATA, null, 2)}\n`, 'utf-8');
console.log(`Wrote ${out}`);
console.log(
  `  objects=${SAMPLE_DATA.objects.length} snapshots=${SAMPLE_DATA.snapshots.length} reviews=${SAMPLE_DATA.reviews.length} bodies=${Object.keys(SAMPLE_DATA.bodies).length}`,
);