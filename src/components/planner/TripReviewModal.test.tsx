// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TripReviewModal } from './TripReviewModal';
import type { PlannerTrip } from '@/domain/planner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const trip: PlannerTrip = {
  schema_version: '0.1',
  type: 'trip',
  id: 't-tokyo',
  title: 'Tokyo Trip',
  status: 'completed',
  start_date: '2026-10-01',
  end_date: '2026-10-05',
  destinations: ['Tokyo'],
  currency: 'JPY',
  created_at: '2026-10-01',
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function changeInput(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value',
    )!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('TripReviewModal', () => {
  it('renders score inputs and passes parsed scores to onConfirm', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <TripReviewModal
          trip={trip}
          places={[]}
          visits={[]}
          legs={[]}
          expenses={[]}
          language="zh"
          busy={false}
          onClose={onClose}
          onConfirm={onConfirm}
        />,
      );
    });

    const foodInput = host.querySelector<HTMLInputElement>('#trip-food-score');
    const sceneryInput = host.querySelector<HTMLInputElement>('#trip-scenery-score');
    const experienceInput = host.querySelector<HTMLInputElement>('#trip-experience-score');

    expect(foodInput).not.toBeNull();
    expect(sceneryInput).not.toBeNull();
    expect(experienceInput).not.toBeNull();

    await changeInput(foodInput!, '90');
    await changeInput(sceneryInput!, '85');
    await changeInput(experienceInput!, '95');

    const confirmBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('确认并保存'),
    );
    expect(confirmBtn).toBeDefined();

    await act(async () => {
      confirmBtn!.click();
    });

    expect(onConfirm).toHaveBeenCalledOnce();
    const confirmedDraft = onConfirm.mock.calls[0][0];
    expect(confirmedDraft.object.title).toBe('Tokyo Trip');
    expect(confirmedDraft.scores).toEqual({
      foodScore: 90,
      sceneryScore: 85,
      experienceScore: 95,
    });
  });

  it('validates score range and disables submission when score is out of bounds', async () => {
    const onConfirm = vi.fn();

    await act(async () => {
      root.render(
        <TripReviewModal
          trip={trip}
          places={[]}
          visits={[]}
          legs={[]}
          expenses={[]}
          language="zh"
          busy={false}
          onClose={vi.fn()}
          onConfirm={onConfirm}
        />,
      );
    });

    const foodInput = host.querySelector<HTMLInputElement>('#trip-food-score')!;
    await changeInput(foodInput, '150');

    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('0 到 100 之间');

    const confirmBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('确认并保存'),
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    await act(async () => {
      confirmBtn.click();
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
