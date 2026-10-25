// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CreateTripModal } from './CreateTripModal';
import { experienceFromTrip } from '@/domain/trip-experience';
import type { PlannerTrip } from '@/domain/planner';

vi.mock('./SampleTripPicker', () => ({ SampleTripPicker: () => null }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const trip: PlannerTrip = { schema_version: '0.1', type: 'trip', id: 'trip-one', title: 'Kyoto', status: 'planning',
  start_date: '2026-11-01', end_date: '2026-11-05', destinations: ['Kyoto'], currency: 'CNY', created_at: '2026-10-01' };
const experience = { ...experienceFromTrip(trip), id: 'existing-intention', budget_total: 5000 };
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it('opens from Objects with shared fields prefilled and saves the original experience identity', async () => {
  const onCreate = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(<CreateTripModal open onClose={vi.fn()} onCreate={onCreate}
    experiences={[experience]} initialExperienceId={experience.id} />));
  expect(host.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('Kyoto');
  expect([...host.querySelectorAll<HTMLInputElement>('input[type="date"]')].slice(0, 2).map((input) => input.value)).toEqual(['2026-11-01', '2026-11-05']);
  expect(host.querySelector<HTMLSelectElement>('select[id$="-experience"]')?.value).toBe(experience.id);
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ experience_id: experience.id, title: 'Kyoto', currency: 'CNY' }), undefined);
});

it('links an old unlinked itinerary without overwriting the itinerary fields and passes its original snapshot', async () => {
  const onCreate = vi.fn().mockResolvedValue(undefined);
  await act(async () => root.render(<CreateTripModal open onClose={vi.fn()} onCreate={onCreate}
    trips={[trip]} initialEditTripId={trip.id} experiences={[{ ...experience, title: 'Older wish' }]} />));
  const select = host.querySelector<HTMLSelectElement>('select[id$="-experience"]')!;
  await act(async () => { select.value = experience.id; select.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Kyoto', experience_id: experience.id }), trip);
});

it('keeps an existing association locked and marks experiences linked to other trips unavailable', async () => {
  const other = { ...trip, id: 'other-trip', experience_id: 'taken' };
  await act(async () => root.render(<CreateTripModal open onClose={vi.fn()} onCreate={vi.fn()}
    trips={[{ ...trip, experience_id: experience.id }, other]} initialEditTripId={trip.id}
    experiences={[experience, { ...experience, id: 'taken' }]} />));
  const select = host.querySelector<HTMLSelectElement>('select[id$="-experience"]')!;
  expect(select.disabled).toBe(true);
  expect(select.querySelector<HTMLOptionElement>('option[value="taken"]')?.disabled).toBe(true);
});
