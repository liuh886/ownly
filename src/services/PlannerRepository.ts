import { parseMarkdownEntity, serializeMarkdownEntity } from '@/data/frontmatter';
import {
  assertTripDate,
  assertTripDates,
  detectSuspectedDuplicatePlaces,
  ensurePlaceKindTag,
  mergeCapturedPlaceResearch,
  plannerTripLegFileName,
  stablePlannerHash,
  type ImportReport,
  type ImportFailure,
  type PlannerTrip,
  type PlannerTripLeg,
  type PlannerTripPlace,
  type SuspectedDuplicatePair,
  type TripExpenseItem,
} from '@/domain/planner';
import { PlaceIdentityService, getStrongPlaceIdentityKeys, shareStrongPlaceIdentity } from '@/domain/place-identity';
import {
  createPlannerTripVisit,
  plannerTripVisitFileName,
  type PlannerTripVisit,
} from '@/domain/planner-visits';
import {
  buildTripCalendarIcs,
  buildDayCalendarIcs,
  createTripCalendarFeed,
  rotateTripCalendarFeed,
} from '@/domain/calendar-feed';
import type { PlannerTripCalendarFeed } from '@/domain/planner';
import { validatePlannerTiming } from '@/domain/planner-schedule';
import { migrateEntity } from '@/domain/migrations';
import { obsidianService } from './ObsidianFileSystemService';

export interface PlannerFileStore {
  getDataFolder(): Promise<string>;
  readMarkdownFiles(directory: string): Promise<{ fileName: string; content: string }[]>;
  writeMarkdownFile(directory: string, fileName: string, content: string): Promise<void>;
  deleteMarkdownFile(directory: string, fileName: string): Promise<void>;
}

export const PLANNER_DIRECTORIES = {
  trips: 'Trips',
  places: 'Trip Places',
  visits: 'Trip Visits',
  legs: 'Trip Legs',
  expenses: 'Trip Expenses',
} as const;

type PlannerEntity = PlannerTrip | PlannerTripPlace | PlannerTripVisit | PlannerTripLeg;
type PlannerEntityType = PlannerEntity['type'];

interface RepoExpense extends TripExpenseItem {
  schema_version: '0.1';
  type: 'trip_expense';
}

function toRepoExpense(expense: TripExpenseItem): RepoExpense {
  return { schema_version: '0.1', type: 'trip_expense', ...expense };
}

function fromRepoExpense(raw: Record<string, unknown>): TripExpenseItem {
  const expense = { ...raw } as Partial<RepoExpense>;
  delete expense.schema_version;
  delete expense.type;
  return expense as TripExpenseItem;
}

export interface ImportTraceEntry {
  input_id: string;
  title: string;
  action: 'created' | 'updated' | 'deduped' | 'failed' | 'unknown';
  reason: string;
  match_type?: 'id' | 'strong_identity';
  matched_id?: string;
  matched_title?: string;
  identity_key?: string;
}

function safeEntityId(id: string): string {
  const trimmed = id.trim();
  const safe = trimmed.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  const hasNonAscii = /[^\x00-\x7F]/.test(trimmed);
  if (!safe || hasNonAscii) {
    const hashStr = stablePlannerHash(trimmed);
    return safe ? `${safe.slice(0, 30)}-${hashStr}` : `entity-${hashStr}`;
  }
  return safe;
}

function entityFileName(entity: PlannerEntity): string {
  if (entity.type === 'trip_leg') return plannerTripLegFileName(entity.id);
  if (entity.type === 'trip_visit') return plannerTripVisitFileName(entity.id);
  const prefix = entity.type === 'trip' ? 'trip' : 'place';
  return `${prefix}--${safeEntityId(entity.id)}.md`;
}

function expenseFileName(expenseId: string): string {
  return `expense--${safeEntityId(expenseId)}.md`;
}

/** Current schema version for all planner entities. Bump when making breaking changes. */
export const CURRENT_SCHEMA_VERSION = '0.1';

export class PlannerRepository {
  private root = '';

  constructor(private readonly store: PlannerFileStore = obsidianService as PlannerFileStore) {}

  async initialize(): Promise<void> {
    this.root = await this.store.getDataFolder();
  }

  private directory(name: string): string {
    return this.root ? `${this.root}/${name}` : name;
  }

  private async list<T extends PlannerEntity>(directory: string, type: PlannerEntityType): Promise<T[]> {
    await this.initialize();
    const files = await this.store.readMarkdownFiles(this.directory(directory));
    const result: T[] = [];
    for (const file of files) {
      try {
        const parsed = parseMarkdownEntity<Record<string, unknown>>(file.content);
        if (parsed.frontmatter.type !== type) continue;
        const migrated = migrateEntity(parsed.frontmatter, CURRENT_SCHEMA_VERSION) as unknown as T;
        result.push(migrated);
      } catch {
        console.warn(`Skipping invalid Ownly planner file: ${file.fileName}`);
      }
    }
    return result;
  }

  async listTrips(): Promise<PlannerTrip[]> {
    return this.list<PlannerTrip>(PLANNER_DIRECTORIES.trips, 'trip');
  }

