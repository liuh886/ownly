// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { focusPlannerTrip, PLANNER_SELECTED_TRIP_STORAGE_KEY } from './planner-focus';

describe('focusPlannerTrip', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('records the trip id under the planner selection key', () => {
    focusPlannerTrip('trip-42');
    expect(window.localStorage.getItem(PLANNER_SELECTED_TRIP_STORAGE_KEY)).toBe('trip-42');
  });

  it('ignores empty trip ids', () => {
    focusPlannerTrip('');
    expect(window.localStorage.getItem(PLANNER_SELECTED_TRIP_STORAGE_KEY)).toBeNull();
  });
});
