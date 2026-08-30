import type { PlannerScheduledPlace } from './planner-visits';

export type PlannerTravelTimeMatrix = Record<string, Record<string, number | null | undefined> | undefined>;

export interface PlannerTravelTimeOptimizationOptions {
  fixStart?: boolean;
  fixEnd?: boolean;
  respectLocked?: boolean;
}

export interface PlannerTravelTimeOptimizationResult {
  places: PlannerScheduledPlace[];
  originalMinutes: number;
  optimizedMinutes: number;
  savedMinutes: number;
  improved: boolean;
}

export function calculateRouteTravelMinutes(
  places: PlannerScheduledPlace[],
  matrix: PlannerTravelTimeMatrix,
): number | null {
  let total = 0;
  for (let index = 0; index < places.length - 1; index += 1) {
    const duration = matrix[places[index].id]?.[places[index + 1].id];
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) return null;
    total += duration;
  }
  return Math.round(total);
}

function buildPinnedOrder(
  base: PlannerScheduledPlace[],
  movableSlots: number[],
  movableItems: PlannerScheduledPlace[],
): PlannerScheduledPlace[] {
  const next = [...base];
  movableSlots.forEach((slot, index) => {
    next[slot] = movableItems[index];
  });
  return next;
}

export function optimizeStopsByTravelTime(
  places: PlannerScheduledPlace[],
  matrix: PlannerTravelTimeMatrix,
  options: PlannerTravelTimeOptimizationOptions = {},
): PlannerTravelTimeOptimizationResult | null {
  const { fixStart = true, fixEnd = false, respectLocked = true } = options;
  const current = [...places];
  const originalMinutes = calculateRouteTravelMinutes(current, matrix);
  if (originalMinutes === null) return null;
  if (current.length <= 2) {
    return {
      places: current.map((place, index) => ({ ...place, sort_order: index })),
      originalMinutes,
      optimizedMinutes: originalMinutes,
      savedMinutes: 0,
      improved: false,
    };
  }

  const pinnedSlots = new Set<number>();
  current.forEach((place, index) => {
    if (place.is_anchor || (respectLocked && place.locked)) pinnedSlots.add(index);
  });
  if (fixStart) pinnedSlots.add(0);
  if (fixEnd) pinnedSlots.add(current.length - 1);

  const movableSlots: number[] = [];
  const movableItems: PlannerScheduledPlace[] = [];
  current.forEach((place, index) => {
    if (!pinnedSlots.has(index)) {
      movableSlots.push(index);
      movableItems.push(place);
    }
  });

  let bestMovable = [...movableItems];
  let bestMinutes = originalMinutes;
  const score = (items: PlannerScheduledPlace[]): number => {
    const minutes = calculateRouteTravelMinutes(buildPinnedOrder(current, movableSlots, items), matrix);
    return minutes ?? Number.POSITIVE_INFINITY;
  };

  const movableCount = movableItems.length;
  if (movableCount >= 2 && movableCount <= 8) {
    const permute = (items: PlannerScheduledPlace[], left: number) => {
      if (left === items.length) {
        const minutes = score(items);
        if (minutes < bestMinutes) {
          bestMinutes = minutes;
          bestMovable = [...items];
        }
        return;
      }
      for (let index = left; index < items.length; index += 1) {
        [items[left], items[index]] = [items[index], items[left]];
        permute(items, left + 1);
        [items[left], items[index]] = [items[index], items[left]];
      }
    };
    permute([...movableItems], 0);
  } else if (movableCount > 8) {
    let currentMovable = [...movableItems];
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 60) {
      changed = false;
      iterations += 1;
      for (let left = 0; left < movableCount - 1; left += 1) {
        for (let right = left + 1; right < movableCount; right += 1) {
          const candidate = [
            ...currentMovable.slice(0, left),
            ...currentMovable.slice(left, right + 1).reverse(),
            ...currentMovable.slice(right + 1),
          ];
          const minutes = score(candidate);
          if (minutes < bestMinutes) {
            bestMinutes = minutes;
            bestMovable = candidate;
            currentMovable = candidate;
            changed = true;
          }
        }
      }
    }
  }

  const finalOrder = buildPinnedOrder(current, movableSlots, bestMovable)
    .map((place, index) => ({ ...place, sort_order: index }));
  const savedMinutes = Math.max(0, originalMinutes - bestMinutes);
  return {
    places: finalOrder,
    originalMinutes,
    optimizedMinutes: bestMinutes,
    savedMinutes,
    improved: savedMinutes > 0,
  };
}
