#!/usr/bin/env node

/**
 * Ownly Data Integrity Doctor
 *
 * Checks for:
 * 1. Orphan Visits — visits referencing non-existent places
 * 2. Orphan Places — places not referenced by any active visit
 * 3. Duplicate Identities — places with same strong identity in same trip
 * 4. Missing Source Identity — places without source_place_id or source_url
 * 5. Kind Mismatch — places with invalid or deprecated kind values
 */

import {
  listPlannerPlaces,
  listPlannerTrips,
  listPlannerVisits,
  type PlannerEntry,
} from './cli/planner-storage';
import { getStrongPlaceIdentityEvidence } from '../src/domain/place-identity';
import type { PlannerTripPlace } from '../src/domain/planner';
import type { PlannerTripVisit } from '../src/domain/planner-visits';

interface IntegrityIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  details?: Record<string, unknown>;
}

function checkOrphanVisits(
  places: PlannerEntry<PlannerTripPlace>[],
  visits: PlannerEntry<PlannerTripVisit>[],
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const placeIds = new Set(places.map((p) => p.frontmatter.id));

  for (const visit of visits) {
    const placeId = visit.frontmatter.place_id as string;
    if (placeId && !placeIds.has(placeId)) {
      issues.push({
        severity: 'error',
        category: 'orphan_visit',
        message: `Visit "${visit.frontmatter.id}" references missing place "${placeId}"`,
        details: {
          visit_id: visit.frontmatter.id,
          place_id: placeId,
          trip_id: visit.frontmatter.trip_id,
          date: visit.frontmatter.date,
          file: visit.fileName,
        },
      });
    }
  }
  return issues;
}

function checkOrphanPlaces(
  places: PlannerEntry<PlannerTripPlace>[],
  visits: PlannerEntry<PlannerTripVisit>[],
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const visitedPlaceIds = new Set(
    visits
      .map((v) => v.frontmatter.place_id as string)
      .filter(Boolean),
  );

  for (const place of places) {
    const isActive = place.frontmatter.state !== 'dropped';
    const isVisited = visitedPlaceIds.has(place.frontmatter.id);
    if (isActive && !isVisited) {
      issues.push({
        severity: 'warning',
        category: 'orphan_place',
        message: `Place "${place.frontmatter.title}" (${place.frontmatter.id}) has no active visits`,
        details: {
          place_id: place.frontmatter.id,
          title: place.frontmatter.title,
          trip_id: place.frontmatter.trip_id,
          state: place.frontmatter.state,
          file: place.fileName,
        },
      });
    }
  }
  return issues;
}

function checkDuplicateIdentities(
  places: PlannerEntry<PlannerTripPlace>[],
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];

  // Group places by trip
  const byTrip = new Map<string, PlannerEntry<PlannerTripPlace>[]>();
  for (const place of places) {
    const tripId = place.frontmatter.trip_id;
    if (!tripId) continue;
    if (!byTrip.has(tripId)) byTrip.set(tripId, []);
    byTrip.get(tripId)!.push(place);
  }

  for (const [tripId, tripPlaces] of byTrip) {
    // Build identity map
    const identityMap = new Map<string, PlannerEntry<PlannerTripPlace>[]>();
    for (const place of tripPlaces) {
      const evidence = getStrongPlaceIdentityEvidence({
        source_provider: place.frontmatter.source_provider,
        source_place_id: place.frontmatter.source_place_id,
        source_url: place.frontmatter.source_url,
      });
      for (const e of evidence) {
        if (!identityMap.has(e.key)) identityMap.set(e.key, []);
        identityMap.get(e.key)!.push(place);
      }
    }

    // Find duplicates
    for (const [key, group] of identityMap) {
      if (group.length > 1) {
        const unique = new Set(group.map((g) => g.frontmatter.id));
        if (unique.size > 1) {
          issues.push({
            severity: 'warning',
            category: 'duplicate_identity',
            message: `Trip "${tripId}" has ${unique.size} places with identity "${key}"`,
            details: {
              trip_id: tripId,
              identity_key: key,
              place_ids: Array.from(unique),
              titles: group.map((g) => g.frontmatter.title),
            },
          });
        }
      }
    }
  }
  return issues;
}

