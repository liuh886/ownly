# Ownly Pro Travel Insights Spec

## Objective

Build the first clearly premium Ownly Pro experience around `看世界`: when reviewing travel experiences, users can see a restrained world map and travel statistics derived from their local Markdown data.

This feature must feel native in Obsidian, remain local-first, and reuse the same data and UI contracts in the Web runtime.

## Product Positioning

- Free: record travel experiences, review scores, and basic `看世界` list.
- Pro: unlock visual reflection through a world map, visited-place statistics, and travel quality/cost insights.
- Tone: quiet, editorial, and personal. Avoid gamified badges, noisy gradients, or decorative map clutter.

## Data Model Requirements

Extend `OneTimeExperienceObject.location` without breaking existing notes:

```ts
location?: {
  country?: string;
  region?: string;
  city?: string;
  country_code?: string;
  latitude?: number;
  longitude?: number;
};
```

Rules:

- `country`, `region`, and `city` remain human-readable Markdown fields.
- `country_code` should use ISO 3166-1 alpha-2 where known.
- `latitude` and `longitude` are optional; the feature must degrade gracefully without them.
- No automatic external geocoding in the first Pro slice. Users or import tools may add coordinates later.
- Existing `travel_worldview` objects without coordinates must still appear in statistics.

## Pro Surface

Add a `TravelInsightsPanel` in the review tab near `看世界`.

It should show:

- World map with visited countries/points.
- Count of completed or reviewed travel experiences.
- Countries/regions/cities visited.
- Total actual travel spend and average spend per trip when `actual_total` exists.
- Average food/scenery/experience ranking from related reviews.
- Recent travel timeline.

## Map Design

Initial implementation should prefer an embedded SVG world map or lightweight internal GeoJSON asset rather than a heavy map SDK.

Constraints:

- No required network calls.
- No Mapbox/Google Maps dependency.
- No user data leaves the Vault.
- Works inside Obsidian `ItemView` and Web.
- Accessible fallback list is mandatory when map geometry is unavailable.

Visual direction:

- Stone/ink base palette.
- One restrained accent for visited places.
- Subtle country fill or pin marks, not bright heatmaps.
- No zoom-heavy GIS controls in v1.

## Architecture

Add shared domain helpers first:

- `getTravelExperiences(objects)`
- `getTravelReviewStats(objects, reviews)`
- `buildTravelMapPoints(experiences)`
- `buildTravelSummary(experiences, reviews)`

Then add shared React components:

- `TravelInsightsPanel`
- `TravelStatsStrip`
- `TravelWorldMap`
- `TravelTimeline`

The Obsidian shell must not fork the feature. It should receive the same component through `AppShell`.

## Membership Gate

Use `canUseWYQDProFeature(membership)`.

Free users should see:

- Basic `看世界` list remains usable.
- A compact locked preview of map/stat cards.
- Clear upgrade copy, not a blocking modal.

Pro users should see:

- Full map.
- Full statistics.
- Travel timeline and ranking insights.

## Implementation Slices

1. Add data model fields, sample travel location data, and domain aggregation helpers.
2. Add locked/unlocked `TravelInsightsPanel` with statistics only, no map dependency.
3. Add lightweight SVG map/pin rendering with accessible fallback.
4. Wire panel into `ReviewHome`.
5. Validate Web build, Obsidian build, and release package.

## Acceptance Criteria

- `npm run validate` passes.
- Obsidian plugin runs without localhost, iframe, or external map service.
- Existing travel notes without coordinates still render.
- New travel location fields serialize to Markdown frontmatter.
- Free and Pro states render distinct, polished surfaces.
- Map is readable in narrow Obsidian panes and on mobile Web.
