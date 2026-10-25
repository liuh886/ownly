import { describe, expect, it, vi } from 'vitest';
import type { WYQDRepositoryAdapter, WYQDStoredEntity } from '@/core/repository';
import type { PlannerTrip } from '@/domain/planner';
import type { WYQDObject } from '@/domain/types';
import { saveUnifiedTrip, syncExperienceToTrip } from './TripExperienceService';
import { experienceFromTrip } from '@/domain/trip-experience';

const trip: PlannerTrip = { schema_version: '0.1', type: 'trip', id: 't1', title: 'Kyoto',
  status: 'planning', start_date: '2026-11-01', end_date: '2026-11-05',
  destinations: ['Kyoto'], currency: 'CNY', created_at: '2026-10-01' };
function setup() {
  const objects: WYQDStoredEntity<WYQDObject>[] = [];
  const trips: PlannerTrip[] = [];
  const repository = {
    listObjects: async () => objects, listReviews: async () => [],
    saveObject: vi.fn(async (entity: WYQDObject, body = '') => { objects.push({ entity, body, fileName: 'exp.md' }); return 'exp.md'; }),
    updateObject: vi.fn(async (fileName: string, entity: WYQDObject, body = '') => { objects[objects.findIndex((o) => o.fileName === fileName)] = { entity, body, fileName }; }),
    archiveObject: vi.fn(async () => { objects.pop(); }),
  } as unknown as WYQDRepositoryAdapter;
  const planner = {
    listTrips: async () => trips, listExpenses: async () => [],
    upsertTrip: vi.fn(async (entity: PlannerTrip) => { const i = trips.findIndex((t) => t.id === entity.id); if (i < 0) trips.push(entity); else trips[i] = entity; }),
  };
  return { objects, trips, repository, planner };
}
describe('one travel experience across Objects and Planner', () => {
  it('creates one stable object, reuses it on save and synchronizes completion/reopening', async () => {
    const s = setup();
    const first = await saveUnifiedTrip(s.repository, s.planner, trip, () => {});
    await saveUnifiedTrip(s.repository, s.planner, { ...first, title: 'Kyoto autumn', status: 'completed' }, () => {});
    expect(s.objects).toHaveLength(1);
    expect(s.objects[0].entity).toMatchObject({ id: first.experience_id, title: 'Kyoto autumn', status: 'completed' });
    await saveUnifiedTrip(s.repository, s.planner, { ...s.trips[0], status: 'planning' }, () => {});
    expect(s.objects[0].entity.status).toBe('planned');
  });
  it('explicitly links an existing intention and preserves its budget, notes and location metadata', async () => {
    const s = setup();
    const object = { ...experienceFromTrip(trip), id: 'original', budget_total: 5000,
      worldview_tags: ['history'], location: { city: 'Kyoto', country_code: 'JP' } };
    s.objects.push({ fileName: 'original.md', entity: object, body: 'My original intention' });
    await saveUnifiedTrip(s.repository, s.planner, { ...trip, experience_id: object.id }, () => {});
    expect(s.objects).toHaveLength(1);
    expect(s.objects[0]).toMatchObject({ body: 'My original intention', entity: { budget_total: 5000, worldview_tags: ['history'], location: { country_code: 'JP' } } });
    await syncExperienceToTrip(s.planner, { ...object, title: 'New title', started_at: '2026-11-02' });
    expect(s.trips[0]).toMatchObject({ title: 'New title', start_date: '2026-11-02', experience_id: object.id });
  });
  it('recognizes legacy review_id without creating a duplicate', async () => {
    const s = setup();
    s.objects.push({ fileName: 'old.md', entity: experienceFromTrip(trip), body: 'Legacy notes' });
    const legacy = { ...trip, review_id: s.objects[0].entity.id };
    s.trips.push(legacy);
    const saved = await saveUnifiedTrip(s.repository, s.planner, legacy, () => {});
    expect(saved.experience_id).toBe(legacy.review_id);
    expect(s.repository.saveObject).not.toHaveBeenCalled();
  });
  it('rejects conflicting, missing and already-linked identities and stale edits', async () => {
    const s = setup();
    const first = await saveUnifiedTrip(s.repository, s.planner, trip, () => {});
    await expect(saveUnifiedTrip(s.repository, s.planner, { ...first, experience_id: 'other' }, () => {})).rejects.toThrow('already linked');
    await expect(saveUnifiedTrip(s.repository, s.planner, { ...trip, id: 't2', experience_id: first.experience_id }, () => {})).rejects.toThrow('another trip');
    await expect(saveUnifiedTrip(s.repository, s.planner, { ...trip, id: 't3', experience_id: 'missing' }, () => {})).rejects.toThrow('missing');
    await expect(saveUnifiedTrip(s.repository, s.planner, first, () => {}, trip)).rejects.toThrow('Trip changed');
  });
  it('restores original notes and budget if the itinerary write fails', async () => {
    const s = setup();
    const first = await saveUnifiedTrip(s.repository, s.planner, trip, () => {});
    const original = s.objects[0];
    s.planner.upsertTrip.mockRejectedValueOnce(new Error('Disk full'));
    await expect(saveUnifiedTrip(s.repository, s.planner, { ...first, title: 'Edited' }, () => {})).rejects.toThrow('Disk full');
    expect(s.objects[0]).toEqual(original);
  });
  it('does not relabel monetary amounts when changing currency', async () => {
    const s = setup();
    const first = await saveUnifiedTrip(s.repository, s.planner, trip, () => {});
    s.objects[0].entity = { ...s.objects[0].entity, budget_total: 5000 } as WYQDObject;
    await expect(saveUnifiedTrip(s.repository, s.planner, { ...first, currency: 'JPY' }, () => {})).rejects.toThrow('currency');
    expect(s.trips[0].currency).toBe('CNY');
  });
});
