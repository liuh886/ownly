import { parseMarkdownEntity, serializeMarkdownEntity } from '@/data/frontmatter';
import {
  assertTripDate,
  assertTripDates,
  ensurePlaceKindTag,
  mergeCapturedPlaceResearch,
  normalizePlaceIdentity,
  plannerTripLegFileName,
  type PlannerTrip,
  type PlannerTripLeg,
  type PlannerTripPlace,
  type TripExpenseItem,
} from '@/domain/planner';
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

function safeEntityId(id: string): string {
  const trimmed = id.trim();
  const safe = trimmed.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  const hasNonAscii = /[^\x00-\x7F]/.test(trimmed);
  if (!safe || hasNonAscii) {
    let hash = 0;
    for (let i = 0; i < trimmed.length; i++) {
      hash = ((hash << 5) - hash) + trimmed.charCodeAt(i);
      hash |= 0;
    }
    const hashStr = Math.abs(hash).toString(36);
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

function extractPlaceCid(place: { source_place_id?: string | null; source_url?: string | null }): string | null {
  if (place.source_place_id) {
    const match = /:0x([0-9a-f]+)$/i.exec(place.source_place_id.trim());
    if (match?.[1]) {
      try {
        return BigInt('0x' + match[1]).toString();
      } catch {}
    }
    if (/^\d{8,}$/.test(place.source_place_id.trim())) {
      return place.source_place_id.trim();
    }
    if (/^ChIJ[A-Za-z0-9_-]{8,}$/.test(place.source_place_id.trim())) {
      return place.source_place_id.trim().toLowerCase();
    }
  }
  if (place.source_url) {
    try {
      const url = new URL(place.source_url);
      const cid = url.searchParams.get('cid');
      if (cid && /^\d+$/.test(cid)) return cid;
      const qpid = url.searchParams.get('query_place_id');
      if (qpid) return qpid.toLowerCase();
    } catch {}
    const fidMatch = /0x[0-9a-f]+:0x([0-9a-f]+)/i.exec(place.source_url);
    if (fidMatch?.[1]) {
      try {
        return BigInt('0x' + fidMatch[1]).toString();
      } catch {}
    }
  }
  return null;
}

function canonicalizePlaceTitle(title?: string | null): string {
  if (!title) return '';
  return title
    .replace(/^[\p{Emoji}\p{Symbol}\s·•\-🍜☕🏨📍⭐🏷️]+/u, '')
    .replace(/[\p{Emoji}\p{Symbol}\s·•\-🍜☕🏨📍⭐🏷️]+$/u, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function coordinateClusterKey(place: PlannerTripPlace): string | null {
  if (!place.coordinates) return null;
  return `${place.trip_id}::geo:${place.coordinates.lat.toFixed(4)},${place.coordinates.lng.toFixed(4)}`;
}

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
        result.push(parsed.frontmatter as unknown as T);
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

  private async importResearchPlaces(places: PlannerTripPlace[]): Promise<string[]> {
    if (places.length === 0) return [];
    await this.initialize();
    const existingTrips = new Set((await this.listTrips()).map((t) => t.id));
    const existing = await this.listPlaces();
    const byId = new Map(existing.map((place) => [place.id, place] as const));
    const byPlaceId = new Map<string, PlannerTripPlace>();
    const byCid = new Map<string, PlannerTripPlace>();
    const byTitle = new Map<string, PlannerTripPlace>();
    const byUrlIdentity = new Map<string, PlannerTripPlace>();
    const byCoordinates = new Map<string, PlannerTripPlace>();

    const indexPlace = (place: PlannerTripPlace) => {
      byId.set(place.id, place);
      if (place.source_place_id) byPlaceId.set(`${place.trip_id}::${place.source_provider}::${place.source_place_id}`, place);
      const cid = extractPlaceCid(place);
      if (cid) byCid.set(`${place.trip_id}::${cid}`, place);
      const cleanTitle = canonicalizePlaceTitle(place.title);
      if (cleanTitle.length >= 2) byTitle.set(`${place.trip_id}::${cleanTitle}`, place);
      if (place.source_url) byUrlIdentity.set(`${place.trip_id}::${place.source_provider}::${normalizePlaceIdentity(place.source_url)}`, place);
      const geo = coordinateClusterKey(place);
      if (geo) byCoordinates.set(geo, place);
    };
    existing.forEach(indexPlace);
    const importedIds: string[] = [];
    const touchedTripIds = new Set<string>();

    for (const rawPlace of places) {
      if (!rawPlace.id || !rawPlace.trip_id || !existingTrips.has(rawPlace.trip_id)) continue;
      touchedTripIds.add(rawPlace.trip_id);
      const incoming: PlannerTripPlace = {
        ...rawPlace,
        tags: ensurePlaceKindTag(rawPlace.tags, rawPlace.kind),
        reservation_status: rawPlace.reservation_status ?? 'none',
        state: 'candidate',
      };
      const incomingCid = extractPlaceCid(incoming);
      const incomingTitle = canonicalizePlaceTitle(incoming.title);
      const incomingGeo = coordinateClusterKey(incoming);

      const existingPlace = byId.get(incoming.id)
        ?? (incoming.source_place_id ? byPlaceId.get(`${incoming.trip_id}::${incoming.source_provider}::${incoming.source_place_id}`) : undefined)
        ?? (incomingCid ? byCid.get(`${incoming.trip_id}::${incomingCid}`) : undefined)
        ?? (incomingTitle.length >= 2 ? byTitle.get(`${incoming.trip_id}::${incomingTitle}`) : undefined)
        ?? (incoming.source_url ? byUrlIdentity.get(`${incoming.trip_id}::${incoming.source_provider}::${normalizePlaceIdentity(incoming.source_url)}`) : undefined)
        ?? (incomingGeo ? byCoordinates.get(incomingGeo) : undefined);

      try {
        const persisted = existingPlace ? mergeCapturedPlaceResearch(existingPlace, incoming) : incoming;
        await this.upsert(persisted);
        indexPlace(persisted);
        importedIds.push(rawPlace.id);
      } catch (error) {
        console.warn(`[PlannerRepository] Failed to import research place ${rawPlace.id} (${rawPlace.title}):`, error);
      }
    }

    // Auto-deduplicate touched trips to ensure zero orphan duplicate markdown files
    for (const tripId of touchedTripIds) {
      try {
        await this.deduplicateTripPlaces(tripId);
      } catch (err) {
        console.warn(`[PlannerRepository] Auto-deduplication for trip ${tripId} encountered warning:`, err);
      }
    }

    return importedIds;
  }

  /**
   * Scans all places in a trip, identifies duplicate entities (by Place ID, CID, canonical title, or GPS proximity),
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

      const cid1 = extractPlaceCid(p1);
      const title1 = canonicalizePlaceTitle(p1.title);
      const geo1 = coordinateClusterKey(p1);

      for (let j = i + 1; j < allPlaces.length; j++) {
        const p2 = allPlaces[j];
        if (assigned.has(p2.id)) continue;
        const cid2 = extractPlaceCid(p2);
        const title2 = canonicalizePlaceTitle(p2.title);
        const geo2 = coordinateClusterKey(p2);

        const isMatch = (p1.source_place_id && p1.source_place_id === p2.source_place_id)
          || (cid1 && cid2 && cid1 === cid2)
          || (title1 && title2 && title1.length >= 3 && title1 === title2)
          || (p1.source_url && p2.source_url && normalizePlaceIdentity(p1.source_url) === normalizePlaceIdentity(p2.source_url))
          || (geo1 && geo2 && geo1 === geo2 && (title1.includes(title2) || title2.includes(title1)));

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
      let updatedPrimary = { ...primary };

      for (let k = 1; k < cluster.length; k++) {
        const duplicate = cluster[k];
        updatedPrimary = mergeCapturedPlaceResearch(updatedPrimary, duplicate);

        const dupVisits = visits.filter((v) => v.place_id === duplicate.id);
        for (const v of dupVisits) {
          await this.upsert({ ...v, place_id: primary.id, updated_at: new Date().toISOString() });
        }

        try {
          await this.store.deleteMarkdownFile(
            this.directory(PLANNER_DIRECTORIES.places),
            entityFileName(duplicate),
          );
          removedCount++;
        } catch (err) {
          console.warn(`[PlannerRepository] Failed to delete duplicate place file ${duplicate.id}:`, err);
        }
      }

      await this.upsert(updatedPrimary);
      mergedCount++;
    }

    return { mergedCount, removedCount };
  }

  async importCapturedPlaces(places: PlannerTripPlace[]): Promise<string[]> { return this.importResearchPlaces(places); }
  async importExternalCandidates(places: PlannerTripPlace[]): Promise<string[]> { return this.importResearchPlaces(places); }

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
