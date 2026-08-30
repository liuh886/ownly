import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseMarkdownEntity } from '../../src/data/frontmatter';
import {
  type PlannerTripLeg,
  type PlannerTripPlace,
  type TripExpenseItem,
} from '../../src/domain/planner';

export const PLANNER_DIRECTORIES = {
  trips: 'Trips',
  places: 'Trip Places',
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
      // invalid files are surfaced by ownly_doctor-style checks, not fatal here
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
export function listPlannerLegs(dataLocation: string) {
  return readPlannerDir<PlannerTripLeg>(dataLocation, PLANNER_DIRECTORIES.legs, 'trip_leg');
}
export function listPlannerBookings(dataLocation: string) {
  return readPlannerDir(dataLocation, PLANNER_DIRECTORIES.expenses, 'trip_expense');
}
export function listPlannerExpenses(dataLocation: string) {
  return readPlannerDir<TripExpenseItem>(dataLocation, PLANNER_DIRECTORIES.expenses, 'trip_expense');
}

/** sha256 of file bytes; used as a conflict guard between prepare and commit. */
export function plannerFingerprint(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function assertPlannerUnchanged(filePath: string, expected: string): void {
  if (!existsSync(filePath)) {
    throw new Error(`CONFLICT:${filePath} no longer exists`);
  }
  const actual = plannerFingerprint(filePath);
  if (actual !== expected) {
    throw new Error(`CONFLICT:${filePath} changed after preparation`);
  }
}

export function findPlannerEntry<T extends object>(
  entries: PlannerEntry<T>[],
  id: string,
): PlannerEntry<T> | undefined {
  return entries.find((entry) => (entry.frontmatter as { id?: string }).id === id);
}

/** Pure transform: schedule a place on a date with an explicit order. */
export function schedulePlaceOnDate(
  place: PlannerTripPlace,
  date: string,
  sortOrder: number,
): PlannerTripPlace {
  return {
    ...place,
    state: 'scheduled',
    scheduled_date: date,
    sort_order: sortOrder,
    locked: true,
  };
}

/** Pure transform: send a place back to the research pool. */
export function returnPlaceToPool(place: PlannerTripPlace): PlannerTripPlace {
  return {
    ...place,
    state: 'candidate',
    scheduled_date: undefined,
    scheduled_start: undefined,
    sort_order: undefined,
  };
}

/**
 * Pure transform: move one scheduled place within its day by ±1 position.
 * Returns the updated places array, or null when the move is out of bounds.
 */
export function reorderDayPlace(
  dayPlaces: PlannerTripPlace[],
  placeId: string,
  delta: -1 | 1,
): PlannerTripPlace[] | null {
  const index = dayPlaces.findIndex((p) => p.id === placeId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= dayPlaces.length) return null;
  const next = [...dayPlaces];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next.map((p, i) => ({ ...p, sort_order: i }));
}
