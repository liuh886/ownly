import { describe, expect, it } from 'vitest';
import type { PlannerTripPlace } from './planner';
import {
  computeUrgencies,
  daysUntil,
  isWeatherRelevant,
  summarizeWeather,
  type OpenMeteoResponse,
} from './departure';

const NOW = new Date('2026-10-20T12:00:00Z');

function place(id: string, overrides: Partial<PlannerTripPlace> = {}): PlannerTripPlace {
  return {
    schema_version: '0.1',
    type: 'trip_place',
    id,
    trip_id: 't1',
    title: `Place ${id}`,
    source_provider: 'google_maps',
    source_url: `https://www.google.com/maps/place/${id}`,
    kind: 'attraction',
    priority: 'want',
    tags: [],
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('daysUntil', () => {
  it('computes positive days for future dates', () => {
    expect(daysUntil('2026-10-27', NOW)).toBe(7);
  });
  it('returns 0 for today', () => {
    expect(daysUntil('2026-10-20', NOW)).toBe(0);
  });
  it('returns negative for past dates', () => {
    expect(daysUntil('2026-10-13', NOW)).toBe(-7);
  });
});

describe('isWeatherRelevant', () => {
  it('is true when trip starts within 16 days', () => {
    expect(isWeatherRelevant('2026-10-25', NOW)).toBe(true);
    expect(isWeatherRelevant('2026-11-05', NOW)).toBe(true);
  });
  it('is false when trip is too far out or already started long ago', () => {
    expect(isWeatherRelevant('2026-12-15', NOW)).toBe(false);
    expect(isWeatherRelevant('2026-09-01', NOW)).toBe(false);
  });
});

describe('weatherLabel & summarizeWeather', () => {
  const mockResponse: OpenMeteoResponse = {
    daily: {
      time: ['2026-10-25', '2026-10-26'],
      temperature_2m_max: [32, 28],
      temperature_2m_min: [24, 22],
      precipitation_sum: [0, 12.5],
      weather_code: [1, 65],
    },
  };

  it('summarizes forecasts with rain detection and labels', () => {
    const result = summarizeWeather(mockResponse);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('🌤️');
    expect(result[0].is_rainy).toBe(false);
    expect(result[1].label).toBe('⛈️');
    expect(result[1].is_rainy).toBe(true);
    expect(result[1].temp_max).toBe(28);
  });

  it('handles missing optional fields gracefully', () => {
    const empty = summarizeWeather({ daily: { time: ['2026-10-25'] } });
    expect(empty[0].precipitation_mm).toBe(0);
    expect(empty[0].weather_code).toBe(0);
  });
});

describe('computeUrgencies', () => {
  it('flags reservation lead-time risk when within window', () => {
    // Trip in 10 days; place needs 14-day advance booking → already past deadline → urgent
    const places = [
      place('restaurant', {
        kind: 'food',
        risks: ['需提前2周预约'],
        reservation_status: 'needed',
      }),
    ];
    const urgencies = computeUrgencies(places, '2026-10-30', NOW);
    expect(urgencies.some((u) => u.kind === 'reservation_lead_time' && u.severity === 'urgent')).toBe(true);
  });

  it('shows warning when lead-time is approaching but not yet past', () => {
    // Trip in 18 days; lead is 14 → not yet late, but approaching
    const places = [
      place('restaurant', { kind: 'food', risks: ['需提前2周预约'] }),
    ];
    const urgencies = computeUrgencies(places, '2026-11-07', NOW);
    expect(urgencies.some((u) => u.kind === 'reservation_lead_time' && u.severity === 'warning')).toBe(true);
  });

  it('does not flag lead-time when plenty of days remain', () => {
    const places = [
      place('restaurant', { kind: 'food', risks: ['需提前2周预约'] }),
    ];
    // Trip in 60 days → 14-day lead time not yet urgent
    expect(computeUrgencies(places, '2026-12-19', NOW)).toHaveLength(0);
  });

  it('flags unbooked stay when departure is near', () => {
    const places = [
      place('hotel', { kind: 'stay', state: 'candidate' }),
    ];
    const urgencies = computeUrgencies(places, '2026-10-25', NOW); // 5 days out
    expect(urgencies.some((u) => u.kind === 'unbooked_stay' && u.severity === 'urgent')).toBe(true);
  });

  it('flags stale price observations older than 30 days', () => {
    const places = [
      place('old', { observed_price: '฿200', observed_at: '2026-08-01' }),
    ];
    const urgencies = computeUrgencies(places, '2026-10-25', NOW);
    expect(urgencies.some((u) => u.kind === 'stale_price')).toBe(true);
  });

  it('ignores dropped places and returns empty for far-future trips', () => {
    expect(computeUrgencies([place('x', { state: 'dropped' })], '2026-10-25', NOW)).toHaveLength(0);
    expect(computeUrgencies([place('x')], '2027-06-01', NOW)).toHaveLength(0);
  });
});
