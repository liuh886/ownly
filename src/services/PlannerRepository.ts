import { parseMarkdownEntity, serializeMarkdownEntity } from '@/data/frontmatter';
import {
  mergeCapturedPlaceResearch,
  type PlannerTrip,
  type PlannerTripBooking,
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
  bookings: 'Trip Bookings',
  expenses: 'Trip Expenses',
} as const;

type PlannerEntity = PlannerTrip | PlannerTripPlace | PlannerTripBooking;
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
  const safe = id.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!safe) throw new Error('Planner entity id is empty');
  return safe;
}

function entityFileName(entity: PlannerEntity): string {
  const prefix = entity.type === 'trip' ? 'trip' : entity.type === 'trip_place' ? 'place' : 'booking';
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
    return this.list<PlannerTripPlace>(PLANNER_DIRECTORIES.places, 'trip_place');
  }

  async listBookings(): Promise<PlannerTripBooking[]> {
    return this.list<PlannerTripBooking>(PLANNER_DIRECTORIES.bookings, 'trip_booking');
  }

  async listExpenses(): Promise<TripExpenseItem[]> {
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
    const directory = entity.type === 'trip'
      ? PLANNER_DIRECTORIES.trips
      : entity.type === 'trip_place'
        ? PLANNER_DIRECTORIES.places
        : PLANNER_DIRECTORIES.bookings;

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
    await this.upsertPlaces([place]);
  }

  async upsertPlaces(places: PlannerTripPlace[]): Promise<void> {
    if (places.length === 0) return;
    const needsMerge = places.some((place) => place.locked === undefined);
    const existingMap = new Map<string, PlannerTripPlace>();
    if (needsMerge) {
      for (const existing of await this.listPlaces()) existingMap.set(existing.id, existing);
    }
    for (const place of places) {
      if (place.locked === undefined) {
        const existing = existingMap.get(place.id);
        if (existing) {
          await this.upsert(mergeCapturedPlaceResearch(existing, place));
          continue;
        }
      }
      await this.upsert(place);
    }
  }

  async upsertBooking(booking: PlannerTripBooking): Promise<void> {
    await this.upsert(booking);
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