  async listPlaces(): Promise<PlannerTripPlace[]> {
    const places = await this.list<PlannerTripPlace>(PLANNER_DIRECTORIES.places, 'trip_place');
    return places.map((place) => ({ ...place, tags: ensurePlaceKindTag(place.tags, place.kind) }));
  }

  async listVisits(): Promise<PlannerTripVisit[]> {
    return this.list<PlannerTripVisit>(PLANNER_DIRECTORIES.visits, 'trip_visit');
  }

  async listLegs(): Promise<PlannerTripLeg[]> {
    return this.list<PlannerTripLeg>(PLANNER_DIRECTORIES.legs, 'trip_leg');
  }

  async listExpenses(): Promise<TripExpenseItem[]> {
    await this.initialize();
    const files = await this.store.readMarkdownFiles(this.directory(PLANNER_DIRECTORIES.expenses));
    const result: TripExpenseItem[] = [];
    for (const file of files) {
      try {
        const parsed = parseMarkdownEntity<Record<string, unknown>>(file.content);
        if (parsed.frontmatter.type !== 'trip_expense') continue;
        result.push(fromRepoExpense(parsed.frontmatter));
      } catch {
        console.warn(`Skipping invalid Ownly planner expense file: ${file.fileName}`);
      }
    }
    return result;
  }

  private async upsert(entity: PlannerEntity): Promise<void> {
    await this.initialize();
    const directory = entity.type === 'trip'
      ? PLANNER_DIRECTORIES.trips
      : entity.type === 'trip_place'
        ? PLANNER_DIRECTORIES.places
        : entity.type === 'trip_visit'
          ? PLANNER_DIRECTORIES.visits
          : PLANNER_DIRECTORIES.legs;
    await this.store.writeMarkdownFile(this.directory(directory), entityFileName(entity), serializeMarkdownEntity(entity, ''));
  }

  async upsertTrip(trip: PlannerTrip): Promise<void> { await this.upsert(trip); }
  async upsertPlace(place: PlannerTripPlace): Promise<void> {
    await this.upsert({ ...place, tags: ensurePlaceKindTag(place.tags, place.kind) });
  }
  async upsertVisit(visit: PlannerTripVisit): Promise<void> {
    const trip = (await this.listTrips()).find((t) => t.id === visit.trip_id);
    if (!trip) {
      throw new Error(`Planner trip "${visit.trip_id}" was not found for visit.`);
    }
    assertTripDate(trip, visit.date);
    await this.upsert(visit);
  }
  async upsertLeg(leg: PlannerTripLeg): Promise<void> { await this.upsert(leg); }

  async upsertPlaces(places: PlannerTripPlace[]): Promise<void> {
    for (const place of places) await this.upsertPlace(place);
  }