function checkMissingIdentity(
  places: PlannerEntry<PlannerTripPlace>[],
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  for (const place of places) {
    const hasSourceId = Boolean(place.frontmatter.source_place_id?.trim());
    const hasSourceUrl = Boolean(place.frontmatter.source_url?.trim());
    if (!hasSourceId && !hasSourceUrl) {
      issues.push({
        severity: 'info',
        category: 'missing_identity',
        message: `Place "${place.frontmatter.title}" has no source_place_id or source_url`,
        details: {
          place_id: place.frontmatter.id,
          title: place.frontmatter.title,
          file: place.fileName,
        },
      });
    }
  }
  return issues;
}

function checkKindValidity(
  places: PlannerEntry<PlannerTripPlace>[],
): IntegrityIssue[] {
  const validKinds = new Set([
    'attraction', 'food', 'cafe', 'stay', 'shopping',
    'transit', 'experience', 'service', 'other',
  ]);
  const issues: IntegrityIssue[] = [];
  for (const place of places) {
    const kind = place.frontmatter.kind;
    if (kind && !validKinds.has(kind)) {
      issues.push({
        severity: 'warning',
        category: 'invalid_kind',
        message: `Place "${place.frontmatter.title}" has invalid kind "${kind}"`,
        details: {
          place_id: place.frontmatter.id,
          title: place.frontmatter.title,
          kind,
          file: place.fileName,
        },
      });
    }
  }
  return issues;
}

function printReport(issues: IntegrityIssue[], summary: Record<string, number>): void {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Ownly Data Integrity Report');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Summary: ${summary.trips} trips, ${summary.places} places, ${summary.visits} visits\n`);

  if (issues.length === 0) {
    console.log('✅ No issues found.\n');
    return;
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos = issues.filter((i) => i.severity === 'info');

  console.log(`Found: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} info\n`);

  if (errors.length > 0) {
    console.log('─── ERRORS ───────────────────────────────────────────────────');
    for (const issue of errors) {
      console.log(`\n  ❌ [${issue.category}] ${issue.message}`);
      if (issue.details) {
        for (const [k, v] of Object.entries(issue.details)) {
          console.log(`     ${k}: ${v}`);
        }
      }
    }
  }

  if (warnings.length > 0) {
    console.log('\n─── WARNINGS ─────────────────────────────────────────────────');
    for (const issue of warnings) {
      console.log(`\n  ⚠️  [${issue.category}] ${issue.message}`);
      if (issue.details) {
        for (const [k, v] of Object.entries(issue.details)) {
          console.log(`     ${k}: ${v}`);
        }
      }
    }
  }

  if (infos.length > 0) {
    console.log('\n─── INFO ─────────────────────────────────────────────────────');
    for (const issue of infos) {
      console.log(`\n  ℹ️  [${issue.category}] ${issue.message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

function main(): void {
  const dataLocation = process.argv[2];
  if (!dataLocation) {
    console.error('Usage: npx tsx scripts/data-integrity.ts <data-folder-path>');
    console.error('Example: npx tsx scripts/data-integrity.ts /path/to/Ownly');
    process.exit(1);
  }

  console.log(`Checking data integrity at: ${dataLocation}\n`);

  const trips = listPlannerTrips(dataLocation);
  const places = listPlannerPlaces(dataLocation);
  const visits = listPlannerVisits(dataLocation);

  console.log(`Loaded: ${trips.length} trips, ${places.length} places, ${visits.length} visits`);

  const issues: IntegrityIssue[] = [
    ...checkOrphanVisits(places, visits),
    ...checkOrphanPlaces(places, visits),
    ...checkDuplicateIdentities(places),
    ...checkMissingIdentity(places),
    ...checkKindValidity(places),
  ];

  printReport(issues, {
    trips: trips.length,
    places: places.length,
    visits: visits.length,
  });

  // Exit with error if any errors found
  if (issues.some((i) => i.severity === 'error')) {
    process.exit(1);
  }
}

main();
