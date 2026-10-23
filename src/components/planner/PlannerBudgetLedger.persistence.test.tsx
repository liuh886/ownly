// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlannerBudgetLedger } from './PlannerBudgetLedger';
import type { PlannerTrip } from '@/domain/planner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const trip: PlannerTrip = { schema_version: '0.1', type: 'trip', id: 't1', title: 'Trip', status: 'planning',
  start_date: '2026-10-05', end_date: '2026-10-06', destinations: ['Tokyo'], currency: 'CNY', created_at: '2026-10-01' };
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
function button(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((node) => node.textContent?.includes(text));
  if (!found) throw new Error(`Missing button ${text}`);
  return found;
}
async function fill(placeholder: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
describe('expense draft persistence', () => {
  it('keeps a failed draft open, prevents duplicate submit/close while saving, then allows retry', async () => {
    let reject!: (error: Error) => void;
    const first = new Promise<void>((_, fail) => { reject = fail; });
    const save = vi.fn().mockReturnValueOnce(first).mockResolvedValue(undefined);
    await act(async () => root.render(<PlannerBudgetLedger trip={trip} scheduledPlaces={[]} expenses={[]} members={['Me']}
      language="en" onAddExpense={save} onDeleteExpense={vi.fn()} onUpdateMembers={vi.fn()} />));
    await act(async () => button('+ Add Expense').click());
    await fill('e.g. Seafood dinner', 'Dinner');
    await fill('0.00', '100');
    const form = container.querySelector('form')!;
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(save).toHaveBeenCalledOnce();
    expect(container.querySelector('fieldset')!.disabled).toBe(true);
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(save).toHaveBeenCalledOnce();
    await act(async () => reject(new Error('Disk denied')));
    expect(container.querySelector('[role="alert"]')!.textContent).toBe('Disk denied');
    expect(container.querySelector<HTMLInputElement>('input[placeholder="e.g. Seafood dinner"]')!.value).toBe('Dinner');
    expect(container.querySelector<HTMLInputElement>('input[placeholder="0.00"]')!.value).toBe('100');
    expect(container.querySelector('fieldset')!.disabled).toBe(false);
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(save).toHaveBeenCalledTimes(2);
    expect(container.querySelector('input[placeholder="e.g. Seafood dinner"]')).toBeNull();
  });
});
