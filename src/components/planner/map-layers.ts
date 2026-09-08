/**
 * Map layer model: additive layers instead of mutually exclusive modes.
 *
 * - Base: the active day's route is always drawn in its day color, with its
 *   markers. This is the planning context and never disappears.
 * - "All routes" layer: every other day's route appears; light gray unless
 *   that day is lit in the legend, in which case it uses its day color.
 * - "Candidate pool" layer: unscheduled candidate markers on/off.
 * - Legend: toggles a non-active day's color display. The active day is
 *   always lit (its row is locked). Lighting a day auto-enables the routes
 *   layer so the action is always visible.
 */

export interface MapLayerState {
  showRoutesLayer: boolean;
  showCandidates: boolean;
  /** Non-active day indexes lit in the legend (drawn in day color). */
  coloredDays: readonly number[];
}

export interface MapLayerPoint {
  isScheduled: boolean;
  isActiveDay?: boolean;
  dayIndex?: number;
}

export const ROUTES_LAYER_GRAY = '#a8a29e';

export function defaultLayerState(): MapLayerState {
  return { showRoutesLayer: false, showCandidates: true, coloredDays: [] };
}

export function isDayLit(
  dayIndex: number | undefined,
  activeDayIndex: number,
  state: Pick<MapLayerState, 'coloredDays'>,
): boolean {
  if (dayIndex === undefined) return false;
  if (dayIndex === activeDayIndex) return true;
  return state.coloredDays.includes(dayIndex);
}

export function resolveLayerPoints<T extends MapLayerPoint>(
  points: T[],
  state: Pick<MapLayerState, 'showRoutesLayer' | 'showCandidates'>,
): T[] {
  return points.filter((point) => {
    if (!point.isScheduled) return state.showCandidates;
    if (point.isActiveDay === false) return state.showRoutesLayer;
    return true;
  });
}

export interface RouteStroke {
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

/**
 * Stroke for a day's route polyline, or null when the day draws no route.
 * The active day always draws in its color; other days draw only with the
 * routes layer on (day color when lit, light gray otherwise).
 */
export function routeStrokeForDay(
  dayIndex: number,
  activeDayIndex: number,
  state: MapLayerState,
  dayColor: string,
): RouteStroke | null {
  // The active day always draws in its color: it is the planning context.
  if (dayIndex === activeDayIndex) {
    return { stroke: dayColor, strokeWidth: 3.5, opacity: 0.95 };
  }
  if (!state.showRoutesLayer) return null;
  if (isDayLit(dayIndex, activeDayIndex, state)) {
    return { stroke: dayColor, strokeWidth: 3, opacity: 0.9 };
  }
  return { stroke: ROUTES_LAYER_GRAY, strokeWidth: 1.5, opacity: 0.5 };
}
