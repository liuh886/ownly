import { describe, expect, it } from 'vitest';
import { applyCaptureImportReport, asCaptureCandidate, type OwnlyCaptureState, type PlannerTripPlace } from '../domain/planner';

const place = (id: string, title = id): PlannerTripPlace => ({
  schema_version: '0.1', type: 'trip_place', id, trip_id: 'trip-1', title,
  source_provider: 'google_maps', source_url: `https://maps.google.com/?cid=${id}`, kind: 'transit',
  tags: [], signals: [], risks: [], reservation_status: 'none', state: 'candidate', created_at: '2026-09-02T00:00:00.000Z',
});

describe('Capture import report application', () => {
  it('keeps failed candidates retryable and removes only imported candidates', () => {
    const state: OwnlyCaptureState = {
      version: 2,
      activeContext: { tripId: 'trip-1', title: 'Thailand' },
      pendingPlaces: [asCaptureCandidate(place('ok')), asCaptureCandidate(place('bkk', 'Suvarnabhumi Airport'))],
    };
    const next = applyCaptureImportReport(state, {
      received: 2,
      created: ['ok'],
      updated: [],
      deduped: [],
      failed: [{ id: 'bkk', title: 'Suvarnabhumi Airport', reason: 'missing_place_identity' }],
    }, '2026-09-02');

    expect(next.pendingPlaces).toHaveLength(1);
    expect(next.pendingPlaces[0]).toMatchObject({
      id: 'bkk', status: 'failed', reason: 'missing_place_identity', lastAttempt: '2026-09-02',
    });
    expect(next.lastImportReport).toMatchObject({ received: 2, created: ['ok'] });
  });
});
