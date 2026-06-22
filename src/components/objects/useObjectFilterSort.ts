import { useState } from 'react';
import type { ObjectListFocus } from './ObjectList';
import type { WYQDObject } from '@/domain/types';

export type PhysicalFilter = 'all' | 'active' | 'retired' | 'sold';
export type ObjectTypeFilter = 'all' | WYQDObject['object_type'];
export type ObjectStatusGroupFilter = 'all' | 'observing' | 'using' | 'pendingReview' | 'exited';
export type ObjectControlBucket = 'attention' | 'active' | 'review' | 'closed';
export type SortOption = 'date_desc' | 'date_asc' | 'price_desc' | 'price_asc' | 'title_asc';

export function getPhysicalBucket(status: string): Exclude<PhysicalFilter, 'all'> {
  if (status === 'transferred') return 'sold';
  if (status === 'idle' || status === 'discarded') return 'retired';
  return 'active';
}

function getSortDate(object: WYQDObject): number {
  let dateStr = '';
  if (object.object_type === 'physical') {
    dateStr = object.purchased_at || object.created_at || '';
  } else if (object.object_type === 'recurring_cost') {
    dateStr = object.started_at || object.created_at || '';
  } else {
    dateStr = object.planned_at || object.started_at || object.created_at || '';
  }
  return dateStr ? new Date(dateStr).getTime() : 0;
}

function getPrimaryAmount(object: WYQDObject): number {
  if (object.object_type === 'physical') {
    return object.purchase_price || 0; // Using simplified version here, or pass calculatePhysicalAcquisitionCost
  }
  if (object.object_type === 'recurring_cost') {
    return object.billing_amount || 0;
  }
  return object.budget_total || object.actual_total || 0;
}

export function compareObjects(a: WYQDObject, b: WYQDObject, sort: SortOption): number {
  switch (sort) {
    case 'date_desc':
      return getSortDate(b) - getSortDate(a);
    case 'date_asc':
      return getSortDate(a) - getSortDate(b);
    case 'price_desc':
      return getPrimaryAmount(b) - getPrimaryAmount(a);
    case 'price_asc':
      return getPrimaryAmount(a) - getPrimaryAmount(b);
    case 'title_asc':
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    default:
      return 0;
  }
}

export function matchesQuery(object: WYQDObject, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [object.title, object.category, object.status, object.object_type]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

export function matchesStatusGroup(
  object: WYQDObject,
  group: ObjectStatusGroupFilter,
  reviewedObjectIds?: ReadonlySet<string>,
): boolean {
  if (group === 'all') return true;
  if (group === 'observing') {
    return ['seeded', 'observing', 'planned'].includes(object.status);
  }
  if (group === 'using') {
    return ['purchased', 'using', 'active', 'in_progress'].includes(object.status);
  }
  if (group === 'pendingReview') {
    if (reviewedObjectIds?.has(object.id)) return false;
    if (object.object_type === 'one_time_experience') {
      return object.status === 'completed';
    }
    if (object.object_type === 'physical') {
      return object.status === 'idle';
    }
    return object.status === 'cancelled';
  }
  return ['transferred', 'discarded', 'reviewed'].includes(object.status);
}

export function getObjectControlBucket(object: WYQDObject, reviewedIds?: Set<string>): ObjectControlBucket {
  if (object.object_type === 'one_time_experience' && object.status === 'completed') {
    const hasReview = object.review_ref || (reviewedIds?.has(object.id) ?? false);
    if (!hasReview) return 'review';
  }
  if (['seeded', 'observing', 'planned'].includes(object.status)) return 'attention';
  if (['purchased', 'using', 'active', 'in_progress'].includes(object.status)) return 'active';
  return 'closed';
}

export function useObjectFilterSort(focus?: ObjectListFocus | null) {
  const [query, setQuery] = useState(focus?.query || '');
  const [typeFilter, setTypeFilter] = useState<ObjectTypeFilter>(focus?.typeFilter || 'all');
  const [statusGroupFilter, setStatusGroupFilter] = useState<ObjectStatusGroupFilter>(
    focus?.statusGroupFilter || 'all',
  );
  const [filter, setFilter] = useState<PhysicalFilter>(focus?.physicalFilter || 'all');
  const [controlBucketFilter, setControlBucketFilter] = useState<ObjectControlBucket | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');

  return {
    query,
    setQuery,
    typeFilter,
    setTypeFilter,
    statusGroupFilter,
    setStatusGroupFilter,
    filter,
    setFilter,
    controlBucketFilter,
    setControlBucketFilter,
    sortBy,
    setSortBy,
  };
}
