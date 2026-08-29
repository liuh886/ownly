import { parseMarkdownEntity, serializeMarkdownEntity } from '@/data/frontmatter';
import {
  ensurePlaceKindTag,
  mergeCapturedPlaceResearch,
  normalizePlaceIdentity,
  type PlannerTrip,
  type PlannerTripPlace,
  type TripExpenseItem,
} from '@/domain/planner';
import { obsidianService } from './ObsidianFileSystemService';

export interface PlannerFileStore {
  getDataFolder(): Promise<string>;
  readMarkdownFiles(directory: string): Promise<{ fileName: string; content: string }[]>;
  writeMarkdownFile(directory: string, fileName: string, content: string): Promise<void>;
  deleteMarkdownFile(directory: string, fileName: string): Promise<void>;
}

const PLANNER_DIRECTORIES = {
  trips: 'Trips',
  places: 'Trip Places',
  expenses: 'Trip Expenses',
} as const;

type PlannerEntity = PlannerTrip | PlannerTripPlace
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
  const prefix = entity.type === 'trip' ? 'trip' : 'place';
  return `${prefix}--${safeEntityId(entity.id)}.md`;
}

function expenseFileName(expenseId: string): string {
  return `expense--${safeEntityId(expenseId)}.md`;
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

  private async list<T extends PlannerEntity>(
    directory: string,
    type: PlannerEntityType,
  ): Promise<T[]> {
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
    return places.map((p) => ({
      ...p,
      tags: ensurePlaceKindTag(p.tags, p.kind),
    }));
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
    const directory = entity.type === 'trip' ? PLANNER_DIRECTORIES.trips : PLANNER_DIRECTORIES.places;

    await this.store.writeMarkdownFile(
      this.directory(directory),
      entityFileName(entity),
      serializeMarkdownEntity(entity, ''),
    );
  }

  async upsertTrip(trip: PlannerTrip): Promise<void> {
    await this.upsert(trip);
  }

  async upsertPlace(place: PlannerTripPlace): Promise<void> {
    await this.upsert({
      ...place,
      tags: ensurePlaceKindTag(place.tags, place.kind),
    });
  }

  /** Canonical Planner writes: no Capture merge heuristics. */
  async upsertPlaces(places: PlannerTripPlace[]): Promise<void> {
    for (const place of places) {
      await this.upsertPlace(place);
    }
  }

  /**
   * Capture import is an explicit boundary. Existing Planner-owned decisions
   * remain authoritative; only observed/source facts are refreshed.
   */
  async importCapturedPlaces(places: PlannerTripPlace[]): Promise<void> {
    if (places.length === 0) return;
    await this.initialize();

    const existing = await this.listPlaces();
    const byId = new Map(existing.map((place) => [place.id, place] as const));
    const byPlaceId = new Map<string, PlannerTripPlace>();
    const byUrlIdentity = new Map<string, PlannerTripPlace>();
    const byCoordinates = new Map<string, PlannerTripPlace>();

    const coordinateKey = (place: PlannerTripPlace): string | null => {
      if (!place.coordinates) return null;
      return `${place.trip_id}::geo:${place.coordinates.lat.toFixed(5)},${place.coordinates.lng.toFixed(5)}`;
    };

    for (const place of existing) {
      if (place.source_place_id) byPlaceId.set(`${place.trip_id}::${place.source_provider}::${place.source_place_id}`, place);
      if (place.source_url) byUrlIdentity.set(`${place.trip_id}::${place.source_provider}::${normalizePlaceIdentity(place.source_url)}`, place);
      const geo = coordinateKey(place);
      if (geo) byCoordinates.set(geo, place);
    }

    for (const rawPlace of places) {
      const captured: PlannerTripPlace = {
        ...rawPlace,
        tags: ensurePlaceKindTag(rawPlace.tags, rawPlace.kind),
        reservation_status: rawPlace.reservation_status ?? 'none',
        state: 'candidate',
        scheduled_date: undefined,
        sort_order: undefined,
        locked: undefined,
      };
      const existingPlace = byId.get(captured.id)
        ?? (captured.source_place_id
          ? byPlaceId.get(`${captured.trip_id}::${captured.source_provider}::${captured.source_place_id}`)
          : undefined)
        ?? (coordinateKey(captured) ? byCoordinates.get(coordinateKey(captured)!) : undefined)
        ?? (captured.source_url
          ? byUrlIdentity.get(`${captured.trip_id}::${captured.source_provider}::${normalizePlaceIdentity(captured.source_url)}`)
          : undefined);

      if (existingPlace) {
        await this.upsert(mergeCapturedPlaceResearch(existingPlace, captured));
      } else {
        await this.upsert(captured);
      }
    }
  }


  /** Explicit lifecycle transition that bypasses capture-merge semantics. */
  async dropPlace(placeId: string): Promise<boolean> {
    await this.initialize();
    const existing = (await this.listPlaces()).find((place) => place.id === placeId);
    if (!existing) return false;
    await this.store.writeMarkdownFile(
      this.directory(PLANNER_DIRECTORIES.places),
      entityFileName(existing),
      serializeMarkdownEntity({ ...existing, state: 'dropped', updated_at: new Date().toISOString() }, ''),
    );
    return true;
  }

  /**
   * Scheduling lifecycle transitions — like dropPlace, these bypass
   * capture-merge so the schedule state is never silently reverted.
   */

  async schedulePlace(placeId: string, date: string, sortOrder?: number, locked?: boolean): Promise<PlannerTripPlace | null> {
    await this.initialize();
    const places = await this.listPlaces();
    const existing = places.find((place) => place.id === placeId);
    if (!existing) return null;
    const order = sortOrder ?? (
      existing.scheduled_date === date && existing.sort_order !== undefined
        ? existing.sort_order
        : places
            .filter((p) => p.id !== placeId && p.trip_id === existing.trip_id && p.scheduled_date === date)
            .reduce((max, p) => Math.max(max, p.sort_order ?? -1), -1) + 1
    );
    const next: PlannerTripPlace = {
      ...existing,
      state: 'scheduled',
      scheduled_date: date,
      sort_order: order,
      locked: locked !== undefined ? locked : (existing.locked ?? false),
      updated_at: new Date().toISOString(),
    };
    await this.upsert(next);
    return next;
  }

  async unschedulePlace(placeId: string): Promise<PlannerTripPlace | null> {
    await this.initialize();
    const places = await this.listPlaces();
    const existing = places.find((place) => place.id === placeId);
    if (!existing) return null;
    const next: PlannerTripPlace = {
      ...existing,
      state: 'candidate',
      scheduled_date: undefined,
      sort_order: undefined,
      locked: false,
      updated_at: new Date().toISOString(),
    };
    await this.upsert(next);
    return next;
  }

  async toggleLockPlace(placeId: string): Promise<PlannerTripPlace | null> {
    await this.initialize();
    const places = await this.listPlaces();
    const existing = places.find((place) => place.id === placeId);
    if (!existing) return null;
    const next: PlannerTripPlace = {
      ...existing,
      locked: !existing.locked,
      updated_at: new Date().toISOString(),
    };
    await this.upsert(next);
    return next;
  }

  /** Rewrites sort_order 0..n-1 for an explicitly ordered subset of one day. */
  async reorderScheduled(date: string, orderedIds: string[]): Promise<number> {
    await this.initialize();
    const places = await this.listPlaces();
    const byId = new Map(places.map((p) => [p.id, p] as const));
    const ordered = orderedIds
      .map((id) => byId.get(id))
      .filter((p): p is PlannerTripPlace => Boolean(p) && p!.scheduled_date === date);
    let written = 0;
    for (let i = 0; i < ordered.length; i++) {
      const place = ordered[i];
      if (place.sort_order === i) continue;
      const next: PlannerTripPlace = { ...place, sort_order: i, updated_at: new Date().toISOString() };
      await this.store.writeMarkdownFile(
        this.directory(PLANNER_DIRECTORIES.places),
        entityFileName(next),
        serializeMarkdownEntity(next, ''),
      );
      written += 1;
    }
    return written;
  }

  async upsertExpense(expense: TripExpenseItem): Promise<void> {
    await this.initialize();
    await this.store.writeMarkdownFile(
      this.directory(PLANNER_DIRECTORIES.expenses),
      expenseFileName(expense.id),
      serializeMarkdownEntity(toRepoExpense(expense), ''),
    );
  }

  async deleteExpense(expenseId: string): Promise<void> {
    await this.initialize();
    await this.store.deleteMarkdownFile(
      this.directory(PLANNER_DIRECTORIES.expenses),
      expenseFileName(expenseId),
    );
  }
}

export const plannerRepository = new PlannerRepository();
