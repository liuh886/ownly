'use client';

import { usePlannerData, type UsePlannerDataProps, filterAndSearchPlaces, sortPlaceList } from './usePlannerData';
import { usePlannerActions } from './usePlannerActions';

export type UsePlannerControllerProps = UsePlannerDataProps;

export { filterAndSearchPlaces, sortPlaceList };

export function usePlannerController({ disabled }: UsePlannerControllerProps) {
  const data = usePlannerData({ disabled });
  const actions = usePlannerActions({ data, disabled });

  return {
    ...data,
    ...actions,
  };
}

export type PlannerControllerReturn = ReturnType<typeof usePlannerController>;
