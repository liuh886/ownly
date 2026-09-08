import { describe, expect, it } from 'vitest';
import {
  defaultLayerState,
  isDayLit,
  resolveLayerPoints,
  ROUTES_LAYER_GRAY,
  routeStrokeForDay,
  type MapLayerPoint,
} from './map-layers';

const DAY_COLOR = '#e11d48';

function point(overrides: Partial<MapLayerPoint> & { id: string }): MapLayerPoint & { id: string } {
  return { isScheduled: true, ...overrides };
}

describe('resolveLayerPoints (layer model)', () => {
  const active = point({ id: 'a', isScheduled: true, isActiveDay: true, dayIndex: 0 });
  const other = point({ id: 'b', isScheduled: true, isActiveDay: false, dayIndex: 1 });
  const candidate = point({ id: 'c', isScheduled: false });
  const all = [active, other, candidate];

  it('defaults to the legacy "all" view: active stops + candidates', () => {
    expect(resolveLayerPoints(all, defaultLayerState()).map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('adds other-day stops only with the routes layer', () => {
    const state = { ...defaultLayerState(), showRoutesLayer: true };
    expect(resolveLayerPoints(all, state).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('isolates the active day with both layers off', () => {
    const state = { ...defaultLayerState(), showCandidates: false };
    expect(resolveLayerPoints(all, state).map((p) => p.id)).toEqual(['a']);
  });

  it('supports a candidates-only view with scheduled hidden only via explicit flags', () => {
    // Layers are additive on the active-day base: there is deliberately no
    // "candidates only" state (the old exclusive mode is gone).
    const state = { ...defaultLayerState(), showRoutesLayer: true, showCandidates: true };
    expect(resolveLayerPoints(all, state)).toHaveLength(3);
  });
});

describe('isDayLit (legend toggles)', () => {
  it('keeps the active day always lit and toggles others explicitly', () => {
    const state = { coloredDays: [2] as const };
    expect(isDayLit(0, 0, state)).toBe(true);
    expect(isDayLit(2, 0, state)).toBe(true);
    expect(isDayLit(1, 0, state)).toBe(false);
    expect(isDayLit(undefined, 0, state)).toBe(false);
  });
});

describe('routeStrokeForDay (all-gray layer + per-day color)', () => {
  const base = defaultLayerState();

  it('always draws the active day in its color', () => {
    expect(routeStrokeForDay(0, 0, base, DAY_COLOR)).toEqual({
      stroke: DAY_COLOR,
      strokeWidth: 3.5,
      opacity: 0.95,
    });
    expect(routeStrokeForDay(0, 0, { ...base, showRoutesLayer: true }, DAY_COLOR)?.stroke).toBe(
      DAY_COLOR,
    );
  });

  it('draws nothing for other days without the routes layer', () => {
    expect(routeStrokeForDay(1, 0, base, DAY_COLOR)).toBeNull();
  });

  it('draws other days light gray by default, day-colored when lit', () => {
    const layered = { ...base, showRoutesLayer: true };
    expect(routeStrokeForDay(1, 0, layered, DAY_COLOR)).toEqual({
      stroke: ROUTES_LAYER_GRAY,
      strokeWidth: 1.5,
      opacity: 0.5,
    });
    const lit = { ...layered, coloredDays: [1] as const };
    expect(routeStrokeForDay(1, 0, lit, DAY_COLOR)?.stroke).toBe(DAY_COLOR);
    expect(routeStrokeForDay(2, 0, lit, DAY_COLOR)?.stroke).toBe(ROUTES_LAYER_GRAY);
  });
});
