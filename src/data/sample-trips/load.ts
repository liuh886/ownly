/**
 * Lazy loader for the bundled Sample Trips.
 *
 * Each trip is a separate chunk on purpose: the Planner shows the picker on an
 * empty data folder, but only a deliberate click should pay for ~100 KB of
 * itinerary JSON. `validate:pages` only measures the assets an index.html
 * references, so a dynamic import costs the initial route nothing.
 */
import type { BuiltSampleTrip } from './build';
import { isSampleTripId, type SampleTripId } from './registry';

const LOADERS: Record<SampleTripId, () => Promise<BuiltSampleTrip>> = {
  'sample-thailand-6d': async () => (await import('./thailand')).THAILAND_SAMPLE_TRIP,
  'sample-china-8d': async () => (await import('./china')).CHINA_SAMPLE_TRIP,
  'sample-kansai-6d': async () => (await import('./kansai')).KANSAI_SAMPLE_TRIP,
};

export async function loadSampleTripBundle(id: SampleTripId): Promise<BuiltSampleTrip> {
  if (!isSampleTripId(id)) throw new Error(`Unknown Sample Trip: ${id}`);
  return LOADERS[id]();
}
