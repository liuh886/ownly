import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseMarkdownEntity } from '../../src/data/frontmatter';
import {
  type PlannerTripLeg,
  type PlannerTripPlace,
  type TripExpenseItem,
} from '../../src/domain/planner';
import type { PlannerTripVisit } from '../../src/domain/planner-visits';

export const PLANNER_DIRECTORIES = {
  trips: 'Trips',
  places: 'Trip Places',
  visits: 'Trip Visits',
  legs: 'Trip Legs',
  expenses: 'Trip Expenses',
} as const;

export interface PlannerEntry<T extends object = Record<string, unknown>> {
  fileName: string;
  filePath: string;
  frontmatter: T;
  body: string;
}

function readPlannerDir<T extends object>(
  dataLocation: string,
  directory: string,
  expectedType: string,
): PlannerEntry<T>[] {
  const dir = join(resolve(dataLocation), directory);
  if (!existsSync(dir)) return [];
  const entries: PlannerEntry<T>[] = [];
  for (const fileName of readdirSync(dir)) {
    if (!fileName.endsWith('.md')) continue;
    const filePath = join(dir, fileName);
    try {
      const raw = readFileSync(filePath, 'utf8');
      const parsed = parseMarkdownEntity<Record<string, unknown>>(raw);
      if (parsed.frontmatter.type !== expectedType) continue;
      entries.push({ fileName, filePath, frontmatter: parsed.frontmatter as unknown as T, body: parsed.body });
    } catch {
      // Invalid files are surfaced by integrity checks, not fatal here.
    }
  }
  return entries.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

export function listPlannerTrips(dataLocation: string) {
  return readPlannerDir<Record<string, unknown>>(dataLocation, PLANNER_DIRECTORIES.trips, 'trip');
}
export function listPlannerPlaces(dataLocation: string) {
  return readPlannerDir<PlannerTripPlace>(dataLocation, PLANNER_DIRECTORIES.places, 'trip_place');
}
export function listPlannerVisits(dataLocation: string) {
  return readPlannerDir<PlannerTripVisit>(dataLocation, PLANNER_DIRECTORIES.visits, 'trip_visit');
}
export function listPlannerLegs(dataLocation: string) {
  return readPlannerDir<PlannerTripLeg>(dataLocation, PLANNER_DIRECTORIES.legs, 'trip_leg');
}
export function listPlannerExpenses(dataLocation: string) {
  return readPlannerDir<TripExpenseItem>(dataLocation, PLANNER_DIRECTORIES.expenses, 'trip_expense');
}

/** sha256 of file bytes; used as a conflict guard between prepare and commit. */
export function plannerFingerprint(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function assertPlannerUnchanged(filePath: string, expected: string): void {
  if (!existsSync(filePath)) throw new Error(`CONFLICT:${filePath} no longer exists`);
  const actual = plannerFingerprint(filePath);
  if (actual !== expected) throw new Error(`CONFLICT:${filePath} changed after preparation`);
}

export function findPlannerEntry<T extends object>(
  entries: PlannerEntry<T>[],
  id: string,
): PlannerEntry<T> | undefined {
  return entries.find((entry) => (entry.frontmatter as { id?: string }).id === id);
}
