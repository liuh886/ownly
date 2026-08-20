import { parseMarkdownEntity, serializeMarkdownEntity } from '@/data/frontmatter';
import {
  mergeCapturedPlaceResearch,
  type PlannerTrip,
  type PlannerTripBooking,
  type PlannerTripPlace,
} from '@/domain/planner';
import { obsidianService } from './ObsidianFileSystemService';

const PLANNER_DIRECTORIES = {
  trips: 'Trips',
  places: 'Trip Places',
  bookings: 'Trip Bookings',
} as const;

type PlannerEntity = PlannerTrip | PlannerTripPlace | PlannerTripBooking;
type PlannerEntityType = PlannerEntity['type'];

function safeEntityId(id: string): string {
  const safe = id.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!safe) throw new Error('Planner entity id is empty');
  return safe;
}

function entityFileName(entity: PlannerEntity): string {
  const prefix = entity.type === 'trip' ? 'trip' : entity.type === 'trip_place' ? 'place' : 'booking';
  return `${prefix}--${safeEntityId(entity.id)}.md`;
}

export class PlannerRepository {
  private root = '';

  async initialize(): Promise<void> {
    this.root = await obsidianService.getDataFolder();
  }

  private directory(name: string): string {
    return this.root ? `${this.root}/${name}` : name;
  }

  private async list<T extends PlannerEntity>(
    directory: string,
    type: PlannerEntityType,
  ): Promise<T[]> {
    const files = await obsidianService.readMarkdownFiles(this.directory(directory));
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

  private async upsert(entity: PlannerEntity): Promise<void> {
    const directory = entity.type === 'trip'
      ? PLANNER_DIRECTORIES.trips
      : entity.type === 'trip_place'
        ? PLANNER_DIRECTORIES.places
        : PLANNER_DIRECTORIES.bookings;

    await obsidianService.writeMarkdownFile(
      this.directory(directory),
      entityFileName(entity),
      serializeMarkdownEntity(entity, ''),
    );
  }

  async upsertTrip(trip: PlannerTrip): Promise<void> {
    await this.upsert(trip);
  }

  async upsertPlace(place: PlannerTripPlace): Promise<void> {
    if (place.locked === undefined) {
      const existing = (await this.listPlaces()).find((item) => item.id === place.id);
      if (existing) {
        await this.upsert(mergeCapturedPlaceResearch(existing, place));
        return;
      }
    }
    await this.upsert(place);
  }

  async upsertBooking(booking: PlannerTripBooking): Promise<void> {
    await this.upsert(booking);
  }
}

export const plannerRepository = new PlannerRepository();