  private async importResearchPlaces(places: PlannerTripPlace[]): Promise<ImportReport> {
    const report: ImportReport = { received: places.length, created: [], updated: [], deduped: [], failed: [] };
    if (places.length === 0) return report;
    await this.initialize();
    const existingTrips = new Set((await this.listTrips()).map((t) => t.id));
    const existing = await this.listPlaces();
    const byId = new Map(existing.map((place) => [place.id, place] as const));
    const byStrongIdentity = new Map<string, PlannerTripPlace>();

    const indexPlace = (place: PlannerTripPlace) => {
      byId.set(place.id, place);
      const keys = getStrongPlaceIdentityKeys(place);
      const effective = keys.length > 0 ? keys : PlaceIdentityService.getResilientKeys(place as unknown as import('@/domain/place-identity').PlaceIdentityLike);
      for (const key of effective) {
        byStrongIdentity.set(`${place.trip_id}::${key}`, place);
      }
    };
    existing.forEach(indexPlace);
    const touchedTripIds = new Set<string>();

    for (const rawPlace of places) {
      if (!rawPlace.id) {
        report.failed.push({ id: '', title: rawPlace.title || '(unknown)', reason: 'missing_id' });
        continue;
      }
      if (!rawPlace.trip_id) {
        report.failed.push({ id: rawPlace.id, title: rawPlace.title || '(unknown)', reason: 'missing_trip_id' });
        continue;
      }
      if (!existingTrips.has(rawPlace.trip_id)) {
        report.failed.push({ id: rawPlace.id, title: rawPlace.title || '(unknown)', reason: 'unknown_trip', detail: rawPlace.trip_id });
        continue;
      }
      touchedTripIds.add(rawPlace.trip_id);
      const plannerFields: PlannerTripPlace = { ...rawPlace };
      delete (plannerFields as unknown as Record<string, unknown>).status;
      delete (plannerFields as unknown as Record<string, unknown>).reason;
      delete (plannerFields as unknown as Record<string, unknown>).lastAttempt;
      const incoming: PlannerTripPlace = {
        ...plannerFields,
        tags: ensurePlaceKindTag(rawPlace.tags, rawPlace.kind),
        reservation_status: rawPlace.reservation_status ?? 'none',
        state: 'candidate',
      };
      let existingPlace = byId.get(incoming.id);
      if (!existingPlace) {
        const sKeys = getStrongPlaceIdentityKeys(incoming);
        const effective = sKeys.length > 0 ? sKeys : PlaceIdentityService.getResilientKeys(incoming as unknown as import('@/domain/place-identity').PlaceIdentityLike);
        for (const key of effective) {
          const match = byStrongIdentity.get(`${incoming.trip_id}::${key}`);
          if (match) { existingPlace = match; break; }
        }
      }

      try {
        if (existingPlace) {
          const persisted = mergeCapturedPlaceResearch(existingPlace, incoming);
          await this.upsert(persisted);
          indexPlace(persisted);
          report.updated.push(rawPlace.id);
        } else {
          await this.upsert(incoming);
          indexPlace(incoming);
          report.created.push(rawPlace.id);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[PlannerRepository] Failed to import research place ${rawPlace.id} (${rawPlace.title}):`, error);
        report.failed.push({ id: rawPlace.id, title: rawPlace.title || '(unknown)', reason: 'write_error', detail: msg });
      }
    }

    for (const tripId of touchedTripIds) {
      try {
        const dedupResult = await this.deduplicateTripPlaces(tripId);
        if (dedupResult.removedCount > 0) {
          const allPlacesAfter = await this.listPlaces();
          const survivingIds = new Set(allPlacesAfter.map((p) => p.id));
          for (const id of [...report.created, ...report.updated]) {
            if (!survivingIds.has(id)) {
              report.deduped.push(id);
            }
          }
        }
      } catch (err) {
        console.warn(`[PlannerRepository] Auto-deduplication for trip ${tripId} encountered warning:`, err);
      }
    }

    if (report.failed.length > 0 || report.deduped.length > 0) {
      console.warn(`[PlannerRepository] Import report: ${report.created.length} created, ${report.updated.length} updated, ${report.deduped.length} deduped, ${report.failed.length} failed`, report.failed);
    }

    return report;
  }

  /**
   * Scans all places in a trip and auto-merges only proven strong identities.
   * merges their facts and visits into the primary place, and removes duplicate markdown records.
   */
  async deduplicateTripPlaces(tripId: string): Promise<{ mergedCount: number; removedCount: number }> {
    await this.initialize();
    const allPlaces = (await this.listPlaces()).filter((p) => p.trip_id === tripId);
    if (allPlaces.length <= 1) return { mergedCount: 0, removedCount: 0 };

    const visits = (await this.listVisits()).filter((v) => v.trip_id === tripId);
    const visitPlaceIds = new Set(visits.map((v) => v.place_id));

    const clusters: PlannerTripPlace[][] = [];
    const assigned = new Set<string>();

    for (let i = 0; i < allPlaces.length; i++) {
      const p1 = allPlaces[i];
      if (assigned.has(p1.id)) continue;
      const cluster = [p1];
      assigned.add(p1.id);

      for (let j = i + 1; j < allPlaces.length; j++) {
        const p2 = allPlaces[j];
        if (assigned.has(p2.id)) continue;
        const isMatch = shareStrongPlaceIdentity(p1, p2);

        if (isMatch) {
          cluster.push(p2);
          assigned.add(p2.id);
        }
      }
      if (cluster.length > 1) {
        clusters.push(cluster);
      }
    }

    let mergedCount = 0;
    let removedCount = 0;

    for (const cluster of clusters) {
      cluster.sort((a, b) => {
        const aScheduled = visitPlaceIds.has(a.id) ? 1 : 0;
        const bScheduled = visitPlaceIds.has(b.id) ? 1 : 0;
        if (aScheduled !== bScheduled) return bScheduled - aScheduled;
        return a.created_at.localeCompare(b.created_at);
      });

      const primary = cluster[0];
      let clusterMerged = false;
      for (let k = 1; k < cluster.length; k++) {
        await this.mergePlaces(primary.id, cluster[k].id);
        removedCount += 1;
        clusterMerged = true;
      }
      if (clusterMerged) mergedCount += 1;
    }

    return { mergedCount, removedCount };
  }

  async importCapturedPlaces(places: PlannerTripPlace[]): Promise<ImportReport> { return this.importResearchPlaces(places); }
  async importExternalCandidates(places: PlannerTripPlace[]): Promise<ImportReport> { return this.importResearchPlaces(places); }

  /**
   * Import with detailed per-place trace for debugging.
   * Returns the same ImportReport plus a trace array showing exactly what happened to each place.
   */
  async importWithTrace(places: PlannerTripPlace[]): Promise<ImportReport & { trace: ImportTraceEntry[] }> {
    const trace: ImportTraceEntry[] = [];
    const report: ImportReport = { received: places.length, created: [], updated: [], deduped: [], failed: [] };
    if (places.length === 0) return { ...report, trace };
    await this.initialize();
    const existingTrips = new Set((await this.listTrips()).map((t) => t.id));
    const existing = await this.listPlaces();
    const byId = new Map(existing.map((place) => [place.id, place] as const));
    const byStrongIdentity = new Map<string, PlannerTripPlace>();

    const indexPlace = (place: PlannerTripPlace) => {
      byId.set(place.id, place);
      const keys = getStrongPlaceIdentityKeys(place);
      const effective = keys.length > 0 ? keys : PlaceIdentityService.getResilientKeys(place as unknown as import('@/domain/place-identity').PlaceIdentityLike);
      for (const key of effective) {
        byStrongIdentity.set(`${place.trip_id}::${key}`, place);
      }
    };
    existing.forEach(indexPlace);
    const touchedTripIds = new Set<string>();

    for (const rawPlace of places) {
      const traceEntry: ImportTraceEntry = {
        input_id: rawPlace.id,
        title: rawPlace.title || '(unknown)',
        action: 'unknown',
        reason: '',
      };

      if (!rawPlace.id) {
        traceEntry.action = 'failed';
        traceEntry.reason = 'missing_id';
        report.failed.push({ id: '', title: rawPlace.title || '(unknown)', reason: 'missing_id' });
        trace.push(traceEntry);
        continue;
      }
      if (!rawPlace.trip_id) {
        traceEntry.action = 'failed';
        traceEntry.reason = 'missing_trip_id';
        report.failed.push({ id: rawPlace.id, title: rawPlace.title || '(unknown)', reason: 'missing_trip_id' });
        trace.push(traceEntry);
        continue;
      }
      if (!existingTrips.has(rawPlace.trip_id)) {
        traceEntry.action = 'failed';
        traceEntry.reason = `unknown_trip: ${rawPlace.trip_id}`;
        report.failed.push({ id: rawPlace.id, title: rawPlace.title || '(unknown)', reason: 'unknown_trip', detail: rawPlace.trip_id });
        trace.push(traceEntry);
        continue;
      }
      touchedTripIds.add(rawPlace.trip_id);
      const plannerFields: PlannerTripPlace = { ...rawPlace };
      delete (plannerFields as unknown as Record<string, unknown>).status;
      delete (plannerFields as unknown as Record<string, unknown>).reason;
      delete (plannerFields as unknown as Record<string, unknown>).lastAttempt;
      const incoming: PlannerTripPlace = {
        ...plannerFields,
        tags: ensurePlaceKindTag(rawPlace.tags, rawPlace.kind),
        reservation_status: rawPlace.reservation_status ?? 'none',
        state: 'candidate',
      };

      // Check for exact ID match to update if re-importing the same place
      let existingPlace: PlannerTripPlace | undefined = byId.get(incoming.id);
      if (existingPlace) {
        traceEntry.match_type = 'id';
        traceEntry.matched_id = existingPlace.id;
        traceEntry.matched_title = existingPlace.title;
      } else {
        const sKeys = getStrongPlaceIdentityKeys(incoming);
        const effective = sKeys.length > 0 ? sKeys : PlaceIdentityService.getResilientKeys(incoming as unknown as import('@/domain/place-identity').PlaceIdentityLike);
        for (const key of effective) {
          const match = byStrongIdentity.get(`${incoming.trip_id}::${key}`);
          if (match) { existingPlace = match; traceEntry.match_type = 'strong_identity'; traceEntry.matched_id = match.id; traceEntry.matched_title = match.title; traceEntry.identity_key = key; break; }
        }
      }

      try {
        if (existingPlace) {
          const persisted = mergeCapturedPlaceResearch(existingPlace, incoming);
          await this.upsert(persisted);
          indexPlace(persisted);
          traceEntry.action = 'updated';
          traceEntry.reason = `updated existing place ${existingPlace.id}`;
          report.updated.push(rawPlace.id);
        } else {
          await this.upsert(incoming);
          indexPlace(incoming);
          traceEntry.action = 'created';
          traceEntry.reason = 'new place imported';
          report.created.push(rawPlace.id);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        traceEntry.action = 'failed';
        traceEntry.reason = `write_error: ${msg}`;
        console.warn(`[PlannerRepository] Failed to import research place ${rawPlace.id} (${rawPlace.title}):`, error);
        report.failed.push({ id: rawPlace.id, title: rawPlace.title || '(unknown)', reason: 'write_error', detail: msg });
      }
      trace.push(traceEntry);
    }

    return { ...report, trace };
  }

  /**
   * Reconstructs missing places for orphan visits.
   * For each visit that references a non-existent place, creates a placeholder place
   * with the visit's title and basic info, and updates the visit to reference it.
   * 
   * Returns a report of reconstructed places and updated visits.
   */
  async reconstructOrphanPlaces(tripId?: string): Promise<{
    reconstructed: { placeId: string; visitId: string; title: string }[];
    failed: { visitId: string; reason: string }[];
  }> {
    await this.initialize();
    const allVisits = await this.listVisits();
    const allPlaces = await this.listPlaces();
    const placeIds = new Set(allPlaces.map((p) => p.id));

    // Filter orphan visits
    let orphanVisits = allVisits.filter((v) => v.place_id && !placeIds.has(v.place_id));
    if (tripId) {
      orphanVisits = orphanVisits.filter((v) => v.trip_id === tripId);
    }

    const reconstructed: { placeId: string; visitId: string; title: string }[] = [];
    const failed: { visitId: string; reason: string }[] = [];

    for (const visit of orphanVisits) {
      try {
        // Create a placeholder place based on the visit
        const placeId = `reconstructed-${visit.id}`;
        const now = new Date().toISOString();
        
        const placeholderPlace: PlannerTripPlace = {
          schema_version: '0.1',
          type: 'trip_place',
          id: placeId,
          trip_id: visit.trip_id,
          title: `Orphan Place (${visit.date})`,
          source_provider: 'other',
          source_url: '',
          kind: 'other',
          priority: 'want',
          tags: ['reconstructed'],
          state: 'candidate',
          reservation_status: 'none',
          signals: [],
          risks: [],
          created_at: now,
          updated_at: now,
        };

        await this.upsertPlace(placeholderPlace);

        // Update the visit to reference the new place
        const updatedVisit = {
          ...visit,
          place_id: placeId,
          updated_at: now,
        };
        await this.upsert(updatedVisit);

        reconstructed.push({ placeId, visitId: visit.id, title: placeholderPlace.title });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        failed.push({ visitId: visit.id, reason: msg });
        console.warn(`[PlannerRepository] Failed to reconstruct place for visit ${visit.id}:`, error);
      }
    }

    return { reconstructed, failed };
  }

  async importBundle(bundle: { trip: PlannerTrip; places: PlannerTripPlace[]; visits: PlannerTripVisit[]; legs: PlannerTripLeg[] }): Promise<ImportReport> {
    await this.initialize();
    const report: ImportReport = { received: bundle.places.length, created: [], updated: [], deduped: [], failed: [] };

    try {
      await this.upsertTrip(bundle.trip);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      report.failed.push({ id: bundle.trip.id, title: bundle.trip.title, reason: 'write_error', detail: msg });
      return report;
    }

    for (const place of bundle.places) {
      try {
        await this.upsertPlace(place);
        report.created.push(place.id);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        report.failed.push({ id: place.id, title: place.title || '(unknown)', reason: 'write_error', detail: msg });
      }
    }

    for (const visit of bundle.visits) {
      try {
        await this.upsertVisit(visit);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        report.failed.push({ id: visit.id, title: `Visit ${visit.place_id}`, reason: 'write_error', detail: msg });
      }
    }

    for (const leg of bundle.legs) {
      try {
        await this.upsertLeg(leg);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        report.failed.push({ id: leg.id, title: `Leg ${leg.from_place_id}→${leg.to_place_id}`, reason: 'write_error', detail: msg });
      }
    }

    if (report.failed.length > 0) {
      console.warn(`[PlannerRepository] Bundle import: ${report.created.length}/${report.received} created, ${report.failed.length} failed`, report.failed);
    }

    return report;
  }

  async dropPlace(placeId: string): Promise<boolean> {
    await this.initialize();
    const existing = (await this.listPlaces()).find((place) => place.id === placeId);
    if (!existing) return false;
    const blockingVisits = (await this.listVisits()).filter(
      (visit) => visit.trip_id === existing.trip_id && visit.place_id === placeId,
    );
    if (blockingVisits.length > 0) {
      throw new Error(`Cannot drop ${existing.title}: remove ${blockingVisits.length} scheduled visit(s) first.`);
    }
    await this.store.writeMarkdownFile(
      this.directory(PLANNER_DIRECTORIES.places),
      entityFileName(existing),
      serializeMarkdownEntity({ ...existing, state: 'dropped', updated_at: new Date().toISOString() }, ''),
    );
    return true;
  }

  async restorePlace(placeId: string): Promise<boolean> {
    await this.initialize();
    const existing = (await this.listPlaces()).find((place) => place.id === placeId);
    if (!existing) return false;
    await this.store.writeMarkdownFile(
      this.directory(PLANNER_DIRECTORIES.places),
      entityFileName(existing),
      serializeMarkdownEntity({ ...existing, state: 'candidate', updated_at: new Date().toISOString() }, ''),
    );
    return true;
  }

  async deletePlace(placeId: string): Promise<boolean> {
    await this.initialize();
    const existing = (await this.listPlaces()).find((place) => place.id === placeId);
    if (!existing) return false;
    const blockingVisits = (await this.listVisits()).filter(
      (visit) => visit.trip_id === existing.trip_id && visit.place_id === placeId,
    );
    if (blockingVisits.length > 0) {
      throw new Error(`Cannot delete ${existing.title}: remove ${blockingVisits.length} scheduled visit(s) first.`);
    }
    await this.store.deleteMarkdownFile(
      this.directory(PLANNER_DIRECTORIES.places),
      entityFileName(existing),
    );
    return true;
  }

  async deleteTrip(tripId: string): Promise<boolean> {
    await this.initialize();
    const trip = (await this.listTrips()).find((t) => t.id === tripId);
    if (!trip) return false;
    // cascade: places / visits / legs / expenses
    const [places, visits, legs, expenses] = await Promise.all([
      this.listPlaces(),
      this.listVisits(),
      this.listLegs(),
      this.listExpenses(),
    ]);
    for (const p of places.filter((x) => x.trip_id === tripId)) {
      await this.store.deleteMarkdownFile(this.directory(PLANNER_DIRECTORIES.places), entityFileName(p));
    }
    for (const v of visits.filter((x) => x.trip_id === tripId)) {
      await this.store.deleteMarkdownFile(this.directory(PLANNER_DIRECTORIES.visits), entityFileName(v));
    }
    for (const l of legs.filter((x) => x.trip_id === tripId)) {
      await this.store.deleteMarkdownFile(this.directory(PLANNER_DIRECTORIES.legs), entityFileName(l));
    }
    for (const e of expenses.filter((x) => x.trip_id === tripId)) {
      await this.store.deleteMarkdownFile(this.directory(PLANNER_DIRECTORIES.expenses), expenseFileName(e.id ?? (e as unknown as Record<string, string>).expense_id));
    }
    await this.store.deleteMarkdownFile(this.directory(PLANNER_DIRECTORIES.trips), entityFileName(trip));
    return true;
  }

  /**
   * Identifies suspected duplicate pairs in a trip for manual user review.
   */
  async findSuspectedDuplicates(tripId: string): Promise<SuspectedDuplicatePair[]> {
    await this.initialize();
    const tripPlaces = (await this.listPlaces()).filter((p) => p.trip_id === tripId && p.state !== 'dropped');
    return detectSuspectedDuplicatePlaces(tripPlaces);
  }

  /**
   * Merges a secondary place into a primary place, reassigning visits and deleting the secondary entity.
   */
  async mergePlaces(primaryPlaceId: string, secondaryPlaceId: string): Promise<PlannerTripPlace> {
    await this.initialize();
    if (primaryPlaceId === secondaryPlaceId) throw new Error('Cannot merge a place into itself.');
    const places = await this.listPlaces();
    const primary = places.find((p) => p.id === primaryPlaceId);
    const secondary = places.find((p) => p.id === secondaryPlaceId);
    if (!primary || !secondary) {
      throw new Error(`Cannot merge: place not found (primary: ${primaryPlaceId}, secondary: ${secondaryPlaceId})`);
    }
    if (primary.trip_id !== secondary.trip_id) {
      throw new Error('Cannot merge places from different trips.');
    }

    const merged = mergeCapturedPlaceResearch(primary, secondary);
    const secondaryVisits = (await this.listVisits()).filter((visit) => visit.place_id === secondaryPlaceId);
    const reassignedVisits: PlannerTripVisit[] = [];
    let primaryWritten = false;

    try {
      await this.upsert(merged);
      primaryWritten = true;
      for (const visit of secondaryVisits) {
        await this.upsert({ ...visit, place_id: primary.id, updated_at: new Date().toISOString() });
        reassignedVisits.push(visit);
      }
      await this.store.deleteMarkdownFile(
        this.directory(PLANNER_DIRECTORIES.places),
        entityFileName(secondary),
      );
      return merged;
    } catch (error) {
      const rollbackErrors: string[] = [];
      for (const visit of reassignedVisits.reverse()) {
        try {
          await this.upsert(visit);
        } catch (rollbackError) {
          rollbackErrors.push(`visit ${visit.id}: ${String(rollbackError)}`);
        }
      }
      if (primaryWritten) {
        try {
          await this.upsert(primary);
        } catch (rollbackError) {
          rollbackErrors.push(`primary ${primary.id}: ${String(rollbackError)}`);
        }
      }
      const cause = error instanceof Error ? error.message : String(error);
      if (rollbackErrors.length > 0) {
        throw new Error(`Merge failed (${cause}) and rollback was incomplete: ${rollbackErrors.join(' | ')}`);
      }
      throw new Error(`Merge failed and was rolled back: ${cause}`);
    }
  }

  async addVisit(
    placeId: string,
    date: string,
    options: {
      sort_order?: number;
      start?: string;
      duration_minutes?: number;
      locked?: boolean;
      is_anchor?: boolean;
      anchor_type?: PlannerTripVisit['anchor_type'];
    } = {},
  ): Promise<PlannerTripVisit | null> {
    await this.initialize();
    const place = (await this.listPlaces()).find((item) => item.id === placeId && item.state !== 'dropped');
    if (!place) return null;
    const trip = (await this.listTrips()).find((t) => t.id === place.trip_id);
    if (!trip) {
      throw new Error(`Planner trip "${place.trip_id}" was not found for place ${place.id}.`);
    }
    assertTripDate(trip, date);

    const visits = await this.listVisits();
    const dayVisits = visits
      .filter((visit) => visit.trip_id === place.trip_id && visit.date === date)
      .sort((left, right) => left.sort_order - right.sort_order);

    let order: number;
    if (options.sort_order !== undefined) {
      order = Math.max(0, Math.min(options.sort_order, dayVisits.length));
      const toShift = dayVisits.filter((v) => v.sort_order >= order);
      for (const v of toShift) {
        await this.upsert({ ...v, sort_order: v.sort_order + 1, updated_at: new Date().toISOString() });
      }
    } else {
      order = dayVisits.length;
    }

    const start = options.start?.trim() || undefined;
    const duration = options.duration_minutes ?? place.duration_minutes;
    const errors = validatePlannerTiming(start, duration, { allowCrossMidnight: Boolean(options.is_anchor) })
      .filter((issue) => issue.severity === 'error');
    if (errors.length > 0) throw new Error(errors.map((issue) => issue.message).join(' | '));
    const visit = createPlannerTripVisit(place, date, order, {
      start,
      duration_minutes: duration,
      locked: options.locked,
      is_anchor: options.is_anchor,
      anchor_type: options.anchor_type,
    });
    await this.upsertVisit(visit);
    return visit;
  }

  async removeVisit(visitId: string): Promise<boolean> {
    await this.initialize();
    const visit = (await this.listVisits()).find((item) => item.id === visitId);
    if (!visit) return false;
    await this.store.deleteMarkdownFile(this.directory(PLANNER_DIRECTORIES.visits), plannerTripVisitFileName(visit.id));
    const remaining = (await this.listVisits())
      .filter((item) => item.trip_id === visit.trip_id && item.date === visit.date && item.id !== visit.id)
      .sort((left, right) => left.sort_order - right.sort_order);
    for (let index = 0; index < remaining.length; index += 1) {
      const item = remaining[index];
      if (item.sort_order !== index) {
        await this.upsert({ ...item, sort_order: index, updated_at: new Date().toISOString() });
      }
    }
    return true;
  }

  async toggleVisitLock(visitId: string): Promise<PlannerTripVisit | null> {
    const visit = (await this.listVisits()).find((item) => item.id === visitId);
    if (!visit) return null;
    const next = { ...visit, locked: !visit.locked, updated_at: new Date().toISOString() };
    await this.upsertVisit(next);
    return next;
  }

  async updateVisitTiming(
    visitId: string,
    timing: { start?: string | null; duration_minutes?: number | null },
  ): Promise<PlannerTripVisit | null> {
    const visit = (await this.listVisits()).find((item) => item.id === visitId);
    if (!visit) return null;
    const start = timing.start?.trim() || undefined;
    const duration = timing.duration_minutes ?? undefined;
    const errors = validatePlannerTiming(start, duration, { allowCrossMidnight: visit.is_anchor })
      .filter((issue) => issue.severity === 'error');
    if (errors.length > 0) throw new Error(errors.map((issue) => issue.message).join(' | '));
    const next: PlannerTripVisit = { ...visit, start, duration_minutes: duration, updated_at: new Date().toISOString() };
    await this.upsertVisit(next);
    return next;
  }

  async reorderVisits(date: string, orderedVisitIds: string[]): Promise<number> {
    if (orderedVisitIds.length === 0) return 0;
    const visits = await this.listVisits();
    const byId = new Map(visits.map((visit) => [visit.id, visit] as const));
    const resolved = orderedVisitIds.map((id) => byId.get(id));
    if (resolved.some((visit) => !visit)) throw new Error('Planner reorder contains an unknown visit.');
    const ordered = resolved as PlannerTripVisit[];
    const tripId = ordered[0].trip_id;
    if (ordered.some((visit) => visit.trip_id !== tripId || visit.date !== date)) {
      throw new Error('Planner reorder must stay within one trip and one day.');
    }
    const dayVisits = visits.filter((visit) => visit.trip_id === tripId && visit.date === date);
    const requestedIds = new Set(orderedVisitIds);
    if (dayVisits.length !== ordered.length || dayVisits.some((visit) => !requestedIds.has(visit.id))) {
      throw new Error('Planner reorder must contain every visit in the trip day exactly once.');
    }
    let written = 0;
    for (let index = 0; index < ordered.length; index += 1) {
      const visit = ordered[index];
      if (visit.sort_order === index) continue;
      await this.upsertVisit({ ...visit, sort_order: index, updated_at: new Date().toISOString() });
      written += 1;
    }
    return written;
  }

  async setStaySpan(hotelPlaceId: string, dates: string[]): Promise<PlannerTripVisit[]> {
    const place = (await this.listPlaces()).find((item) => item.id === hotelPlaceId && item.kind === 'stay' && item.state !== 'dropped');
    if (!place) throw new Error(`Planner stay place was not found: ${hotelPlaceId}`);
    const targetDates = [...new Set(dates)].sort();
    if (targetDates.length === 0) throw new Error('Planner stay span requires at least one date.');
    const trip = (await this.listTrips()).find((t) => t.id === place.trip_id);
    if (!trip) {
      throw new Error(`Planner trip "${place.trip_id}" was not found for stay place.`);
    }
    assertTripDates(trip, targetDates);
    const dateSet = new Set(targetDates);
    const visits = await this.listVisits();
    const tripPlaces = new Map(
      (await this.listPlaces())
        .filter((item) => item.trip_id === place.trip_id)
        .map((item) => [item.id, item] as const),
    );
    const existingHotelVisits = visits
      .filter((visit) => visit.trip_id === place.trip_id && visit.place_id === place.id)
      .sort((left, right) => left.date.localeCompare(right.date) || left.sort_order - right.sort_order || left.id.localeCompare(right.id));
    const keepByDate = new Map<string, PlannerTripVisit>();
    for (const visit of existingHotelVisits) {
      if (
        dateSet.has(visit.date)
        && !keepByDate.has(visit.date)
        && visit.locked
        && visit.is_anchor
        && visit.anchor_type === 'stay_checkin'
      ) {
        keepByDate.set(visit.date, visit);
      }
    }
    const stale = visits.filter((visit) => {
      if (visit.trip_id !== place.trip_id || tripPlaces.get(visit.place_id)?.kind !== 'stay') return false;
      if (visit.place_id === place.id) {
        return !dateSet.has(visit.date) || keepByDate.get(visit.date)?.id !== visit.id;
      }
      return dateSet.has(visit.date);
    });
    for (const visit of stale) await this.removeVisit(visit.id);
    const result: PlannerTripVisit[] = [];
    for (const date of targetDates) {
      const existing = keepByDate.get(date);
      if (existing) {
        result.push(existing);
        continue;
      }
      const visit = await this.addVisit(hotelPlaceId, date, {
        sort_order: 0,
        locked: true,
        is_anchor: true,
        anchor_type: 'stay_checkin',
      });
      if (visit) result.push(visit);
    }
    return result;
  }

  async upsertExpense(expense: TripExpenseItem): Promise<void> {
    await this.initialize();
    await this.store.writeMarkdownFile(this.directory(PLANNER_DIRECTORIES.expenses), expenseFileName(expense.id), serializeMarkdownEntity(toRepoExpense(expense), ''));
  }

  async deleteExpense(expenseId: string): Promise<void> {
    await this.initialize();
    await this.store.deleteMarkdownFile(this.directory(PLANNER_DIRECTORIES.expenses), expenseFileName(expenseId));
  }

  async exportTripIcs(tripId: string): Promise<string> {
    await this.initialize();
    const trip = (await this.listTrips()).find((item) => item.id === tripId);
    if (!trip) throw new Error(`Planner trip was not found: ${tripId}`);
    const places = (await this.listPlaces()).filter((place) => place.trip_id === tripId);
    const visits = (await this.listVisits()).filter((visit) => visit.trip_id === tripId);
    return buildTripCalendarIcs(trip, places, visits);
  }

  async exportDayIcs(tripId: string, date: string): Promise<string> {
    await this.initialize();
    const trip = (await this.listTrips()).find((item) => item.id === tripId);
    if (!trip) throw new Error(`Planner trip was not found: ${tripId}`);
    const places = (await this.listPlaces()).filter((place) => place.trip_id === tripId);
    const visits = (await this.listVisits()).filter((visit) => visit.trip_id === tripId);
    return buildDayCalendarIcs(trip, places, visits, date);
  }

  async createOrUpdateCalendarFeed(tripId: string): Promise<PlannerTripCalendarFeed> {
    await this.initialize();
    const trip = (await this.listTrips()).find((item) => item.id === tripId);
    if (!trip) throw new Error(`Planner trip was not found: ${tripId}`);

    const feed: PlannerTripCalendarFeed = trip.calendar_feed
      ? { ...trip.calendar_feed, updated_at: new Date().toISOString(), enabled: true }
      : createTripCalendarFeed(tripId);

    const updatedTrip: PlannerTrip = {
      ...trip,
      calendar_feed: feed,
      updated_at: new Date().toISOString(),
    };
    await this.upsertTrip(updatedTrip);
    return feed;
  }

  async rotateCalendarFeed(tripId: string): Promise<PlannerTripCalendarFeed> {
    await this.initialize();
    const trip = (await this.listTrips()).find((item) => item.id === tripId);
    if (!trip) throw new Error(`Planner trip was not found: ${tripId}`);
    const currentFeed = trip.calendar_feed || createTripCalendarFeed(tripId);
    const rotated = rotateTripCalendarFeed(currentFeed);
    const updatedTrip: PlannerTrip = {
      ...trip,
      calendar_feed: rotated,
      updated_at: new Date().toISOString(),
    };
    await this.upsertTrip(updatedTrip);
    return rotated;
  }

  async disableCalendarFeed(tripId: string): Promise<boolean> {
    await this.initialize();
    const trip = (await this.listTrips()).find((item) => item.id === tripId);
    if (!trip) throw new Error(`Planner trip was not found: ${tripId}`);
    if (!trip.calendar_feed) return false;
    const disabledFeed: PlannerTripCalendarFeed = {
      ...trip.calendar_feed,
      enabled: false,
      updated_at: new Date().toISOString(),
    };
    await this.upsertTrip({
      ...trip,
      calendar_feed: disabledFeed,
      updated_at: new Date().toISOString(),
    });
    return true;
  }
}

export const plannerRepository = new PlannerRepository();
