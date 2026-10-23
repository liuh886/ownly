// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlannerTrip, PlannerTripLeg } from '@/domain/planner';
import type { PlannerScheduledPlace } from '@/domain/planner-visits';
import { createPublicationCredentials } from './publication-credentials';
import type { PlannerDataReturn } from './usePlannerData';
const mocks = vi.hoisted(() => ({ upsertLeg: vi.fn(), upsertTrip: vi.fn(), upsertExpense: vi.fn(), listTrips: vi.fn(), patchTripCalendarFeed: vi.fn(), publishFeed: vi.fn(), publishShare: vi.fn(), disableShare: vi.fn(), withWriteSession: vi.fn(), identity: 'session-A', namespace: 'folder-A' }));
vi.mock('@/core/ownly-workspace-context', () => { const workspace = { runtimeTarget: 'web', storageGet: (key: string) => window.localStorage.getItem(key), storageSet: (key: string, value: string) => window.localStorage.setItem(key, value) }; return { useOwnlyWorkspace: () => workspace }; });
vi.mock('@/services/ownlyStoreRouter', () => ({ captureWorkspaceIdentity: () => mocks.identity, isWorkspaceIdentityCurrent: (identity: string) => identity === mocks.identity, getStableWorkspaceNamespace: async () => mocks.namespace }));
vi.mock('@/services/PlannerRepository', () => ({ plannerRepository: mocks }));
vi.mock('@/services/CalendarFeedService', () => ({ calendarFeedService: { publishFeed: mocks.publishFeed } }));
vi.mock('@/services/TripShareService', () => ({ tripShareService: { publishShare: mocks.publishShare, disableShare: mocks.disableShare } }));
vi.mock('./useAutoCalendarSync', () => ({ useAutoCalendarSync: vi.fn() }));
vi.mock('./useAutoTripShareSync', () => ({ useAutoTripShareSync: vi.fn() }));
import { usePlannerActions } from './usePlannerActions';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const trip: PlannerTrip = { schema_version: '0.1', type: 'trip', id: 't1', title: 'Trip', status: 'planning',
  start_date: '2026-10-05', end_date: '2026-10-06', destinations: ['Tokyo'], created_at: '2026-10-01', currency: 'CNY' };
const oldLeg: PlannerTripLeg = { schema_version: '0.1', type: 'trip_leg', id: 'leg:t1:a:b', trip_id: 't1',
  from_place_id: 'a', to_place_id: 'b', mode: 'walking', duration_minutes: 20, source: 'manual', created_at: '2026-10-01' };
