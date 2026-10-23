// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlannerControllerReturn } from './usePlannerController';
const mocks = vi.hoisted(() => ({
  workspace: { isDemoMode: true, isLoading: false, dataRevision: 0, membership: { isPro: true } },
  trips: vi.fn(async () => []), places: vi.fn(async () => []),
  write: vi.fn(), capture: vi.fn(),
}));
vi.mock('@/core/i18n-context', () => ({ useI18n: () => ({ language: 'en' }) }));
vi.mock('@/core/ownly-workspace-context', () => ({ useOwnlyWorkspace: () => mocks.workspace }));
vi.mock('./capture-bridge', () => ({ pullCaptureState: mocks.capture, setCaptureContext: mocks.capture }));
vi.mock('@/services/PlannerRepository', () => ({ plannerRepository: {
  initialize: vi.fn(async () => {}), listTrips: mocks.trips, listPlaces: mocks.places,
  listVisits: vi.fn(async () => []), listLegs: vi.fn(async () => []), listExpenses: vi.fn(async () => []),
  upsertTrip: mocks.write, upsertExpense: mocks.write, deleteTrip: mocks.write,
} }));
import { usePlannerController } from './usePlannerController';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let controller: PlannerControllerReturn;
function Probe() {
  const value = usePlannerController({ disabled: true });
  useEffect(() => { controller = value; });
  return null;
}
async function render() {
  await act(async () => root.render(<Probe />));
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.workspace.isDemoMode = true;
  mocks.workspace.dataRevision = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
describe('read-only Planner demo', () => {
  it('reads examples while writes are disabled, without contacting Capture', async () => {
    await render();
    expect(mocks.trips).toHaveBeenCalledOnce();
    expect(mocks.places).toHaveBeenCalledOnce();
    expect(mocks.capture).not.toHaveBeenCalled();
    mocks.workspace.dataRevision = 1;
    await render();
    expect(mocks.trips).toHaveBeenCalledTimes(2);
  });
  it('does not read a disconnected workspace', async () => {
    mocks.workspace.isDemoMode = false;
    await render();
    expect(mocks.trips).not.toHaveBeenCalled();
  });
  it('blocks trip mutation even when a control calls the action directly', async () => {
    await render();
    await act(async () => controller.handleDeleteTrip('demo-trip'));
    expect(mocks.write).not.toHaveBeenCalled();
    expect(controller.notice).toContain('read-only');
  });
  it('rejects cloud publishing and rotation in demo mode', async () => {
    await render();
    await expect(controller.handlePublishTripShare()).rejects.toThrow('read-only');
    await expect(controller.handleCreateOrUpdateAccountFeed()).rejects.toThrow('read-only');
    await expect(controller.handleRotateAccountFeed()).rejects.toThrow('read-only');
  });
});
