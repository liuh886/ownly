'use client';

import { usePlannerData, type UsePlannerDataProps, filterAndSearchPlaces, sortPlaceList } from './usePlannerData';
import { usePlannerActions } from './usePlannerActions';

export type UsePlannerControllerProps = UsePlannerDataProps & { onDataChanged?: () => Promise<void> };

export { filterAndSearchPlaces, sortPlaceList };

export function usePlannerController({ disabled, onDataChanged }: UsePlannerControllerProps) {
  const data = usePlannerData({ disabled });
  const actions = usePlannerActions({ data, disabled, onDataChanged });

  return {
    ...data,
    ...actions,
  };
}

export type PlannerControllerReturn = ReturnType<typeof usePlannerController>;
