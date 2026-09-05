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
import { validateEntity } from '@/domain/schema';
import { CURRENT_SCHEMA_VERSION } from '@/domain/schema/common';
import { obsidianService } from './ObsidianFileSystemService';

export { CURRENT_SCHEMA_VERSION };

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
  const safe = trimmed.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'entity';
  if (trimmed !== safe) {
    const hashStr = stablePlannerHash(trimmed);
    return `${safe}-${hashStr}`;
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

interface PlannerExecutedOp {
  directory: string;
  fileName: string;
  originalContent: string | null;
  newContent: string | null;
}

export class PlannerTransactionContext {
  private executedOps: PlannerExecutedOp[] = [];

  constructor(
    private readonly store: PlannerFileStore,
    private readonly resolveDirectory: (name: string) => string,
  ) {}

  private async readOriginal(directory: string, fileName: string): Promise<string | null> {
    const files = await this.store.readMarkdownFiles(this.resolveDirectory(directory));
    const found = files.find((f) => f.fileName === fileName);
    return found ? found.content : null;
  }

  async stageWrite(directory: string, fileName: string, content: string): Promise<void> {
    const original = await this.readOriginal(directory, fileName);
    await this.store.writeMarkdownFile(this.resolveDirectory(directory), fileName, content);
    this.executedOps.push({
      directory,
      fileName,
      originalContent: original,
      newContent: content,
    });
  }

  async stageDelete(directory: string, fileName: string): Promise<void> {
    const original = await this.readOriginal(directory, fileName);
    if (original === null) return;
    await this.store.deleteMarkdownFile(this.resolveDirectory(directory), fileName);
    this.executedOps.push({
      directory,
      fileName,
      originalContent: original,
      newContent: null,
    });
  }

  async stageUpsertEntity(entity: PlannerEntity): Promise<void> {
    const dir = entity.type === 'trip'
      ? PLANNER_DIRECTORIES.trips
      : entity.type === 'trip_place'
        ? PLANNER_DIRECTORIES.places
        : entity.type === 'trip_visit'
          ? PLANNER_DIRECTORIES.visits
          : PLANNER_DIRECTORIES.legs;
    const content = serializeMarkdownEntity(
      entity.type === 'trip_place'
        ? { ...entity, tags: ensurePlaceKindTag(entity.tags, entity.kind) }
        : entity,
      '',
    );
    await this.stageWrite(dir, entityFileName(entity), content);
  }

  async stageDeleteEntity(entity: PlannerEntity): Promise<void> {
    const dir = entity.type === 'trip'
      ? PLANNER_DIRECTORIES.trips
      : entity.type === 'trip_place'
        ? PLANNER_DIRECTORIES.places
        : entity.type === 'trip_visit'
          ? PLANNER_DIRECTORIES.visits
          : PLANNER_DIRECTORIES.legs;
    await this.stageDelete(dir, entityFileName(entity));
  }

  async stageUpsertExpense(expense: TripExpenseItem): Promise<void> {
    const content = serializeMarkdownEntity(toRepoExpense(expense), '');
    await this.stageWrite(PLANNER_DIRECTORIES.expenses, expenseFileName(expense.id), content);
  }

  async stageDeleteExpense(expenseId: string): Promise<void> {
    await this.stageDelete(PLANNER_DIRECTORIES.expenses, expenseFileName(expenseId));
  }

  async rollback(): Promise<{ rolledBackCount: number; errors: string[] }> {
    const errors: string[] = [];
    let rolledBackCount = 0;
    for (let i = this.executedOps.length - 1; i >= 0; i--) {
      const op = this.executedOps[i];
      try {
        if (op.originalContent === null) {
          await this.store.deleteMarkdownFile(this.resolveDirectory(op.directory), op.fileName);
        } else {
          await this.store.writeMarkdownFile(this.resolveDirectory(op.directory), op.fileName, op.originalContent);
        }
        rolledBackCount++;
      } catch (err) {
        errors.push(`Failed to rollback ${op.directory}/${op.fileName}: ${String(err)}`);
      }
    }
    return { rolledBackCount, errors };
  }
}

export class PlannerRepository {
  private root = '';
  private mutationChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly store: PlannerFileStore = obsidianService as PlannerFileStore) {}

  async initialize(): Promise<void> {
    this.root = await this.store.getDataFolder();
  }

  private directory(name: string): string {
    return this.root ? `${this.root}/${name}` : name;
  }

  async executeTransaction<R>(fn: (tx: PlannerTransactionContext) => Promise<R>): Promise<R> {
    await this.initialize();
    const run = async (): Promise<R> => {
      const tx = new PlannerTransactionContext(this.store, (name) => this.directory(name));
      try {
        return await fn(tx);
      } catch (error) {
        const rollbackResult = await tx.rollback();
        const cause = error instanceof Error ? error.message : String(error);
        if (rollbackResult.errors.length > 0) {
          throw new Error(`Transaction failed (${cause}) and rollback had errors: ${rollbackResult.errors.join(' | ')}`);
        }
        throw new Error(`Transaction failed and was rolled back: ${cause}`);
      }
    };

    const nextPromise = this.mutationChain.then(run, run);
    this.mutationChain = nextPromise.catch(() => {});
    return nextPromise;
  }

  private async list<T extends PlannerEntity>(
    directory: string,
    type: PlannerEntityType,
    options?: { strict?: boolean },
  ): Promise<T[]> {
    await this.initialize();
    const files = await this.store.readMarkdownFiles(this.directory(directory));
    const result: T[] = [];
    for (const file of files) {
      try {
        const parsed = parseMarkdownEntity<Record<string, unknown>>(file.content);
        if (parsed.frontmatter.type !== type) {
          if (options?.strict) {
            throw new Error(`Mismatched entity type in ${file.fileName}: expected ${type}, got ${parsed.frontmatter.type}`);
          }
          continue;
        }
        const validation = validateEntity(parsed.frontmatter);
        if (!validation.valid) {
          const issues = validation.issues.map((i) => `${i.field}: ${i.message}`).join(', ');
          if (options?.strict) {
            throw new Error(`Schema validation error in ${file.fileName}: ${issues}`);
          }
          console.warn(`[PlannerRepository] Invalid schema in ${file.fileName}: ${issues}`);
        }
        result.push(parsed.frontmatter as unknown as T);
      } catch (err) {
        if (options?.strict) {
          throw new Error(`Strict read failed for ${this.directory(directory)}/${file.fileName}: ${err instanceof Error ? err.message : String(err)}`);
        }
        console.warn(`Skipping invalid Ownly planner file: ${file.fileName}`);
      }
    }
    return result;
  }

  async listTrips(options?: { strict?: boolean }): Promise<PlannerTrip[]> {
    return this.list<PlannerTrip>(PLANNER_DIRECTORIES.trips, 'trip', options);
  }

  async listPlaces(options?: { strict?: boolean }): Promise<PlannerTripPlace[]> {
    const places = await this.list<PlannerTripPlace>(PLANNER_DIRECTORIES.places, 'trip_place', options);
    return places.map((place) => ({ ...place, tags: ensurePlaceKindTag(place.tags, place.kind) }));
  }

  async listVisits(options?: { strict?: boolean }): Promise<PlannerTripVisit[]> {
    return this.list<PlannerTripVisit>(PLANNER_DIRECTORIES.visits, 'trip_visit', options);
  }

  async listLegs(options?: { strict?: boolean }): Promise<PlannerTripLeg[]> {
    return this.list<PlannerTripLeg>(PLANNER_DIRECTORIES.legs, 'trip_leg', options);
  }

  async listExpenses(options?: { strict?: boolean }): Promise<TripExpenseItem[]> {
    await this.initialize();
    const files = await this.store.readMarkdownFiles(this.directory(PLANNER_DIRECTORIES.expenses));
    const result: TripExpenseItem[] = [];
    for (const file of files) {
      try {
        const parsed = parseMarkdownEntity<Record<string, unknown>>(file.content);
        if (parsed.frontmatter.type !== 'trip_expense') {
          if (options?.strict) {
            throw new Error(`Mismatched entity type in expense file ${file.fileName}: ${parsed.frontmatter.type}`);
          }
          continue;
        }
        const validation = validateEntity(parsed.frontmatter);
        if (!validation.valid) {
          const issues = validation.issues.map((i) => `${i.field}: ${i.message}`).join(', ');
          if (options?.strict) {
            throw new Error(`Schema validation error in expense file ${file.fileName}: ${issues}`);
          }
          console.warn(`[PlannerRepository] Invalid schema in expense file ${file.fileName}: ${issues}`);
        }
        result.push(fromRepoExpense(parsed.frontmatter));
      } catch (err) {
        if (options?.strict) {
          throw new Error(`Strict read failed for expense file ${file.fileName}: ${err instanceof Error ? err.message : String(err)}`);
        }
        console.warn(`Skipping invalid Ownly planner expense file: ${file.fileName}`);
      }
    }
    return result;
  }

  private async upsert(entity: PlannerEntity): Promise<void> {
    await this.executeTransaction(async (tx) => {
      await tx.stageUpsertEntity(entity);
    });
  }

  async upsertTrip(trip: PlannerTrip): Promise<void> { await this.upsert(trip); }
  async upsertPlace(place: PlannerTripPlace): Promise<void> {
    await this.upsert({ ...place, tags: ensurePlaceKindTag(place.tags, place.kind) });
  }
  async upsertVisit(visit: PlannerTripVisit): Promise<void> {
    await this.executeTransaction(async (tx) => {
      const trip = (await this.listTrips({ strict: true })).find((t) => t.id === visit.trip_id);
      if (!trip) {
        throw new Error(`Planner trip "${visit.trip_id}" was not found for visit.`);
      }
      assertTripDate(trip, visit.date);
      await tx.stageUpsertEntity(visit);
    });
  }
  async upsertLeg(leg: PlannerTripLeg): Promise<void> { await this.upsert(leg); }

  async upsertPlaces(places: PlannerTripPlace[]): Promise<void> {
    await this.executeTransaction(async (tx) => {
      for (const place of places) {
        await tx.stageUpsertEntity({ ...place, tags: ensurePlaceKindTag(place.tags, place.kind) });
      }
    });
  }

  private async importResearchPlaces(places: PlannerTripPlace[]): Promise<ImportReport> {
    const report: ImportReport = { received: places.length, created: [], updated: [], deduped: [], failed: [] };
    if (places.length === 0) return report;
    await this.initialize();
    const touchedTripIds = new Set<string>();

    await this.executeTransaction(async (tx) => {
      const existingTrips = new Set((await this.listTrips({ strict: true })).map((t) => t.id));
      const existing = await this.listPlaces({ strict: true });
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
            await tx.stageUpsertEntity(persisted);
            indexPlace(persisted);
            report.updated.push(rawPlace.id);
          } else {
            await tx.stageUpsertEntity(incoming);
            indexPlace(incoming);
            report.created.push(rawPlace.id);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.warn(`[PlannerRepository] Failed to stage research place ${rawPlace.id} (${rawPlace.title}):`, error);
          report.failed.push({ id: rawPlace.id, title: rawPlace.title || '(unknown)', reason: 'write_error', detail: msg });
        }
      }
    });

    for (const tripId of touchedTripIds) {
      try {
        const dedupResult = await this.deduplicateTripPlaces(tripId);
        if (dedupResult.removedCount > 0) {
          const allPlacesAfter = await this.listPlaces({ strict: true });
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
    return this.executeTransaction(async (tx) => {
      const allPlaces = (await this.listPlaces({ strict: true })).filter((p) => p.trip_id === tripId);
      if (allPlaces.length <= 1) return { mergedCount: 0, removedCount: 0 };

      const visits = (await this.listVisits({ strict: true })).filter((v) => v.trip_id === tripId);
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
        let currentPrimary = primary;
        let clusterMerged = false;
        for (let k = 1; k < cluster.length; k++) {
          const secondary = cluster[k];
          currentPrimary = mergeCapturedPlaceResearch(currentPrimary, secondary);
          const secondaryVisits = visits.filter((visit) => visit.place_id === secondary.id);
          await tx.stageUpsertEntity(currentPrimary);
          for (const visit of secondaryVisits) {
            await tx.stageUpsertEntity({ ...visit, place_id: currentPrimary.id, updated_at: new Date().toISOString() });
          }
          await tx.stageDeleteEntity(secondary);
          removedCount += 1;
          clusterMerged = true;
        }
        if (clusterMerged) mergedCount += 1;
      }

      return { mergedCount, removedCount };
    });
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

    await this.executeTransaction(async (tx) => {
      const existingTrips = new Set((await this.listTrips({ strict: true })).map((t) => t.id));
      const existing = await this.listPlaces({ strict: true });
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
            if (match) {
              existingPlace = match;
              traceEntry.match_type = 'strong_identity';
              traceEntry.matched_id = match.id;
              traceEntry.matched_title = match.title;
              traceEntry.identity_key = key;
              break;
            }
          }
        }

        try {
          if (existingPlace) {
            const persisted = mergeCapturedPlaceResearch(existingPlace, incoming);
            await tx.stageUpsertEntity(persisted);
            indexPlace(persisted);
            traceEntry.action = 'updated';
            traceEntry.reason = `updated existing place ${existingPlace.id}`;
            report.updated.push(rawPlace.id);
          } else {
            await tx.stageUpsertEntity(incoming);
            indexPlace(incoming);
            traceEntry.action = 'created';
            traceEntry.reason = 'new place imported';
            report.created.push(rawPlace.id);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          traceEntry.action = 'failed';
          traceEntry.reason = `write_error: ${msg}`;
          console.warn(`[PlannerRepository] Failed to stage research place ${rawPlace.id} (${rawPlace.title}):`, error);
          report.failed.push({ id: rawPlace.id, title: rawPlace.title || '(unknown)', reason: 'write_error', detail: msg });
        }
        trace.push(traceEntry);
      }
    });

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
    return this.executeTransaction(async (tx) => {
      const allVisits = await this.listVisits({ strict: true });
      const allPlaces = await this.listPlaces({ strict: true });
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

          await tx.stageUpsertEntity(placeholderPlace);

          // Update the visit to reference the new place
          const updatedVisit = {
            ...visit,
            place_id: placeId,
            updated_at: now,
          };
          await tx.stageUpsertEntity(updatedVisit);

          reconstructed.push({ placeId, visitId: visit.id, title: placeholderPlace.title });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          failed.push({ visitId: visit.id, reason: msg });
          console.warn(`[PlannerRepository] Failed to reconstruct place for visit ${visit.id}:`, error);
        }
      }

      return { reconstructed, failed };
    });
  }

  async importBundle(bundle: { trip: PlannerTrip; places: PlannerTripPlace[]; visits: PlannerTripVisit[]; legs: PlannerTripLeg[] }): Promise<ImportReport> {
    const report: ImportReport = { received: bundle.places.length, created: [], updated: [], deduped: [], failed: [] };

    return this.executeTransaction(async (tx) => {
      await tx.stageUpsertEntity(bundle.trip);

      for (const place of bundle.places) {
        await tx.stageUpsertEntity({ ...place, tags: ensurePlaceKindTag(place.tags, place.kind) });
        report.created.push(place.id);
      }

      for (const visit of bundle.visits) {
        assertTripDate(bundle.trip, visit.date);
        await tx.stageUpsertEntity(visit);
      }

      for (const leg of bundle.legs) {
        await tx.stageUpsertEntity(leg);
      }

      return report;
    });
  }

  async dropPlace(placeId: string): Promise<boolean> {
    return this.executeTransaction(async (tx) => {
      const places = await this.listPlaces({ strict: true });
      const existing = places.find((place) => place.id === placeId);
      if (!existing) return false;
      const visits = await this.listVisits({ strict: true });
      const blockingVisits = visits.filter(
        (visit) => visit.trip_id === existing.trip_id && visit.place_id === placeId,
      );
      if (blockingVisits.length > 0) {
        throw new Error(`Cannot drop ${existing.title}: remove ${blockingVisits.length} scheduled visit(s) first.`);
      }
      await tx.stageUpsertEntity({ ...existing, state: 'dropped', updated_at: new Date().toISOString() });
      return true;
    });
  }

  async restorePlace(placeId: string): Promise<boolean> {
    return this.executeTransaction(async (tx) => {
      const places = await this.listPlaces({ strict: true });
      const existing = places.find((place) => place.id === placeId);
      if (!existing) return false;
      await tx.stageUpsertEntity({ ...existing, state: 'candidate', updated_at: new Date().toISOString() });
      return true;
    });
  }

  async deletePlace(placeId: string): Promise<boolean> {
    return this.executeTransaction(async (tx) => {
      const places = await this.listPlaces({ strict: true });
      const existing = places.find((place) => place.id === placeId);
      if (!existing) return false;
      const visits = await this.listVisits({ strict: true });
      const blockingVisits = visits.filter(
        (visit) => visit.trip_id === existing.trip_id && visit.place_id === placeId,
      );
      if (blockingVisits.length > 0) {
        throw new Error(`Cannot delete ${existing.title}: remove ${blockingVisits.length} scheduled visit(s) first.`);
      }
      await tx.stageDeleteEntity(existing);
      return true;
    });
  }

  async deleteTrip(tripId: string): Promise<boolean> {
    return this.executeTransaction(async (tx) => {
      const trip = (await this.listTrips({ strict: true })).find((t) => t.id === tripId);
      if (!trip) return false;
      // cascade: places / visits / legs / expenses
      const [places, visits, legs, expenses] = await Promise.all([
        this.listPlaces({ strict: true }),
        this.listVisits({ strict: true }),
        this.listLegs({ strict: true }),
        this.listExpenses({ strict: true }),
      ]);

      for (const p of places.filter((x) => x.trip_id === tripId)) {
        await tx.stageDeleteEntity(p);
      }
      for (const v of visits.filter((x) => x.trip_id === tripId)) {
        await tx.stageDeleteEntity(v);
      }
      for (const l of legs.filter((x) => x.trip_id === tripId)) {
        await tx.stageDeleteEntity(l);
      }
      for (const e of expenses.filter((x) => x.trip_id === tripId)) {
        await tx.stageDeleteExpense(e.id ?? (e as unknown as Record<string, string>).expense_id);
      }
      await tx.stageDeleteEntity(trip);
      return true;
    });
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
    if (primaryPlaceId === secondaryPlaceId) throw new Error('Cannot merge a place into itself.');

    return this.executeTransaction(async (tx) => {
      const places = await this.listPlaces({ strict: true });
      const primary = places.find((p) => p.id === primaryPlaceId);
      const secondary = places.find((p) => p.id === secondaryPlaceId);
      if (!primary || !secondary) {
        throw new Error(`Cannot merge: place not found (primary: ${primaryPlaceId}, secondary: ${secondaryPlaceId})`);
      }
      if (primary.trip_id !== secondary.trip_id) {
        throw new Error('Cannot merge places from different trips.');
      }

      const merged = mergeCapturedPlaceResearch(primary, secondary);
      const visits = await this.listVisits({ strict: true });
      const secondaryVisits = visits.filter((visit) => visit.place_id === secondaryPlaceId);

      await tx.stageUpsertEntity(merged);
      for (const visit of secondaryVisits) {
        await tx.stageUpsertEntity({ ...visit, place_id: primary.id, updated_at: new Date().toISOString() });
      }
      await tx.stageDeleteEntity(secondary);
      return merged;
    });
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
    return this.executeTransaction(async (tx) => {
      const place = (await this.listPlaces({ strict: true })).find((item) => item.id === placeId && item.state !== 'dropped');
      if (!place) return null;
      const trip = (await this.listTrips({ strict: true })).find((t) => t.id === place.trip_id);
      if (!trip) {
        throw new Error(`Planner trip "${place.trip_id}" was not found for place ${place.id}.`);
      }
      assertTripDate(trip, date);

      // Validate timing BEFORE performing any mutation
      const start = options.start?.trim() || undefined;
      const duration = options.duration_minutes ?? place.duration_minutes;
      const errors = validatePlannerTiming(start, duration, { allowCrossMidnight: Boolean(options.is_anchor) })
        .filter((issue) => issue.severity === 'error');
      if (errors.length > 0) throw new Error(errors.map((issue) => issue.message).join(' | '));

      const visits = await this.listVisits({ strict: true });
      const dayVisits = visits
        .filter((visit) => visit.trip_id === place.trip_id && visit.date === date)
        .sort((left, right) => left.sort_order - right.sort_order);

      let order: number;
      if (options.sort_order !== undefined) {
        order = Math.max(0, Math.min(options.sort_order, dayVisits.length));
        const toShift = dayVisits.filter((v) => v.sort_order >= order);
        for (const v of toShift) {
          await tx.stageUpsertEntity({ ...v, sort_order: v.sort_order + 1, updated_at: new Date().toISOString() });
        }
      } else {
        order = dayVisits.length;
      }

      const visit = createPlannerTripVisit(place, date, order, {
        start,
        duration_minutes: duration,
        locked: options.locked,
        is_anchor: options.is_anchor,
        anchor_type: options.anchor_type,
      });
      await tx.stageUpsertEntity(visit);
      return visit;
    });
  }

  async removeVisit(visitId: string): Promise<boolean> {
    return this.executeTransaction(async (tx) => {
      const visits = await this.listVisits({ strict: true });
      const visit = visits.find((item) => item.id === visitId);
      if (!visit) return false;

      await tx.stageDeleteEntity(visit);
      const remaining = visits
        .filter((item) => item.trip_id === visit.trip_id && item.date === visit.date && item.id !== visit.id)
        .sort((left, right) => left.sort_order - right.sort_order);
      for (let index = 0; index < remaining.length; index += 1) {
        const item = remaining[index];
        if (item.sort_order !== index) {
          await tx.stageUpsertEntity({ ...item, sort_order: index, updated_at: new Date().toISOString() });
        }
      }
      return true;
    });
  }

  async toggleVisitLock(visitId: string): Promise<PlannerTripVisit | null> {
    return this.executeTransaction(async (tx) => {
      const visit = (await this.listVisits({ strict: true })).find((item) => item.id === visitId);
      if (!visit) return null;
      const trip = (await this.listTrips({ strict: true })).find((t) => t.id === visit.trip_id);
      if (!trip) {
        throw new Error(`Planner trip "${visit.trip_id}" was not found for visit.`);
      }
      assertTripDate(trip, visit.date);
      const next = { ...visit, locked: !visit.locked, updated_at: new Date().toISOString() };
      await tx.stageUpsertEntity(next);
      return next;
    });
  }

  async updateVisitTiming(
    visitId: string,
    timing: { start?: string | null; duration_minutes?: number | null },
  ): Promise<PlannerTripVisit | null> {
    return this.executeTransaction(async (tx) => {
      const visit = (await this.listVisits({ strict: true })).find((item) => item.id === visitId);
      if (!visit) return null;
      const trip = (await this.listTrips({ strict: true })).find((t) => t.id === visit.trip_id);
      if (!trip) {
        throw new Error(`Planner trip "${visit.trip_id}" was not found for visit.`);
      }
      assertTripDate(trip, visit.date);
      const start = timing.start?.trim() || undefined;
      const duration = timing.duration_minutes ?? undefined;
      const errors = validatePlannerTiming(start, duration, { allowCrossMidnight: visit.is_anchor })
        .filter((issue) => issue.severity === 'error');
      if (errors.length > 0) throw new Error(errors.map((issue) => issue.message).join(' | '));
      const next: PlannerTripVisit = { ...visit, start, duration_minutes: duration, updated_at: new Date().toISOString() };
      await tx.stageUpsertEntity(next);
      return next;
    });
  }

  async reorderVisits(date: string, orderedVisitIds: string[]): Promise<number> {
    if (orderedVisitIds.length === 0) return 0;
    return this.executeTransaction(async (tx) => {
      const visits = await this.listVisits({ strict: true });
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
        await tx.stageUpsertEntity({ ...visit, sort_order: index, updated_at: new Date().toISOString() });
        written += 1;
      }
      return written;
    });
  }

  /**
   * Swaps the entire scheduled day itinerary (visits) between two dates in a trip.
   * Atomically transfers all visits on dateA to dateB and all visits on dateB to dateA,
   * fully preserving each stop's sort_order, start_time, duration_minutes, and locked status.
   */
  async swapTripDays(tripId: string, dateA: string, dateB: string): Promise<{ swappedCount: number }> {
    if (!tripId) throw new Error('Planner swap trip days requires a valid tripId.');
    if (!dateA || !dateB) throw new Error('Planner swap trip days requires two valid dates.');
    if (dateA === dateB) return { swappedCount: 0 };

    return this.executeTransaction(async (tx) => {
      const trip = (await this.listTrips({ strict: true })).find((t) => t.id === tripId);
      if (!trip) throw new Error(`Planner trip "${tripId}" was not found.`);
      assertTripDates(trip, [dateA, dateB]);

      const visits = await this.listVisits({ strict: true });
      const tripVisits = visits.filter((v) => v.trip_id === tripId);
      const visitsA = tripVisits.filter((v) => v.date === dateA);
      const visitsB = tripVisits.filter((v) => v.date === dateB);

      if (visitsA.length === 0 && visitsB.length === 0) {
        return { swappedCount: 0 };
      }

      const now = new Date().toISOString();
      let swappedCount = 0;
      for (const visit of visitsA) {
        await tx.stageUpsertEntity({ ...visit, date: dateB, updated_at: now });
        swappedCount += 1;
      }
      for (const visit of visitsB) {
        await tx.stageUpsertEntity({ ...visit, date: dateA, updated_at: now });
        swappedCount += 1;
      }
      return { swappedCount };
    });
  }

  async setStaySpan(hotelPlaceId: string, dates: string[]): Promise<PlannerTripVisit[]> {
    const targetDates = [...new Set(dates)].sort();
    if (targetDates.length === 0) throw new Error('Planner stay span requires at least one date.');

    return this.executeTransaction(async (tx) => {
      const place = (await this.listPlaces({ strict: true })).find((item) => item.id === hotelPlaceId && item.kind === 'stay' && item.state !== 'dropped');
      if (!place) throw new Error(`Planner stay place was not found: ${hotelPlaceId}`);
      const trip = (await this.listTrips({ strict: true })).find((t) => t.id === place.trip_id);
      if (!trip) {
        throw new Error(`Planner trip "${place.trip_id}" was not found for stay place.`);
      }
      assertTripDates(trip, targetDates);
      const dateSet = new Set(targetDates);
      const visits = await this.listVisits({ strict: true });
      const tripPlaces = new Map(
        (await this.listPlaces({ strict: true }))
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

      for (const visit of stale) {
        await tx.stageDeleteEntity(visit);
      }
      const result: PlannerTripVisit[] = [];
      for (const date of targetDates) {
        const existing = keepByDate.get(date);
        if (existing) {
          result.push(existing);
          continue;
        }
        const visit = createPlannerTripVisit(place, date, 0, {
          locked: true,
          is_anchor: true,
          anchor_type: 'stay_checkin',
        });
        await tx.stageUpsertEntity(visit);
        result.push(visit);
      }
      return result;
    });
  }

  async upsertExpense(expense: TripExpenseItem): Promise<void> {
    await this.executeTransaction(async (tx) => {
      await tx.stageUpsertExpense(expense);
    });
  }

  async deleteExpense(expenseId: string): Promise<void> {
    await this.executeTransaction(async (tx) => {
      await tx.stageDeleteExpense(expenseId);
    });
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
    return this.executeTransaction(async (tx) => {
      const trip = (await this.listTrips({ strict: true })).find((item) => item.id === tripId);
      if (!trip) throw new Error(`Planner trip was not found: ${tripId}`);

      const feed: PlannerTripCalendarFeed = trip.calendar_feed
        ? { ...trip.calendar_feed, updated_at: new Date().toISOString(), enabled: true }
        : createTripCalendarFeed(tripId);

      const updatedTrip: PlannerTrip = {
        ...trip,
        calendar_feed: feed,
        updated_at: new Date().toISOString(),
      };
      await tx.stageUpsertEntity(updatedTrip);
      return feed;
    });
  }

  async rotateCalendarFeed(tripId: string): Promise<PlannerTripCalendarFeed> {
    return this.executeTransaction(async (tx) => {
      const trip = (await this.listTrips({ strict: true })).find((item) => item.id === tripId);
      if (!trip) throw new Error(`Planner trip was not found: ${tripId}`);
      const currentFeed = trip.calendar_feed || createTripCalendarFeed(tripId);
      const rotated = rotateTripCalendarFeed(currentFeed);
      const updatedTrip: PlannerTrip = {
        ...trip,
        calendar_feed: rotated,
        updated_at: new Date().toISOString(),
      };
      await tx.stageUpsertEntity(updatedTrip);
      return rotated;
    });
  }

  async disableCalendarFeed(tripId: string): Promise<boolean> {
    return this.executeTransaction(async (tx) => {
      const trip = (await this.listTrips({ strict: true })).find((item) => item.id === tripId);
      if (!trip) throw new Error(`Planner trip was not found: ${tripId}`);
      if (!trip.calendar_feed) return false;
      const disabledFeed: PlannerTripCalendarFeed = {
        ...trip.calendar_feed,
        enabled: false,
        updated_at: new Date().toISOString(),
      };
      await tx.stageUpsertEntity({
        ...trip,
        calendar_feed: disabledFeed,
        updated_at: new Date().toISOString(),
      });
      return true;
    });
  }
}

export const plannerRepository = new PlannerRepository();
