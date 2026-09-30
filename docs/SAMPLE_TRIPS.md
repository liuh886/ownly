# Ownly Sample Trips

A **Sample Trip** (示例行程) is a complete itinerary that ships with Ownly and a
new user can load in one click from the Planner's empty state.

It exists for one reason: an empty Planner is unreadable. Before Sample Trips, a
new user met a form asking for a title and two dates, and no way to know what
the product was for. A Sample Trip shows the finished thing first — places on a
map, a day-by-day timeline, travel legs, a budget ledger — and can then be taken
apart.

## Contract

Loading is **always deliberate**. Nothing is written to the Ownly data folder
until the user clicks a card. This is the "no silent demo writes" rule from
`docs/PRODUCT_GOVERNANCE.md`, and it is enforced structurally: there is no
auto-seed path anywhere in the codebase.

A loaded Sample Trip is an **ordinary trip**:

- it carries the `sample` tag and shows a 🧪 badge in Trip management;
- it is plain Markdown in the user's own data folder, editable everywhere;
- it deletes in one tap, cascading its places, visits, legs and expenses;
- loading the same Sample Trip twice produces two independent trips, because
  `instantiateTripBundle` regenerates every id.

## How it is built

| File | Role |
|---|---|
| `src/data/sample-trips/build.ts` | Compact authoring surface; expands a spec into a full `ownly.trip.bundle` v1 payload |
| `src/data/sample-trips/thailand.ts` · `china.ts` · `kansai.ts` | The three itineraries |
| `src/data/sample-trips/registry.ts` | Card metadata only — the data modules are **not** imported here |
| `src/data/sample-trips/load.ts` | One dynamic `import()` per trip |
| `src/services/loadSampleTrip.ts` | Click → import → restore members → seed expenses |
| `src/services/importTripBundle.ts` | The shared "bring a trip in from outside" path |

The registry deliberately holds metadata only. `PlannerHome` renders the picker on
an empty folder, and the three itineraries are ~100 KB of JSON together; a static
import would spend the remaining `/app/` gzip budget on data nobody has asked for
yet. Each trip is its own chunk, fetched only on click, and `validate:pages` does
not count assets that `index.html` does not reference.

### A Sample Trip is not a special import path

`loadSampleTrip` calls the same `importTripBundle` a shared link or a pasted
`.ownly-trip.json` file uses. Two things the bundle schema cannot carry are
re-applied afterwards, both deliberately:

- **`members`** — `instantiateTripBundle` clears it, because a trip shared by one
  person must not carry that person's ledger participants into someone else's
  data folder. A Sample Trip has no sharer, so the loader passes them back.
  Without this the budget ledger would render with nobody to settle between.
- **expenses** — `ownly.trip.bundle` sets `privacy.expenses: 'excluded'` for the
  same reason. A Sample Trip is ours, so its ledger is written afterwards through
  the public `upsertExpense` path.

## Data rules

Authoring is constrained, and `src/data/sample-trips/sample-trips.test.ts`
enforces every rule below. A failure there means a new user would have seen a
broken itinerary.

1. **At most 3 stops per day.** A day a reader can hold in their head.
2. **Every stop has an explicit `start` and `duration_minutes`.** Inferred starts
   make a timeline look unfinished.
3. **Every consecutive pair inside a day has a leg.** A missing leg is
   `travel_time_missing`, which downgrades the day to `unknown` — the "we don't
   know" state, which is the wrong first impression.
4. **Every day reaches `status === 'feasible'`**: 0 time overlaps, 0 travel
   conflicts, 0 opening-hours warnings, load below `heavy`, and a real lunch and
   dinner gap.
5. **Every place resolves to a trip destination**, never `未分类城市`.
6. **Doctor reports 0 errors and 0 warnings.** The only permitted `info` issues
   are `orphan_place` — the research pool, which every Sample Trip ships on
   purpose.
7. **`open_hours` always carries a weekday qualifier.** This is load-bearing:
   `parseDailyOpeningRange` returns `null` — and fails open — as soon as it sees
   `周X` / `月曜`, so a qualified string can still report a genuine `周一闭馆`
   while never mis-parsing a range it does not own.

### Prices and ratings

Prices are **published standard admission rates**, recorded once as a static
baseline with `observed_at: 2026-09-30`. They are not live observations and will
drift with the venue. Ratings are included for the same illustrative purpose.

`source_place_id` is deliberately **absent**. A fabricated Google Place ID would
become strong identity evidence (`src/domain/place-identity.ts`) and could
auto-merge two genuinely different venues later. Instead each place carries a
resolvable Google Maps search URL, so "open in Maps" works and no identity
evidence is invented.

## The three itineraries

### 泰国 6 日 · 曼谷 · 清迈 · 昆明 — `2026-11-14` → `2026-11-19`

Beijing is the departure city, so it carries no stops; Kunming is the return hub.
13 stops, 7 legs, 3 research-pool candidates.

Calendar-driven choices:

- **D2 is a Sunday** so 恰图恰周末市集 (weekend-only) can be scheduled at all. It
  stays honest about the constraint via `open_hours` and `risks`.
- **D5/D6 carry `day_timezones: Asia/Shanghai`** while the trip zone is
  `Asia/Bangkok` — the cross-timezone calendar export, demonstrated rather than
  described.
- 清迈周日夜市 is a research-pool candidate, not a stop, because the sample is in
  清迈 on a Tuesday. The pool is where a real constraint belongs.

### 中国 8 日 · 北京 · 西安 · 重庆 · 成都 — `2026-12-05` → `2026-12-12`

Four inland cities, so one arrival evening plus one content day each. 18 stops,
10 legs, 11 ledger entries, 3 candidates.

- **陕西历史博物馆 is on D2 (Sunday), not D3.** It closes on Mondays and 12-07 is
  a Monday. 故宫 also closes on Mondays; 12-05 is a Saturday.
- Ledger spans `CNY` and one `stay` block, so category breakdown and AA
  settlement both have something to show.

### 日本关西 6 日 · 大阪 · 京都 · 奈良 — `2027-01-02` → `2027-01-07`

The JR rail triangle. 12 stops, 6 legs, 3 candidates.

- 伏见稻荷 is scheduled at **08:00**, which is the entire point of that place.
- 大阪城's `open_hours` records its New Year closure.
- **日本环球影城 stays in the research pool** with `reservation_status: 'needed'`:
  it needs a dated ticket, which is exactly what a candidate pool is for.
  若草山 is pooled for the same reason — fixed 闭山日 that this itinerary misses.

## Date policy

Dates are **fixed**, so the shipped data is byte-stable and tests can assert
exact day counts. The cost is that they eventually describe a past trip.

```bash
npm run check:sample-dates
```

This is a **report, not a gate**. It is deliberately not wired into
`npm run validate`, because that would turn a content refresh into a CI outage
the day after the dates pass. Run it before a release; when it reports a stale
trip, re-author the dates in `src/data/sample-trips/*.ts` and re-run
`npm run test:samples`.

## Tests

| Command | Covers |
|---|---|
| `npm run test:samples` | Data quality gate + the full load path through a mocked filesystem |
| `npm run test:onboarding` | Prompt policy and copy for the picker and the first-run guide |

`src/services/loadSampleTrip.test.ts` proves the load path end to end: the trip
lands as Markdown, every day is still `feasible` after the round trip through
disk, the AA settlement produces transfers, and deleting one of two loaded copies
leaves the other intact.
