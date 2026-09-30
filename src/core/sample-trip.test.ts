import { describe, expect, it } from 'vitest';
import { isSampleTrip, resolveSampleTripPrompt } from './sample-trip';
import { SAMPLE_TRIP_TAG } from '@/data/sample-trips/registry';

const READY = { isConnected: true, dataLoaded: true, tripCount: 0, loaded: false, dismissed: false };

describe('resolveSampleTripPrompt', () => {
  it('offers the picker on a connected, loaded, trip-less data folder', () => {
    expect(resolveSampleTripPrompt(READY)).toEqual({ showPicker: true, showCompactLink: true });
  });

  it('never writes before a click, and never re-offers after one load', () => {
    expect(resolveSampleTripPrompt({ ...READY, loaded: true })).toEqual({
      showPicker: false,
      showCompactLink: false,
    });
  });

  it('downgrades to a compact link once dismissed', () => {
    expect(resolveSampleTripPrompt({ ...READY, dismissed: true })).toEqual({
      showPicker: false,
      showCompactLink: true,
    });
  });

  it('stays away while the data folder is not connected', () => {
    expect(resolveSampleTripPrompt({ ...READY, isConnected: false })).toEqual({
      showPicker: false,
      showCompactLink: false,
    });
  });

  it('stays away while data is still loading', () => {
    expect(resolveSampleTripPrompt({ ...READY, dataLoaded: false })).toEqual({
      showPicker: false,
      showCompactLink: false,
    });
  });

  it('stops offering once the user has any trip, including a loaded Sample Trip', () => {
    // A loaded Sample Trip counts: the user now has something to read, so
    // pushing more example data at them is noise.
    expect(resolveSampleTripPrompt({ ...READY, tripCount: 1, loaded: true })).toEqual({
      showPicker: false,
      showCompactLink: false,
    });
    expect(resolveSampleTripPrompt({ ...READY, tripCount: 2 })).toEqual({
      showPicker: false,
      showCompactLink: false,
    });
  });
});

describe('isSampleTrip', () => {
  it('detects the marker tag on a loaded Sample Trip', () => {
    expect(isSampleTrip({ tags: ['sample', '示例'] })).toBe(true);
  });

  it('treats a hand-made trip as ordinary', () => {
    expect(isSampleTrip({ tags: ['度假'] })).toBe(false);
    expect(isSampleTrip({ tags: undefined })).toBe(false);
    expect(isSampleTrip({ tags: [] })).toBe(false);
  });

  it('uses the single shared tag constant', () => {
    expect(SAMPLE_TRIP_TAG).toBe('sample');
  });
});
