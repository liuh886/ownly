# Ownly Sample Data

**Sample Data** (示例数据) is the ownership-side counterpart to a
[Sample Trip](SAMPLE_TRIPS.md): objects, subscriptions, travel experiences,
account snapshots and reviews. Together they fill all five tabs so a new user —
or someone demoing Ownly — sees a working product instead of five blank panels.

## Why this exists

The audit behind this work found **two** separate sample systems and a demo mode
that showed nothing:

| System | Content | Fate |
|---|---|---|
| **A** | `src/data/sampleData.ts`, auto-seeded on load | Removed in `e654715` (#36) because it wrote demo records into the user's **real folder** |
| **B** | Sample Trips, Planner only | Added for onboarding |

Removing A left Demo mode with **no data at all**, plus three leftovers that had
become false: two orphaned `i18n` strings, and `TrustStatusSection` promising
"demo-mode data lives in memory only" when there was no demo data.

The fix was not a third system. It was to fix the defect that got A deleted — the
**destination**, not the content:

```
one dataset → two destinations
  ├─ Demo mode (no folder)  → in-memory store, read-only, dies with the tab
  └─ Connected empty folder → written on click, tagged, deletable
```

## Governance boundary

Unchanged from the rule that removed A, and now honest about the case it permits:

- **Demo mode never reaches disk.** It writes through an in-memory store that
  dies with the tab. `seedDemoMode.test.ts` asserts the filesystem store is
  never read or written while routing to memory.
- **Connecting a folder discards demo data** rather than migrating it. A demo
  record is not a real record; silently promoting it would be the exact mistake
  `e654715` had to undo.
- **Demo mode is read-only.** Every write action stays gated on a connected
  folder (`disabled={!isConnected}` in `TabRenderer`), so nothing can be edited,
  archived or created in memory.
- **The connected path is opt-in only.** `loadSampleData` writes real files, so
  it is never automatic: the user clicks, and every record is tagged `sample`.

## How it loads

| Mechanism | Why |
|---|---|
| `public/sample-data/ledger.json` fetched on demand | 28 KB of inert records with no runtime imports. A dynamic `import()` deadlocks Turbopack in a static export (the promise never settles, no console error, no network request), and bundling it would cost every route ~2 KB gzip. Plain HTTP sidesteps both. |
| `src/data/sample-data/ledger.ts` | Typed view of that JSON, so TypeScript still checks the shape. `resolveJsonModule` is on. |
| `scripts/emit-sample-data.mjs` | Regenerates the JSON. |

Reads go through `ownlyStoreRouter`, which is the default store for **both**
repositories. `PlannerFileStore` and `MarkdownFileStore` are structurally
identical, so one router serves both without either repository changing how it
resolves its default.

## The dataset

One coherent story — a traveller who owns a few things, pays for a few services,
went on three trips, and reviewed two of them.

| | Count |
|---|---|
| Physical objects | 5 (3 in use, 1 idle, 1 considering) |
| Subscriptions | 4 (3 active, 1 cancelled) |
| Travel experiences | 3 |
| Account snapshots | 6, spanning 2026-03 → 2026-08 |
| Reviews | 5 (2 trip retrospectives, 2 exits, 1 monthly) |

Sized against real constraints, not guesswork:

- Snapshots span several months with the earlier ones `is_month_end`, which is
  the **only** way `findPreviousMonthEndSnapshot` yields a Δ — without it the
  Home net-worth card has nothing to compare.
- The latest snapshot carries two liabilities with `due_date`, so the repayment
  panel shows both its overdue and upcoming buckets.
- Reviews use `*_score` (0-100), never the legacy `*_rank` fields that
  `migrateReviewEntry` would rewrite on every read.
- One experience is deliberately **unreviewed**, so the Reviews tab opens with a
  live action instead of a finished list.
- Counts stay well inside the free-tier limits (`objects: 200, snapshots: 30,
  reviews: 100`) so a sample loaded on Obsidian cannot trip the capacity guard.

## Quality gate

`npm run test:samples` — 30 assertions in `sample-data.test.ts` covering schema
validity (0 errors *and* 0 warnings), `net_worth` arithmetic against the
balances Doctor re-derives, `review_ref` ↔ `target_id` agreement in both
directions, expense items summing to `actual_total`, and non-zero Home metrics.

`src/services/seedDemoMode.test.ts` — 10 assertions on the load path, including
"writes nothing to the filesystem store" and "every seeded day is still
`feasible`".

`npm run smoke:demo-mode` — drives the built app in Chromium and asserts all
five tabs render real content and the session stays read-only.

> The smoke test serves the export through `tests/smoke/static-server.mjs`.
> Python's `http.server` stalls under Chromium's parallel chunk loading, which
> surfaces as phantom `status: 0` fetch failures and makes the test flaky.

## Adding a record

1. Edit `src/data/sample-data/ledger.ts`.
2. `npx tsx scripts/emit-sample-data.mjs`
3. `npm run test:samples && npm run smoke:demo-mode`

Step 1 keeps the type checking; step 2 keeps runtime and types in sync; step 3
is the gate. Editing the JSON directly also works — the tests will tell you if
it drifted.