# Onboarding — one path, not four dialogs

> Status: implemented. Owner: Web/PWA + Obsidian.
> Related: [SAMPLE_TRIPS.md](SAMPLE_TRIPS.md),
> [PRODUCT_GOVERNANCE.md](PRODUCT_GOVERNANCE.md).

## The problem this replaced

A new user used to meet up to four independent interruptions, each gated by its
own `localStorage` heuristic and each with no knowledge of the others:

1. `WebDataOnboarding` — choose a storage location
2. `CaptureOnboarding` — a "30 seconds" Capture → Collection → Planner explainer,
   shown on an empty home tab
3. `FirstObjectOnboarding` — a "record your first real object" chooser
4. `EmptyOwnlyDataBanner` — a fourth surface for the same empty state

Steps 2 and 3 competed for the same empty dataset, so a user could dismiss one
and immediately meet the other. None of them showed the product doing anything.
Meanwhile the Planner's own empty state (`PlannerHome`) was a headline and a
single button, and `CreateTripModal`'s import tab asked a new user to paste
`{"kind": "ownly.trip.bundle", …}`.

Net effect: after choosing a folder, every screen was empty and every explanation
was abstract.

## The mental model (one sentence)

**Collect → Curate → Plan**
（收集 → 整理 → 规划）

Capture saves places you see, Collection keeps the ones worth keeping, Planner
turns them into days you can actually follow. All three read and write the same
plain Markdown in one Ownly data folder.

## The path now

`src/core/first-run.ts` is the single authority. It returns one
`FirstRunStep | null` — never two competing prompts — and storage selection stays
in the shell, which owns the directory picker and the privacy copy.

```
connected + loaded + genuinely empty
        │
        ├─ explainer already seen ─────────────► first-record
        └─ first run ───► model ──► first-record
                                        │
                                        ├─ 3 real object choices  (physical / 订阅 / 体验)
                                        └─ or open a Sample Trip
```

Once the user has any content — including a Sample Trip, which is a real trip in
their own folder — the guide goes silent. `EmptyOwnlyDataBanner` remains as the
always-reachable way back in after a dismissal.

## Sample Trips

Three bundled itineraries are offered on the Planner's empty state and from the
first-record step. They are the answer to "what is this for?" and to the empty
import textarea: the card says exactly what will arrive (days, stops, research
pool size) and states that nothing is written until a click.

| Trip | Route | Days | Stops | Pool |
|---|---|---|---|---|
| 泰国 6 日 | 曼谷 · 清迈 · 昆明 | 6 | 13 | 3 |
| 中国 8 日 | 北京 · 西安 · 重庆 · 成都 | 8 | 18 | 3 |
| 日本关西 6 日 | 大阪 · 京都 · 奈良 | 6 | 12 | 3 |

Details, authoring rules, and the data-quality gate live in
[SAMPLE_TRIPS.md](SAMPLE_TRIPS.md).

## Analytics

The Planner path is measurable, aggregate-only
([ANALYTICS_EVENTS.md](ANALYTICS_EVENTS.md)):

```
onboarding_opened → local_data_connected → sample_trip_loaded
                                          → first_trip_created
                                          → first_day_scheduled
```

`sample_trip_loaded.id` is the shipped `SAMPLE_TRIP_IDS` enum, never anything
derived from user data.

## Acceptance

- [x] One first-run dialog, not two competing ones — enforced by
      `resolveFirstRunStep` returning a single value
- [x] A user who already dismissed the explainer is never shown it again
      (`captureExplainerSeen`, including the legacy key)
- [x] Setup is satisfied by a Sample Trip, so it is not nagged afterwards
- [x] Loading is always an explicit click; no auto-seed path exists
- [x] Every day of every Sample Trip evaluates to `feasible`; Doctor reports
      0 errors and 0 warnings
- [x] A loaded Sample Trip deletes in one tap and leaves siblings untouched
- [x] Planner creation form no longer shows timezone settings by default
- [ ] Usability test: 3 first-time users can state the Collect → Curate → Plan
      relationship and name what a Sample Trip is

## Known gaps

- `docs/USER_GUIDE.md` does not yet cover Sample Trips.
- The retired `CaptureOnboarding` component and its
  `ownly:capture-onboarding:dismissed` key are read but no longer written
  outside `AppShell`; the key can be dropped once the retention window passes.
- `src/data/cities.json` still stores some Japanese readings in its `cn` field
  for cities with no Chinese name (Bangkok → `バンコク`). The generator
  (`scripts/build-cities.mjs`) now prefers a Han name, and
  `cityDisplayName` refuses to show a wrong-script name, but **search recall**
  for a Chinese query is still limited until the file is regenerated from
  GeoNames.
