import type {
  AccountSnapshot,
  BillingCycle,
  ObjectLogEntry,
  RecurringCostObject,
  WYQDObject,
} from './types';

/**
 * WS-4 — object-side insights (second Pro pillar).
 * All aggregation is local and shared across runtimes: the same functions
 * feed Web and Obsidian, so identical vault data yields identical output.
 * Multi-currency amounts are never added together; every ranking is grouped
 * by currency.
 */

export interface SubscriptionCostRow {
  id: string;
  title: string;
  provider?: string;
  annualized: number | null;
  currency: string;
  cycle?: BillingCycle;
}

export interface SubscriptionCostGroup {
  currency: string;
  rows: SubscriptionCostRow[];
  /** Sum of convertible-to-annual rows only; null when no row annualizes. */
  total: number | null;
}

const CYCLE_MULTIPLIER: Record<BillingCycle, number | null> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  annual: 1,
  custom: null,
};

export function annualizeSubscription(object: RecurringCostObject): number | null {
  if (typeof object.annualized_cost === 'number' && Number.isFinite(object.annualized_cost)) {
    return Math.round(object.annualized_cost);
  }
  if (
    typeof object.billing_amount !== 'number' ||
    !Number.isFinite(object.billing_amount) ||
    !object.billing_cycle
  ) {
    return null;
  }
  const factor = CYCLE_MULTIPLIER[object.billing_cycle];
  if (factor === null) return null;
  return Math.round(object.billing_amount * factor);
}

/** Active subscriptions ranked by annualized cost, grouped per currency. */
export function getSubscriptionRanking(objects: WYQDObject[]): SubscriptionCostGroup[] {
  const byCurrency = new Map<string, SubscriptionCostRow[]>();
  for (const object of objects) {
    if (object.object_type !== 'recurring_cost' || object.status !== 'active') continue;
    const currency = (object.billing_currency || object.currency || 'CNY').toUpperCase();
    const row: SubscriptionCostRow = {
      id: object.id,
      title: object.title,
      provider: object.provider,
      annualized: annualizeSubscription(object),
      currency,
      cycle: object.billing_cycle,
    };
    const group = byCurrency.get(currency) ?? [];
    group.push(row);
    byCurrency.set(currency, group);
  }
  return [...byCurrency.entries()]
    .map(([currency, rows]) => {
      rows.sort((a, b) => (b.annualized ?? -1) - (a.annualized ?? -1));
      const annualizable = rows.filter((row) => row.annualized !== null);
      return {
        currency,
        rows,
        total: annualizable.length > 0
          ? annualizable.reduce((sum, row) => sum + (row.annualized ?? 0), 0)
          : null,
      };
    })
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export interface NetWorthPoint {
  date: string;
  netWorth: number | null;
}

/** Snapshots ordered oldest → newest for trend display. */
export function buildNetWorthTrend(snapshots: AccountSnapshot[]): NetWorthPoint[] {
  return [...snapshots]
    .sort((a, b) => a.snapshot_at.localeCompare(b.snapshot_at))
    .map((snapshot) => ({
      date: snapshot.snapshot_at,
      netWorth:
        typeof snapshot.net_worth === 'number' && Number.isFinite(snapshot.net_worth)
          ? snapshot.net_worth
          : null,
    }));
}

export interface UnusedObjectRow {
  id: string;
  title: string;
  daysUnused: number;
  lastEvidence: string;
}

const DAY_MS = 86_400_000;

/**
 * "Own less" outlet: physical objects whose last evidence of use is older
 * than the threshold. Evidence chain: latest 'usage' log → first_used_at →
 * purchased_at → created_at (always present, so every object is decidable).
 */
export function getUnusedObjects(
  objects: WYQDObject[],
  logs: ObjectLogEntry[],
  now = new Date(),
  thresholdDays = 90,
): UnusedObjectRow[] {
  const lastUsageByTarget = new Map<string, string>();
  for (const log of logs) {
    if (log.event_type !== 'usage' || !log.occurred_at) continue;
    const current = lastUsageByTarget.get(log.target_id);
    if (!current || log.occurred_at > current) {
      lastUsageByTarget.set(log.target_id, log.occurred_at);
    }
  }

  const rows: UnusedObjectRow[] = [];
  for (const object of objects) {
    if (object.object_type !== 'physical') continue;
    if (object.status !== 'purchased' && object.status !== 'using' && object.status !== 'idle') {
      continue;
    }
    const anchor =
      lastUsageByTarget.get(object.id) ??
      object.first_used_at ??
      object.purchased_at ??
      object.created_at;
    const anchorTime = new Date(anchor).getTime();
    if (!Number.isFinite(anchorTime)) continue;
    const daysUnused = Math.floor((now.getTime() - anchorTime) / DAY_MS);
    if (daysUnused >= thresholdDays) {
      rows.push({ id: object.id, title: object.title, daysUnused, lastEvidence: anchor });
    }
  }
  return rows.sort((a, b) => b.daysUnused - a.daysUnused);
}
