import type { WYQDObject } from '@/domain/types';

export type WYQDObjectDecisionBucket = 'pending' | 'active' | 'review' | 'closed';

export interface WYQDObjectConsoleSummary {
  total: number;
  pending: number;
  active: number;
  review: number;
  closed: number;
  physical: number;
  recurringCost: number;
  oneTimeExperience: number;
}

export interface WYQDObjectConsoleItem {
  id: string;
  title: string;
  objectType: WYQDObject['object_type'];
  status: WYQDObject['status'];
  bucket: WYQDObjectDecisionBucket;
  updatedAt?: string;
}

export interface WYQDObjectConsoleModel {
  summary: WYQDObjectConsoleSummary;
  priorityItems: WYQDObjectConsoleItem[];
}

export function getObjectDecisionBucket(object: WYQDObject): WYQDObjectDecisionBucket {
  if (object.object_type === 'physical') {
    if (object.status === 'seeded' || object.status === 'observing') return 'pending';
    if (object.status === 'purchased' || object.status === 'using' || object.status === 'idle') {
      return 'active';
    }
    return 'closed';
  }

  if (object.object_type === 'recurring_cost') {
    if (object.status === 'seeded' || object.status === 'paused') return 'pending';
    if (object.status === 'active') return 'active';
    return 'closed';
  }

  if (object.status === 'planned' || object.status === 'in_progress') return 'pending';
  if (object.status === 'completed') return 'review';
  return 'closed';
}

export function createObjectConsoleModel(objects: readonly WYQDObject[]): WYQDObjectConsoleModel {
  const items = objects.map<WYQDObjectConsoleItem>((object) => ({
    id: object.id,
    title: object.title,
    objectType: object.object_type,
    status: object.status,
    bucket: getObjectDecisionBucket(object),
    updatedAt: object.updated_at ?? object.created_at,
  }));

  const summary: WYQDObjectConsoleSummary = {
    total: items.length,
    pending: items.filter((item) => item.bucket === 'pending').length,
    active: items.filter((item) => item.bucket === 'active').length,
    review: items.filter((item) => item.bucket === 'review').length,
    closed: items.filter((item) => item.bucket === 'closed').length,
    physical: objects.filter((object) => object.object_type === 'physical').length,
    recurringCost: objects.filter((object) => object.object_type === 'recurring_cost').length,
    oneTimeExperience: objects.filter((object) => object.object_type === 'one_time_experience').length,
  };

  const priorityItems = [...items]
    .sort((left, right) => {
      const bucketRank: Record<WYQDObjectDecisionBucket, number> = {
        review: 0,
        pending: 1,
        active: 2,
        closed: 3,
      };
      const rankDelta = bucketRank[left.bucket] - bucketRank[right.bucket];
      if (rankDelta !== 0) return rankDelta;
      return (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '');
    })
    .slice(0, 6);

  return { summary, priorityItems };
}
