import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOpenRouteServiceLeg, fetchOpenRouteServiceMatrix, openRouteServiceProfile } from './openrouteservice';

afterEach(() => vi.unstubAllGlobals());

describe('OpenRouteService travel-leg adapter', () => {
  it('maps only the supported Ownly modes', () => {
    expect(openRouteServiceProfile('driving')).toBe('driving-car');
    expect(openRouteServiceProfile('walking')).toBe('foot-walking');
    expect(openRouteServiceProfile('bicycling')).toBe('cycling-regular');
    expect(openRouteServiceProfile('transit')).toBeNull();
  });

  it('converts route seconds/meters into bounded leg facts', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      routes: [{ summary: { duration: 901, distance: 1234.4 } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchOpenRouteServiceLeg('test-key', { lat: 13.74, lng: 100.50 }, { lat: 13.75, lng: 100.51 }, 'walking');
    expect(result).toEqual({ duration_minutes: 16, distance_meters: 1234 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.heigit.org/openrouteservice/v2/directions/foot-walking',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('converts matrix seconds and meters without persisting the matrix', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      durations: [[0, 601], [599, 0]],
      distances: [[0, 1234.4], [1200.2, 0]],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchOpenRouteServiceMatrix('test-key', [
      { coordinates: { lat: 13.74, lng: 100.50 } },
      { coordinates: { lat: 13.75, lng: 100.51 } },
    ], 'driving');
    expect(result.durations_minutes).toEqual([[0, 11], [10, 0]]);
    expect(result.distances_meters).toEqual([[0, 1234], [1200, 0]]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.heigit.org/openrouteservice/v2/matrix/driving-car',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('refuses to fabricate transit routing', async () => {
    await expect(fetchOpenRouteServiceLeg('test-key', { lat: 0, lng: 0 }, { lat: 1, lng: 1 }, 'transit')).rejects.toThrow(/public-transit/);
  });
});
