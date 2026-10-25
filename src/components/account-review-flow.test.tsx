// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useObjectListStats } from './objects/useObjectListStats';
import { AccountsOverview } from './accounts/AccountsOverview';
import { FirstRunGuide } from './onboarding/FirstRunGuide';
import { ObjectCardPhysical } from './objects/ObjectCardPhysical';
import { ObjectCardSupporting } from './objects/ObjectCardSupporting';
import { ReviewHome } from './reviews/ReviewHome';
import type { AccountSnapshot, ReviewEntry, WYQDObject } from '@/domain/types';
import type { WYQDStoredEntity } from '@/core/repository';
const currencyState = vi.hoisted(() => ({ value: 'CNY' }));
vi.mock('@/core/i18n-context', () => ({ useI18n: () => ({ t: (key: string) => key === 'vsLastSnapshot' ? 'vsLastSnapshot {value}' : key, language: 'en', currency: currencyState.value }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/services/loadSampleTrip', () => ({ loadSampleTrip: vi.fn() }));
vi.mock('@/services/loadSampleData', () => ({ loadSampleData: vi.fn(), SAMPLE_DATA_LOADED_KEY: 'test-sample' }));
vi.mock('@/lib/analytics', () => ({ trackFirstEver: vi.fn(), trackOwnlyEvent: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { currencyState.value = 'CNY'; host = document.createElement('div'); document.body.append(host); root = createRoot(host); HTMLElement.prototype.scrollIntoView = vi.fn(); localStorage.clear(); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render(node: ReactNode) { await act(async () => root.render(node)); }
async function click(label: string) { const button = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === label); expect(button, label).toBeTruthy(); await act(async () => button!.click()); }
async function change(element: HTMLInputElement | HTMLTextAreaElement, value: string) { await act(async () => { Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); }); }
const snapshot = { schema_version: '0.1', id: 'snapshot', type: 'snapshot', title: 'old', snapshot_type: 'net_worth', snapshot_at: '2026-01-01', currency: 'CNY', asset_balances: [{ account_id: 'asset_bank', account: 'Bank', amount: 1000 }], liability_balances: [{ account_id: 'liability_card', account: 'Card', amount: 200 }], monthly_fixed_cost: 99, owned_physical_count: 7, physical_residual_value: 123, active_subscription_count: 4, observing_desire_amount: 555, created_at: '2026-01-01' } as AccountSnapshot;
const stored = { entity: snapshot, fileName: 'old.md', body: 'original body' } as WYQDStoredEntity<AccountSnapshot>;
it.each(['asset', 'liability'])('editing %s prefill preserves opposite side and saves both', async (side) => {
 const save = vi.fn().mockResolvedValue(undefined);
 await render(<AccountsOverview snapshots={[stored]} objects={[]} onCreateSnapshot={save} onUpdateSnapshot={vi.fn()} onDeleteSnapshot={vi.fn()} />);
 const inputs = host.querySelectorAll('textarea');
 await change(inputs[side === 'asset' ? 0 : 1], side === 'asset' ? 'Bank 1200' : 'Card 300');
 expect(inputs[side === 'asset' ? 1 : 0].value).toBe(side === 'asset' ? 'Card 200' : 'Bank 1000');
 await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
 expect(save.mock.calls[0][0]).toMatchObject({ total_assets: side === 'asset' ? 1200 : 1000, total_liabilities: side === 'asset' ? 200 : 300 });
});
it('editing a historic snapshot keeps its ownership facts and body', async () => {
 const update = vi.fn().mockResolvedValue(undefined);
 await render(<AccountsOverview snapshots={[stored]} objects={[]} onCreateSnapshot={vi.fn()} onUpdateSnapshot={update} onDeleteSnapshot={vi.fn()} />);
 await click('edit');
 await change(host.querySelector('textarea')!, 'Bank 1200');
 await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
 expect(update.mock.calls[0]).toEqual(['old.md', expect.objectContaining({ net_worth: 1000, monthly_fixed_cost: 99, owned_physical_count: 7, physical_residual_value: 123, active_subscription_count: 4, observing_desire_amount: 555 }), 'original body']);
});
it('first run opened from closed advances, remembers the lesson, and reopens directly at first-record', async () => {
 const props = { onChoose: vi.fn(), onSampleLoaded: vi.fn(), onSampleDataLoaded: vi.fn(), onDismiss: vi.fn() };
 await render(<FirstRunGuide {...props} open={false} step={null} />);
 await render(<FirstRunGuide {...props} open step="model" />);
 const next = Array.from(host.querySelectorAll('button')).find(b => b.className.includes('min-h-11'))!;
 await act(async () => next.click());
 expect(host.querySelectorAll('button').length).toBeGreaterThan(3);
 expect(localStorage.getItem('ownly:capture-onboarding:dismissed')).toBe('1');
 await render(<FirstRunGuide {...props} open={false} step={null} />);
 await render(<FirstRunGuide {...props} open step="first-record" />);
 expect(host.querySelectorAll('button').length).toBeGreaterThan(3);
});
const exp = { schema_version: '0.1', id: 'A', title: 'Experience A', type: 'object', object_type: 'one_time_experience', status: 'completed', actual_cost: 10, created_at: '2026-01-01' } as WYQDObject;
const review = { entity: { schema_version: '0.1', id: 'B', title: 'Review B', type: 'review', review_type: 'monthly', summary: 'Original B', food_score: 50, created_at: '2026-01-01' } as ReviewEntry, fileName: 'B.md', body: 'B body' } as WYQDStoredEntity<ReviewEntry>;
it('pending creation and existing editing are mutually exclusive; invalid score and failure preserve draft', async () => {
 const update = vi.fn().mockRejectedValue(new Error('write failed'));
 const create = vi.fn();
 await render(<ReviewHome objects={[exp]} reviews={[review]} membership={{} as never} onCreateReview={create} onUpdateReview={update} onDeleteReview={vi.fn()} />);
 const pending = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Experience A'))!;
 await act(async () => pending.click());
 expect(host.querySelector('form')).not.toBeNull();
 await click('edit');
 expect(host.querySelector('form')).toBeNull();
 await change(host.querySelector('input[type="number"]')!, '101');
 expect(host.querySelector('[role="alert"]')?.textContent).toContain('0 and 100');
 await click('saveChanges');
 expect(update).not.toHaveBeenCalled();
 await change(host.querySelector('input[type="number"]')!, '80');
 await change(host.querySelector('textarea')!, 'Changed B');
 await click('saveChanges');
 expect(update.mock.calls[0]).toEqual(['B.md', expect.objectContaining({ summary: 'Changed B', food_score: 80 }), 'B body']);
 expect(host.querySelector('textarea')!.value).toBe('Changed B');
 expect(create).not.toHaveBeenCalled();
});
it('saving a review blocks context switching and duplicate submission, then permits retry', async () => {
 let rejectSave!: (error: Error) => void;
 const create = vi.fn().mockImplementation(() => new Promise<void>((_resolve, reject) => { rejectSave = reject; }));
 const update = vi.fn();
 await render(<ReviewHome objects={[exp]} reviews={[review]} membership={{} as never} onCreateReview={create} onUpdateReview={update} onDeleteReview={vi.fn()} />);
 const pending = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Experience A'))!;
 await act(async () => pending.click());
 await change(host.querySelector('textarea')!, 'A draft survives');
 const form = host.querySelector('form')!;
 await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
 expect(create).toHaveBeenCalledTimes(1);
 await click('edit');
 expect(host.querySelector('form')).not.toBeNull();
 expect(update).not.toHaveBeenCalled();
 await act(async () => rejectSave(new Error('write failed')));
 expect(host.querySelector('textarea')!.value).toBe('A draft survives');
 expect(create.mock.calls[0][0]).toMatchObject({ target_id: 'A', food_score: null });
 await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
 expect(create).toHaveBeenCalledTimes(2);
 await act(async () => rejectSave(new Error('write failed again')));
});

it('readonly physical cards remain keyboard readable and show explicit zero costs', async () => {
 const select = vi.fn();
 const props = { stored: { fileName: 'free.md', body: '', entity: { id: 'free', title: 'Free item', object_type: 'physical', status: 'using', purchased_at: '2026-01-01', purchase_price: 200, total_acquisition_cost: 0 } }, disabled: true, isEditing: false, isDetailing: false, openActionMenuFileName: null, exitingFileName: null, deletingFileName: null, setSelectedFileName: select, setOpenActionMenuFileName: vi.fn(), setEditingFileName: vi.fn(), setExitingFileName: vi.fn(), setDeletingFileName: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn(), confirm: vi.fn(), menuItemClass: '' } as unknown as Parameters<typeof ObjectCardPhysical>[0];
 await render(<ObjectCardPhysical {...props} />);
 const card = host.querySelector('[role="button"]') as HTMLElement;
 expect(card.tabIndex).toBe(0);
 await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
 expect(select).toHaveBeenCalledWith('free.md');
 expect(host.textContent).not.toContain('200');
 expect(host.textContent).not.toContain('—');
});
it('inline object review blocks invalid scores and interaction does not open object details', async () => {
 const create = vi.fn().mockRejectedValue(new Error('write failed'));
 const select = vi.fn();
 const props = { stored: { fileName: 'A.md', entity: exp, body: 'body' }, reviews: [], isEditing: false, isDetailing: false, isReviewing: true, reviewSummary: 'reflection', reviewFoodScore: '101', reviewSceneryScore: '', reviewExperienceScore: '', onCreateObjectReview: create, setSelectedFileName: select, setExitingFileName: vi.fn(), setReviewSummary: vi.fn(), setReviewFoodScore: vi.fn(), setReviewSceneryScore: vi.fn(), setReviewExperienceScore: vi.fn(), cancelObjectReview: vi.fn(), openActionMenuFileName: null, exitingFileName: null, deletingFileName: null } as unknown as Parameters<typeof ObjectCardSupporting>[0];
 await render(<ObjectCardSupporting {...props} />);
 expect(host.querySelector('[role="alert"]')?.textContent).toContain('0 and 100');
 await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
 expect(create).not.toHaveBeenCalled();
 await act(async () => host.querySelector('textarea')!.click());
 expect(select).not.toHaveBeenCalled();
 await render(<ObjectCardSupporting {...props} reviewFoodScore="0" />);
 await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
 expect(create.mock.calls[0][3]).toEqual({ foodScore: 0, sceneryScore: null, experienceScore: null });
 expect(props.cancelObjectReview).not.toHaveBeenCalled();
});
it('snapshot submission is synchronously guarded and failure retains balances', async () => {
 let rejectSave!: (error: Error) => void;
 const save = vi.fn().mockImplementation(() => new Promise<void>((_resolve, reject) => { rejectSave = reject; }));
 await render(<AccountsOverview snapshots={[stored]} objects={[]} onCreateSnapshot={save} onUpdateSnapshot={vi.fn()} onDeleteSnapshot={vi.fn()} />);
 await change(host.querySelector('textarea')!, 'Bank 1200');
 const form = host.querySelector('form')!;
 await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
 expect(save).toHaveBeenCalledTimes(1);
 await click('edit');
 expect(host.querySelector('textarea')!.value).toBe('Bank 1200');
 await act(async () => rejectSave(new Error('write failed')));
 expect(host.querySelector('textarea')!.value).toBe('Bank 1200');
});

it('clearing snapshot date shows an error, blocks direct submission, and preserves balances for correction', async () => {
 const save = vi.fn().mockResolvedValue(undefined);
 await render(<AccountsOverview snapshots={[stored]} objects={[]} onCreateSnapshot={save} onUpdateSnapshot={vi.fn()} onDeleteSnapshot={vi.fn()} />);
 const date = host.querySelector('input[type="date"]') as HTMLInputElement;
 await change(date, '');
 expect(date.required).toBe(true);
 expect(date.getAttribute('aria-invalid')).toBe('true');
 expect(host.querySelector('[role="alert"]')?.textContent).toContain('valid snapshot date');
 await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
 expect(save).not.toHaveBeenCalled();
 expect(host.querySelector('textarea')!.value).toBe('Bank 1000');
 await change(date, '2026-02-28');
 expect(host.querySelector('[role="alert"]')).toBeNull();
 await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
 expect(save.mock.calls[0][0]).toMatchObject({ snapshot_at: '2026-02-28', total_assets: 1000, total_liabilities: 200 });
});

it('same-day latest balance, positive delta, prefill and history follow creation chronology after an older record edit', async () => {
 const older = { ...stored, entity: { ...snapshot, snapshot_at: '2026-10-04', created_at: '2026-10-04T01:00:00Z', updated_at: '2026-10-05T12:00:00Z' } };
 const newer = { ...stored, fileName: 'new.md', entity: { ...snapshot, id: 'new', snapshot_at: '2026-10-04', created_at: '2026-10-04T02:00:00Z', asset_balances: [{ account_id: 'asset_bank', account: 'Bank', amount: 1100 }] } };
 const props = { objects: [], onCreateSnapshot: vi.fn(), onUpdateSnapshot: vi.fn(), onDeleteSnapshot: vi.fn() };
 await render(<AccountsOverview {...props} snapshots={[older, newer]} />);
 expect(host.querySelector('textarea')!.value).toBe('Bank 1100');
 expect(host.querySelectorAll('article')[0].textContent).toContain('900');
 const firstCard = host.querySelector('section > div')!;
 expect(firstCard.textContent).toContain('900');
 // Translator exposes the delta interpolation so the sign/value can be checked.
 const delta = Array.from(firstCard.querySelectorAll('div')).find(node => node.textContent?.includes('vsLastSnapshot'));
 expect(delta?.textContent).toContain('+');
 expect(delta?.textContent).toContain('100');
 await render(<AccountsOverview {...props} snapshots={[newer, older]} />);
 expect(host.querySelector('textarea')!.value).toBe('Bank 1100');
 await click('edit');
 expect(host.querySelector('textarea')!.value).toBe('Bank 1100');
});

it('USD new snapshot excludes CNY prefill/ownership money, keeps CNY history and writes USD balances', async () => {
 currencyState.value = 'USD';
 const save = vi.fn().mockResolvedValue(undefined);
 const subscription = (id: string, currency: string, billing_amount: number) => ({ id, title: id, object_type: 'recurring_cost', type: 'object', status: 'active', currency, billing_cycle: 'monthly', billing_amount, created_at: '2026-01-01' }) as WYQDObject;
 await render(<AccountsOverview snapshots={[stored]} objects={[subscription('usd', 'USD', 10), subscription('cny', 'CNY', 900)]} onCreateSnapshot={save} onUpdateSnapshot={vi.fn()} onDeleteSnapshot={vi.fn()} />);
 expect(host.querySelector('textarea')!.value).toBe('');
 expect(host.querySelector('article')!.textContent).toContain('¥800');
 await change(host.querySelectorAll('textarea')[0], 'Bank 1000');
 await change(host.querySelectorAll('textarea')[1], 'Card 200');
 await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
 expect(save.mock.calls[0][0]).toMatchObject({ currency: 'USD', asset_balances: [expect.objectContaining({ amount: 1000, currency: 'USD' })], liability_balances: [expect.objectContaining({ amount: 200, currency: 'USD' })], monthly_fixed_cost: 10, active_subscription_count: 1 });
});
it('editing CNY snapshot under USD selection keeps CNY currency and historical facts', async () => {
 currencyState.value = 'USD';
 const update = vi.fn().mockResolvedValue(undefined);
 await render(<AccountsOverview snapshots={[stored]} objects={[]} onCreateSnapshot={vi.fn()} onUpdateSnapshot={update} onDeleteSnapshot={vi.fn()} />);
 await click('edit');
 expect(host.querySelector('form')!.textContent).toContain('CNY');
 await change(host.querySelector('textarea')!, 'Bank 1200');
 await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
 expect(update.mock.calls[0][1]).toMatchObject({ currency: 'CNY', asset_balances: [expect.objectContaining({ currency: 'CNY' })], monthly_fixed_cost: 99 });
});
it('object monetary stats use selected currency while object and ownership counts keep all currencies', async () => {
 currencyState.value = 'USD';
 const physical = (id: string, currency: string, amount: number) => ({ fileName: id + '.md', body: '', entity: { id, title: id, type: 'object', object_type: 'physical', status: 'using', currency, total_acquisition_cost: amount, residual_value: amount, purchased_at: '2026-01-01' } }) as WYQDStoredEntity<WYQDObject>;
 function Harness() { const stats = useObjectListStats([physical('USD', 'USD', 100), physical('CNY', 'CNY', 900)], [], '', 'all', 'all'); return <div>{JSON.stringify({ count: stats.allPhysicalObjects.length, owned: stats.ownedPhysicalObjectsCount, cost: stats.totalCost, residual: stats.totalResidualValue })}</div>; }
 await render(<Harness />);
 expect(JSON.parse(host.textContent!)).toEqual({ count: 2, owned: 2, cost: 100, residual: 0 });
});
it('foreign balance leaf keeps its currency and metadata during base-currency editing and is excluded from base prefill/totals', async () => {
 const update = vi.fn().mockResolvedValue(undefined);
 const mixed = { ...stored, entity: { ...snapshot, asset_balances: [...snapshot.asset_balances, { account_id: 'foreign', account: 'Dollar account', amount: 50, currency: 'USD', imported_note: 'keep' }] } };
 await render(<AccountsOverview snapshots={[mixed]} objects={[]} onCreateSnapshot={vi.fn()} onUpdateSnapshot={update} onDeleteSnapshot={vi.fn()} />);
 expect(host.querySelector('textarea')!.value).toBe('Bank 1000');
 expect(host.textContent).toContain('$50');
 await click('edit');
 await change(host.querySelector('textarea')!, 'Bank 1200\nDollar account 50 USD');
 await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
 expect(update.mock.calls[0][1]).toMatchObject({ total_assets: 1200, net_worth: 1000, asset_balances: [expect.objectContaining({ account_id: 'asset_bank', currency: 'CNY' }), expect.objectContaining({ account_id: 'foreign', currency: 'USD', amount: 50, imported_note: 'keep' })] });
});

it('same-name CNY and USD balances round-trip separate IDs/currencies/metadata and editable values', async () => {
 const update = vi.fn().mockResolvedValue(undefined);
 const duplicate = { ...stored, entity: { ...snapshot, asset_balances: [
  { account_id: 'bank-cny', account: 'Bank', amount: 1000, currency: 'CNY', imported_note: 'yuan' },
  { account_id: 'bank-usd', account: 'Bank', amount: 50, currency: 'USD', imported_note: 'dollar' },
 ] } };
 await render(<AccountsOverview snapshots={[duplicate]} objects={[]} onCreateSnapshot={vi.fn()} onUpdateSnapshot={update} onDeleteSnapshot={vi.fn()} />);
 await click('edit');
 expect(host.querySelector('textarea')!.value).toBe('Bank 1000 CNY\nBank 50 USD');
 await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
 expect(update.mock.calls[0][1]).toMatchObject({ total_assets: 1000, net_worth: 800, asset_balances: [
  expect.objectContaining({ account_id: 'bank-cny', currency: 'CNY', amount: 1000, imported_note: 'yuan' }),
  expect.objectContaining({ account_id: 'bank-usd', currency: 'USD', amount: 50, imported_note: 'dollar' }),
 ] });
 await click('edit');
 await change(host.querySelector('textarea')!, 'Bank 60 USD\nBank 1200 CNY');
 await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
 expect(update.mock.calls[1][1]).toMatchObject({ total_assets: 1200, net_worth: 1000, asset_balances: [
  expect.objectContaining({ account_id: 'bank-usd', currency: 'USD', amount: 60, imported_note: 'dollar' }),
  expect.objectContaining({ account_id: 'bank-cny', currency: 'CNY', amount: 1200, imported_note: 'yuan' }),
 ] });
});


it('preselects matching review or pending experience based on initialTargetId', async () => {
  const tripExp = {
    schema_version: '0.1',
    id: 'obj_trip_review_t1',
    title: 'Trip to Kyoto',
    type: 'object',
    object_type: 'one_time_experience',
    status: 'completed',
    created_at: '2026-10-01',
  } as WYQDObject;

  const tripReview = {
    entity: {
      schema_version: '0.1',
      id: 'review_trip_t2',
      title: 'Review Trip to Osaka',
      type: 'review',
      review_type: 'object_review',
      target: 'Trip to Osaka',
      target_id: 'obj_trip_review_t2',
      summary: 'Osaka food tour',
      food_score: 95,
      created_at: '2026-10-02',
    } as ReviewEntry,
    fileName: 'review_trip_t2.md',
    body: '## Review',
  } as WYQDStoredEntity<ReviewEntry>;

  // 1. Scored retrospective: initialTargetId matches target_id
  await render(
    <ReviewHome
      objects={[tripExp]}
      reviews={[tripReview]}
      membership={{} as never}
      initialTargetId="obj_trip_review_t2"
      onCreateReview={vi.fn()}
      onUpdateReview={vi.fn()}
      onDeleteReview={vi.fn()}
    />,
  );
  expect(host.textContent).toContain('Review Trip to Osaka');
  expect(host.textContent).toContain('Osaka food tour');

  // 2. Unscored retrospective: initialTargetId matches pending experience id
  await render(
    <ReviewHome
      objects={[tripExp]}
      reviews={[tripReview]}
      membership={{} as never}
      initialTargetId="obj_trip_review_t1"
      onCreateReview={vi.fn()}
      onUpdateReview={vi.fn()}
      onDeleteReview={vi.fn()}
    />,
  );
  expect(host.querySelector('form')).not.toBeNull();
  expect(host.querySelector('textarea')?.value).toBe('reviewAbout');
});

it('opens the pending trip form on the first mount and when newly saved data arrives later', async () => {
  const object = { schema_version: '0.1', type: 'object', id: 'pending-trip', title: 'Newly saved trip',
    object_type: 'one_time_experience', status: 'completed', created_at: '2026-10-01' } as WYQDObject;
  const props = { reviews: [], membership: {} as never, initialTargetId: object.id,
    onCreateReview: vi.fn(), onUpdateReview: vi.fn(), onDeleteReview: vi.fn() };
  await render(<ReviewHome {...props} objects={[]} />);
  expect(host.querySelector('form')).toBeNull();
  await render(<ReviewHome {...props} objects={[object]} />);
  expect(host.querySelector('form')).not.toBeNull();
  await render(<ReviewHome key="fresh-mount" {...props} objects={[object]} />);
  expect(host.querySelector('form')).not.toBeNull();
});

it('selects the requested review on first mount even when it is not the newest review', async () => {
  const makeReview = (id: string, date: string) => ({ fileName: `${id}.md`, body: id, entity: {
    schema_version: '0.1', type: 'review', id, review_type: 'object_review', title: id,
    target_id: `object-${id}`, created_at: date, reviewed_at: date, summary: id,
  } } as WYQDStoredEntity<ReviewEntry>);
  await render(<ReviewHome objects={[]} reviews={[makeReview('newest', '2026-10-10'), makeReview('requested', '2026-10-01')]}
    membership={{} as never} initialTargetId="object-requested" onCreateReview={vi.fn()} onUpdateReview={vi.fn()} onDeleteReview={vi.fn()} />);
  expect(host.querySelector('aside h3')?.textContent).toBe('requested');
});
