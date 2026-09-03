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
} from './cli/planner-storage';
import { checkPlannerIntegrity } from '../src/domain/planner-integrity';

function printReport(report: ReturnType<typeof checkPlannerIntegrity>): void {
  const { issues, summary } = report;
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
      if (issue.details) for (const [k, v] of Object.entries(issue.details)) console.log(`     ${k}: ${v}`);
    }
  }
  if (warnings.length > 0) {
    console.log('\n─── WARNINGS ─────────────────────────────────────────────────');
    for (const issue of warnings) {
      console.log(`\n  ⚠️  [${issue.category}] ${issue.message}`);
      if (issue.details) for (const [k, v] of Object.entries(issue.details)) console.log(`     ${k}: ${v}`);
    }
  }
  if (infos.length > 0) {
    console.log('\n─── INFO ─────────────────────────────────────────────────────');
    for (const issue of infos) console.log(`\n  ℹ️  [${issue.category}] ${issue.message}`);
  }
  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

function main(): void {
  const dataLocation = process.argv[2];
  if (!dataLocation) {
    console.error('Usage: npx tsx scripts/data-integrity.ts <data-folder-path>');
    process.exit(1);
  }
  console.log(`Checking data integrity at: ${dataLocation}\n`);
  const trips = listPlannerTrips(dataLocation);
  const places = listPlannerPlaces(dataLocation);
  const visits = listPlannerVisits(dataLocation);
  console.log(`Loaded: ${trips.length} trips, ${places.length} places, ${visits.length} visits`);
  const report = checkPlannerIntegrity({
    trips: trips.map((t) => ({ id: String((t.frontmatter as Record<string, unknown>).id ?? t.fileName) })),
    places: places.map((p) => p.frontmatter as unknown as import('../src/domain/planner').PlannerTripPlace),
    visits: visits.map((v) => v.frontmatter as unknown as import('../src/domain/planner-visits').PlannerTripVisit),
  });
  printReport(report);
  if (report.summary.errors > 0) process.exit(1);
}

main();
