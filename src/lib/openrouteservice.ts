import type { PlannerTravelMode } from '@/domain/planner';

const ORS_BASE_URL = 'https://api.heigit.org/openrouteservice/v2/directions';
const ORS_MATRIX_BASE_URL = 'https://api.heigit.org/openrouteservice/v2/matrix';

export const ORS_API_KEY_STORAGE_KEY = 'ownly_planner_ors_api_key';

export class OrsRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'OrsRequestError';
  }
}

export class OrsDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrsDataError';
  }
}

export function openRouteServiceProfile(mode: PlannerTravelMode): string | null {
  if (mode === 'driving' || mode === 'motorcycle') return 'driving-car';
  if (mode === 'walking') return 'foot-walking';
  if (mode === 'bicycling') return 'cycling-regular';
  return null;
}

export async function fetchOpenRouteServiceLeg(
  apiKey: string,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: PlannerTravelMode,
): Promise<{ duration_minutes: number; distance_meters: number }> {
  const profile = openRouteServiceProfile(mode);
  if (!profile) throw new OrsDataError('OpenRouteService does not provide public-transit routing; record this leg manually.');
  if (!apiKey.trim()) throw new OrsDataError('OPENROUTESERVICE_API_KEY is required to refresh travel legs.');

  const response = await fetch(`${ORS_BASE_URL}/${profile}`, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    // Motorcycles are banned from expressways/motorways in Thailand (and most
    // of the region): without this the car profile happily routes them onto
    // tollways, producing illegal routes and systematically fast times.
    // The matrix endpoint does not support avoid_features, so motorcycle
    // pairs go through this per-leg call instead of the matrix.
    body: JSON.stringify({
      coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
      ...(mode === 'motorcycle' ? { options: { avoid_features: ['highways', 'tollways'] } } : {}),
    }),
  });
  if (!response.ok) throw new OrsRequestError(`OpenRouteService request failed (${response.status}).`, response.status);
  const payload = await response.json() as { routes?: Array<{ summary?: { duration?: number; distance?: number } }> };
  const summary = payload.routes?.[0]?.summary;
  if (!summary || !Number.isFinite(summary.duration) || !Number.isFinite(summary.distance)) {
    throw new OrsDataError('OpenRouteService returned no usable route summary.');
  }
  return {
    duration_minutes: Math.max(1, Math.ceil(Number(summary.duration) / 60)),
    distance_meters: Math.max(0, Math.round(Number(summary.distance))),
  };
}

export interface OpenRouteServiceMatrixResult {
  durations_minutes: Array<Array<number | null>>;
  distances_meters: Array<Array<number | null>>;
}

export async function fetchOpenRouteServiceMatrix(
  apiKey: string,
  places: Array<{ coordinates: { lat: number; lng: number } }>,
  mode: PlannerTravelMode,
): Promise<OpenRouteServiceMatrixResult> {
  const profile = openRouteServiceProfile(mode);
  if (!profile) throw new OrsDataError('OpenRouteService does not provide public-transit routing; travel-time optimization requires walking, driving or bicycling.');
  if (!apiKey.trim()) throw new OrsDataError('OPENROUTESERVICE_API_KEY is required for travel-time optimization.');
  const response = await fetch(`${ORS_MATRIX_BASE_URL}/${profile}`, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      locations: places.map((place) => [place.coordinates.lng, place.coordinates.lat]),
      metrics: ['duration', 'distance'],
    }),
  });
  if (!response.ok) throw new OrsRequestError(`OpenRouteService matrix request failed (${response.status}).`, response.status);
  const payload = await response.json() as {
    durations?: Array<Array<number | null>>;
    distances?: Array<Array<number | null>>;
  };
  if (!Array.isArray(payload.durations) || !Array.isArray(payload.distances)) {
    throw new OrsDataError('OpenRouteService returned no usable travel-time matrix.');
  }
  return {
    durations_minutes: payload.durations.map((row) => row.map((value) => value === null ? null : Math.max(0, Math.ceil(value / 60)))),
    distances_meters: payload.distances.map((row) => row.map((value) => value === null ? null : Math.max(0, Math.round(value)))),
  };
}

function runtimeApiKeyEnv(): string {
  try {
    return process.env.NEXT_PUBLIC_OPENROUTESERVICE_API_KEY ?? '';
  } catch {
    return '';
  }
}

export function loadOrsApiKey(): string {
  if (typeof window === 'undefined') return runtimeApiKeyEnv();
  try {
    return window.localStorage.getItem(ORS_API_KEY_STORAGE_KEY)?.trim() || runtimeApiKeyEnv();
  } catch {
    return runtimeApiKeyEnv();
  }
}

export function saveOrsApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (key.trim()) window.localStorage.setItem(ORS_API_KEY_STORAGE_KEY, key.trim());
    else window.localStorage.removeItem(ORS_API_KEY_STORAGE_KEY);
  } catch {
    // storage unavailable (private mode) — key stays session-only
  }
}
