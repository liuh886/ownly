/**
 * Sample Data — the ownership side (objects / snapshots / reviews).
 *
 * This is the successor to the demo system that `e654715` had to remove. That
 * one shipped the same kind of content but wrote it straight into a connected
 * user folder, which Product Governance forbids. The content was never the
 * problem, the delivery was — so this dataset has two destinations and neither
 * one writes to a real folder without an explicit click:
 *
 *  - **Demo mode** (no folder connected) → seeded into `MemoryOwnlyStore`.
 *    Read-only in the UI, gone when the tab closes, never touches disk.
 *  - **Connected empty folder** → written on click, tagged `sample`, and
 *    removable a record at a time like any other.
 *
 * The three types are authored as one coherent story so the Home dashboard's
 * aggregates add up: a traveller who owns a few things, pays for a few
 * services, went on three trips, and reviewed two of them.
 *
 * Sizing is deliberate, not arbitrary:
 *  - Snapshots span several calendar months with the earlier ones flagged
 *    `is_month_end`, because that is the only way `HomeMetrics` can show a
 *    Δ-vs-last-month and the Accounts trend charts have two points.
 *  - Reviews carry `*_score` (0-100), never the legacy `*_rank` fields, which
 *    `migrateReviewEntry` would otherwise rewrite on every read.
 *  - One experience is deliberately left unreviewed so the Reviews tab has a
 *    live action rather than a finished list.
 *
 * The records live in `public/sample-data/ledger.json` so they can be fetched on
 * demand instead of bundled — 28 KB of inert data has no business in every
 * route's JS. This module is the typed view of that file; TypeScript checks the
 * shape, and `sample-data.test.ts` checks the semantics.
 */
import type { SampleDataSet } from './ledger-types';

/** Regenerate with `npx tsx scripts/emit-sample-data.mjs`. */
import raw from '../../../public/sample-data/ledger.json';

export const SAMPLE_DATA = raw as unknown as SampleDataSet;