// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { AccountSnapshot, HomeMetrics, WYQDObject } from '@/domain/types';
import { HomeDashboard } from './HomeDashboard';
vi.mock('@/core/i18n-context', () => ({ useI18n: () => ({ currency: 'USD', t: () => 'Money totals: {currency}. Other currencies remain in the list.' }) }));
vi.mock('./HomeOwnSection', () => ({ HomeOwnSection: (props: { metrics: HomeMetrics; snapshots: AccountSnapshot[] }) => <div data-testid="own">{JSON.stringify(props)}</div> }));
vi.mock('./HomeCostSection', () => ({ HomeCostSection: (props: { metrics: HomeMetrics; objects: WYQDObject[]; snapshots: AccountSnapshot[] }) => <div data-testid="cost">{JSON.stringify(props)}</div> }));
vi.mock('./HomeDataScaleSection', () => ({ HomeDataScaleSection: (props: { objects: WYQDObject[]; snapshots: AccountSnapshot[] }) => <div data-testid="scale">{JSON.stringify(props)}</div> }));
vi.mock('./HomeRepaymentSection', () => ({ HomeRepaymentSection: (props: { snapshots: AccountSnapshot[] }) => <div data-testid="dues">{JSON.stringify(props)}</div> }));
vi.mock('./HomeReviewSection', () => ({ HomeReviewSection: () => null }));
vi.mock('./HomeDoctorSection', () => ({ HomeDoctorSection: () => null }));
vi.mock('@/components/planner/PlannerDoctorSection', () => ({ PlannerDoctorSection: () => null }));
vi.mock('@/components/data-safety/TrustStatusSection', () => ({ TrustStatusSection: () => null }));
vi.mock('@/components/data-safety/SampleDataSection', () => ({ SampleDataSection: () => null }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('home USD totals and snapshot trends exclude CNY while data-scale records and object counts remain complete', async () => {
 const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
 const objects = ['USD', 'CNY'].map((currency, i) => ({ schema_version: '0.1', id: currency, title: currency, type: 'object', object_type: 'recurring_cost', status: 'active', currency, billing_cycle: 'monthly', billing_amount: i === 0 ? 10 : 900 })) as WYQDObject[];
 const snapshots = ['USD', 'CNY'].map((currency, i) => ({ schema_version: '0.1', id: currency, type: 'snapshot', snapshot_type: 'net_worth', title: currency, currency, snapshot_at: '2026-01-01', created_at: '2026-01-01', asset_balances: [{ account_id: currency, account: currency, amount: i === 0 ? 1000 : 9000 }], liability_balances: [] })) as AccountSnapshot[];
 const metrics = { netWorth: 10000, monthlyFixedCost: 910, ownedPhysicalCount: 0, activeSubscriptionCount: 2, physicalResidualValue: 0, observingDesireAmount: 0, netWorthDeltaFromPreviousMonth: null };
 try {
  await act(async () => root.render(<HomeDashboard metrics={metrics} objects={objects} snapshots={snapshots} onOpenObjects={vi.fn()} />));
  const read = (id: string) => JSON.parse(host.querySelector(`[data-testid="${id}"]`)!.textContent!);
  expect(read('own').metrics).toMatchObject({ netWorth: 1000, monthlyFixedCost: 10, activeSubscriptionCount: 2 });
  expect(read('own').snapshots).toHaveLength(1);
  expect(read('dues').snapshots[0].currency).toBe('USD');
  expect(read('cost').objects).toHaveLength(2);
  expect(read('scale').objects).toHaveLength(2);
  expect(read('scale').snapshots).toHaveLength(2);
  expect(host.textContent).toContain('Money totals: USD. Other currencies remain in the list.');
 } finally { await act(async () => root.unmount()); host.remove(); }
});
