// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { WYQDObject } from '@/domain/types';
import { createObjectDraft } from './composerDraftFactory';
import { useComposerFormState } from './useComposerFormState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let form: ReturnType<typeof useComposerFormState>;
let initial: WYQDObject | undefined;
const save = vi.fn<(object: WYQDObject, body: string) => Promise<void>>(async () => {});
const cancel = vi.fn();
function Probe() {
  const value = useComposerFormState({ initialObject: initial, t: (key) => key, onSubmit: save, onCancel: cancel });
  useEffect(() => { form = value; });
  return <form onSubmit={(e) => void value.handleSubmit(e)} onKeyDown={value.handleKeyDown}>
    <input value={value.title} onChange={(e) => value.setTitle(e.target.value)} aria-label="Name" />
    <button type="submit">Save</button><output>{JSON.stringify(value.errors)}</output>
  </form>;
}
async function mount(object?: WYQDObject) {
  initial = object; await act(async () => root.render(<Probe />));
}
const event = () => ({ preventDefault: vi.fn() }) as unknown as React.SyntheticEvent<HTMLFormElement>;
beforeEach(() => {
  vi.clearAllMocks(); save.mockResolvedValue(); initial = undefined;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it('keeps a nullable optional amount empty so an untouched record can still be edited', async () => {
  const draft = createObjectDraft({ title: 'Camera', objectType: 'physical', amount: 100 });
  await mount({ ...draft, sale_price: null } as unknown as WYQDObject);
  expect(form.salePrice).toBe('');
  await act(async () => form.handleSubmit(event()));
  expect(save).toHaveBeenCalledOnce();
});

it('preserves input and shows the write failure while preventing a repeated save or Escape during the write', async () => {
  await mount(createObjectDraft({ title: 'Camera', objectType: 'physical', amount: 100 }));
  let reject!: (error: Error) => void;
  save.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  let pending!: Promise<void>;
  await act(async () => {
    pending = form.handleSubmit(event());
    await form.handleSubmit(event());
    host.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(save).toHaveBeenCalledOnce(); expect(cancel).not.toHaveBeenCalled();
  await act(async () => { reject(new Error('Permission lost')); await pending; });
  expect(form.title).toBe('Camera'); expect(form.amount).toBe('100');
  expect(host.querySelector('output')!.textContent).toContain('Permission lost');
});

it('checks optional amounts even when the keyboard shortcut bypasses browser validation', async () => {
  await mount(createObjectDraft({ title: 'Trip', objectType: 'one_time_experience', amount: 100 }));
  await act(async () => form.setActualAmount('-1'));
  await act(async () => host.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })));
  expect(save).not.toHaveBeenCalled(); expect(form.errors.actualAmount).toBe('validationAmountPositive');
});

it('prevents impossible dates and out-of-range map coordinates before persistence', async () => {
  await mount(createObjectDraft({ title: 'Camera', objectType: 'physical', amount: 100 }));
  await act(async () => { form.setPurchasedAt('2026-10-04'); form.setEndedAt('2026-10-03'); });
  await act(async () => form.handleSubmit(event()));
  expect(form.errors.dates).toBe('validationDateOrder'); expect(save).not.toHaveBeenCalled();
  await act(async () => { form.setObjectType('one_time_experience'); form.setExperienceSubtype('travel_worldview'); form.setLocationLatitude('91'); });
  await act(async () => form.handleSubmit(event()));
  expect(form.errors.coordinates).toBe('validationCoordinates'); expect(save).not.toHaveBeenCalled();
});

it('requires an explicit annual cost for a custom billing cycle and accepts zero', async () => {
  await mount(createObjectDraft({ title: 'Membership', objectType: 'recurring_cost', amount: 100 }));
  await act(async () => { form.setBillingCycle('custom'); form.setAnnualizedCost(''); });
  await act(async () => form.handleSubmit(event()));
  expect(form.errors.annualizedCost).toBe('validationAnnualCost'); expect(save).not.toHaveBeenCalled();
  await act(async () => form.setAnnualizedCost('0'));
  await act(async () => form.handleSubmit(event()));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ billing_cycle: 'custom', annualized_cost: 0 }), expect.any(String));
});