let root: Root;
let actions: ReturnType<typeof usePlannerActions>;
let data: PlannerDataReturn;
beforeEach(async () => {
  vi.resetAllMocks();
  window.localStorage.clear();
  mocks.identity = 'session-A'; mocks.namespace = 'folder-A';
  mocks.withWriteSession.mockImplementation(async (action) => action(mocks));
  mocks.listTrips.mockResolvedValue([trip]);
  data = { zh: false, language: 'en', selectedTripId: trip.id, selectedTrip: trip,
    trips: [trip], places: [], visits: [], legs: [oldLeg], tripDates: [], activeDate: '', scheduled: [], scheduledAll: [],
    sortedPendingCandidates: [], selectedCandidateIds: new Set(), isBatchOperating: false, isScheduling: false,
    isPro: true, currentUserId: 'user', currentExpenses: [], busy: false,
    load: vi.fn(async () => {}), setNotice: vi.fn(), setNoticeAction: vi.fn(), setConfirmRequest: vi.fn(), setBusy: vi.fn(),
    setTrips: vi.fn(), setVisits: vi.fn(), setLegs: vi.fn(), setExpensesByTrip: vi.fn(), setMembersByTrip: vi.fn(),
    setSelectedTripId: vi.fn(), setSelectedCandidateIds: vi.fn(), setIsMultiSelectMode: vi.fn(), setCapturePending: vi.fn(),
    setIsBatchOperating: vi.fn(), setIsScheduling: vi.fn(),
  } as unknown as PlannerDataReturn;
  root = createRoot(document.createElement('div'));
  function Probe() { const value = usePlannerActions({ data, disabled: false }); useEffect(() => { actions = value; }); return null; }
  await act(async () => root.render(<Probe />));
});
afterEach(async () => { await act(async () => root.unmount()); });
describe('Planner persistence actions', () => {
  it('restores the exact old leg, whose canonical ID equals the cleared leg ID', async () => {
    const from = { id: 'visit-a', place_id: 'a' } as PlannerScheduledPlace;
    const to = { id: 'visit-b', place_id: 'b' } as PlannerScheduledPlace;
    await act(async () => actions.handleClearTravelEstimate(from, to));
    expect(mocks.upsertLeg.mock.calls[0][0]).toMatchObject({ id: oldLeg.id, duration_minutes: 0 });
    const undo = vi.mocked(data.setNoticeAction).mock.calls[0][0] as { run: () => void };
    await act(async () => undo.run());
    expect(mocks.upsertLeg.mock.calls[1][0]).toEqual(oldLeg);
  });
  it('rejects unsaved expenses so the editor can retain its draft', async () => {
    mocks.upsertExpense.mockRejectedValueOnce(new Error('Disk denied'));
    await expect(actions.handleAddExpense({ trip_id: trip.id, title: 'Dinner', category: 'food', amount: 100,
      currency: 'CNY', paid_by: 'Me', split_members: ['Me'] })).rejects.toThrow('Disk denied');
    expect(data.setExpensesByTrip).not.toHaveBeenCalled();
  });
  it('does not update displayed conversion rates on a failed disk write', async () => {
    mocks.upsertTrip.mockRejectedValueOnce(new Error('Disk denied'));
    await expect(actions.handleUpdateFxRates({ USD: 7 })).rejects.toThrow('Disk denied');
    expect(data.setTrips).not.toHaveBeenCalled();
    expect(data.setNotice).toHaveBeenCalledWith(expect.stringContaining('original rates'));
    await actions.handleUpdateFxRates({ USD: 7 });
    expect(data.setTrips).toHaveBeenCalledOnce();
  });
  it('reuses a cloud-issued calendar token when the local receipt write failed', async () => {
    const feed = { trip_id: trip.id, feed_token: 'cloud-issued-token', created_at: '2026-10-01', updated_at: '2026-10-01', enabled: true };
    mocks.publishFeed.mockResolvedValue({ feed, url: 'https://calendar.test', ics: '' });
    mocks.patchTripCalendarFeed.mockRejectedValueOnce(new Error('Disk denied')).mockResolvedValue(true);
    await expect(actions.handleCreateOrUpdateFeed()).rejects.toThrow('cloud calendar was updated');
    await actions.handleCreateOrUpdateFeed();
    expect(mocks.publishFeed.mock.calls[1][0].trip.calendar_feed.feed_token).toBe(feed.feed_token);
  });
  it('serializes disabling behind an in-flight publish, then reads and revokes its newly issued token', async () => {
    let finish!: (response: unknown) => void;
    mocks.publishShare.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const publish = actions.handlePublishTripShare();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const disable = actions.handleDisableTripShare();
    expect(mocks.disableShare).not.toHaveBeenCalled();
    await act(async () => {
      finish({ share: { alias: 'Trip', updated_at: '2026-10-01' }, write_token: 'new-token', url: 'https://share.test', html: '' });
      await Promise.all([publish, disable]);
    });
    expect(mocks.disableShare).toHaveBeenCalledWith(expect.objectContaining({ writeToken: 'new-token' }));
    expect(createPublicationCredentials('folder-A', 'session-A', (key) => window.localStorage.getItem(key), (key, value) => window.localStorage.setItem(key, value)).loadShare(trip.id)?.enabled).toBe(false);
  });

  it('rejects Undo after a folder switch without restoring into the new folder', async () => {
    await act(async () => actions.handleClearTravelEstimate({ id: 'visit-a', place_id: 'a' } as PlannerScheduledPlace,
      { id: 'visit-b', place_id: 'b' } as PlannerScheduledPlace));
    const undo = vi.mocked(data.setNoticeAction).mock.calls[0][0] as { run: () => void };
    mocks.identity = 'session-B';
    await act(async () => undo.run());
    expect(mocks.upsertLeg).toHaveBeenCalledOnce();
    expect(data.setNotice).toHaveBeenCalledWith(expect.stringContaining('Undo failed'));
  });

});
