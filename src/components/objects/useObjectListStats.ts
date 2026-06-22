import { useMemo } from 'react';
import type { WYQDStoredEntity } from '@/core/repository';
import type { ReviewEntry, WYQDObject, PhysicalObject } from '@/domain/types';
import { calculateResidualValue, calculateDesireAmount } from '@/domain/calculations';
import { getObjectControlBucket, type ObjectControlBucket, type ObjectStatusGroupFilter, matchesStatusGroup, matchesQuery } from './useObjectFilterSort';
import { getPrimaryAmount, getDailyCost, isPhysicalObject } from './ObjectListUtils';

export function useObjectListStats(
  objects: WYQDStoredEntity<WYQDObject>[],
  reviews: WYQDStoredEntity<ReviewEntry>[],
  query: string,
  typeFilter: string,
  statusGroupFilter: ObjectStatusGroupFilter,
) {
  const reviewedObjectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of reviews) {
      if (r.entity.target_id) ids.add(r.entity.target_id);
    }
    return ids;
  }, [reviews]);

  const allPhysicalObjects = useMemo(() => objects.filter(s => isPhysicalObject(s.entity)), [objects]);

  const controlCounts = useMemo(() => objects.reduce<Record<ObjectControlBucket, number>>(
    (counts, stored) => {
      counts[getObjectControlBucket(stored.entity, reviewedObjectIds)] += 1;
      return counts;
    },
    { attention: 0, active: 0, review: 0, closed: 0 },
  ), [objects, reviewedObjectIds]);

  const totalCost = useMemo(() => allPhysicalObjects.reduce((sum, stored) => sum + getPrimaryAmount(stored.entity), 0), [allPhysicalObjects]);

  const ownedPhysicalObjects = useMemo(
    () => allPhysicalObjects.filter((stored) => stored.entity.status === 'purchased' || stored.entity.status === 'using'),
    [allPhysicalObjects],
  );

  const totalResidualValue = useMemo(
    () => ownedPhysicalObjects.reduce((sum, stored) => sum + calculateResidualValue(stored.entity as PhysicalObject), 0),
    [ownedPhysicalObjects],
  );

  const averageDailyCost = useMemo(() => {
    const dailyCosts = ownedPhysicalObjects
      .map((stored) => getDailyCost(stored.entity))
      .filter((value): value is number => value !== null);
    return dailyCosts.length > 0 ? dailyCosts.reduce((sum, value) => sum + value, 0) : 0;
  }, [ownedPhysicalObjects]);

  const observingObjects = useMemo(
    () => objects.filter((stored) => {
      const s = stored.entity.status;
      return s === 'seeded' || s === 'observing' || s === 'planned';
    }),
    [objects],
  );

  const observingAmount = useMemo(
    () => observingObjects.reduce((sum, stored) => sum + calculateDesireAmount(stored.entity), 0),
    [observingObjects],
  );

  const getObjectTypeFilterCount = (type: string) => {
    return objects.filter((stored) => {
      const object = stored.entity;
      return (
        (type === 'all' || object.object_type === type) &&
        matchesStatusGroup(object, statusGroupFilter, reviewedObjectIds) &&
        matchesQuery(object, query)
      );
    }).length;
  };

  const getObjectStatusGroupCount = (group: ObjectStatusGroupFilter) => {
    return objects.filter((stored) => {
      const object = stored.entity;
      return (
        matchesStatusGroup(object, group, reviewedObjectIds) &&
        (typeFilter === 'all' || object.object_type === typeFilter) &&
        matchesQuery(object, query)
      );
    }).length;
  };

  return {
    reviewedObjectIds,
    allPhysicalObjects,
    controlCounts,
    totalCost,
    ownedPhysicalObjectsCount: ownedPhysicalObjects.length,
    totalResidualValue,
    averageDailyCost,
    observingObjectsCount: observingObjects.length,
    observingAmount,
    getObjectTypeFilterCount,
    getObjectStatusGroupCount,
  };
}
