// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import { useI18n, I18nProvider } from '@/core/i18n-context';

const mocks = vi.hoisted(() => ({
  init: vi.fn(async () => false),
  disconnect: vi.fn(async () => {}),
  seed: vi.fn(async () => {}),
  route: vi.fn(),
}));
vi.mock('@/services/ObsidianFileSystemService', () => ({ obsidianService: {
  initAutoConnect: mocks.init, disconnect: mocks.disconnect,
} }));
vi.mock('@/services/MarkdownEntityRepository', () => ({ markdownEntityRepository: {
  initialize: vi.fn(async () => {}),
} }));
vi.mock('@/services/seedDemoMode', () => ({ seedDemoMode: mocks.seed }));
vi.mock('@/services/ownlyStoreRouter', () => ({ setStoreFolderConnected: mocks.route }));
vi.mock('@/lib/analytics', () => ({ trackOwnlyEvent: vi.fn() }));
vi.mock('idb-keyval', () => ({ get: vi.fn(async () => null) }));
vi.mock('@/components/common/LicenseKeyModal', () => ({ LicenseKeyModal: () => null }));
vi.mock('@/components/app-shell/AppShell', () => ({ AppShell: function Probe() {
  const workspace = useOwnlyWorkspace();
  const { setLanguage, currency, setCurrency } = useI18n();
  return <>
    <output data-mode={workspace.mode} data-loading={String(workspace.isLoading)} data-currency={currency} />
    <button id="connect" onClick={() => void workspace.connect()}>Connect</button>
    <button id="language" onClick={() => setLanguage('zh')}>Language</button>
    <button id="currency" onClick={() => setCurrency('EUR')}>Currency</button>
    <button id="disconnect" onClick={() => void workspace.disconnectFolder()}>Disconnect</button>
  </>;
} }));
vi.mock('@/components/onboarding/WebDataOnboarding', () => ({
  WebDataOnboarding: ({ open, onDismiss, onContinueDemo }: {
    open: boolean; onDismiss: () => void; onContinueDemo: () => void;
  }) => open ? <>
    <button id="dismiss" onClick={onDismiss}>Dismiss</button>
    <button id="demo" onClick={onContinueDemo}>Demo</button>
  </> : null,
}));
import { WebShell } from './WebShell';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
async function mount() {
  await act(async () => { root.render(<I18nProvider initialLanguage="en"><WebShell /></I18nProvider>); });
}
async function click(id: string) {
  await act(async () => { (container.querySelector(`#${id}`) as HTMLButtonElement).click(); });
}
const mode = () => container.querySelector('output')?.getAttribute('data-mode');
beforeEach(() => {
  vi.clearAllMocks();
  mocks.init.mockResolvedValue(false);
  localStorage.clear();
  window.showDirectoryPicker = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('WebShell data mode choices', () => {
  it('shows the CNY example ledger without changing real-record currency preferences', async () => {
    localStorage.setItem('ownly_currency', 'GBP');
    await mount();
    expect(container.querySelector('output')?.getAttribute('data-currency')).toBe('GBP');
    await click('demo');
    expect(container.querySelector('output')?.getAttribute('data-currency')).toBe('CNY');
    await click('currency');
    expect(container.querySelector('output')?.getAttribute('data-currency')).toBe('EUR');
    expect(localStorage.getItem('ownly_currency')).toBe('GBP');
    await click('disconnect');
    expect(container.querySelector('output')?.getAttribute('data-currency')).toBe('GBP');
  });
  it('can reopen demo choices without directory-picker support after dismissing onboarding', async () => {
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, writable: true, value: undefined });
    await mount();
    await click('dismiss');
    await click('connect');
    expect(container.querySelector('#demo')).not.toBeNull();
    await click('demo');
    expect(mode()).toBe('demo');
  });
  it('keeps the connected folder when the change-folder dialog is dismissed', async () => {
    mocks.init.mockResolvedValue(true);
    await mount();
    await click('connect');
    await click('dismiss');
    expect(mode()).toBe('connected');
    expect(mocks.route).not.toHaveBeenCalledWith(false);
  });
  it('keeps a dismissed first-run session disconnected on reload', async () => {
    localStorage.setItem('ownly_web_onboarding_dismissed', 'true');
    await mount();
    expect(mode()).toBe('disconnected');
    expect(mocks.seed).not.toHaveBeenCalled();
  });
  it('forgets the real folder before explicitly entering demo', async () => {
    mocks.init.mockResolvedValue(true);
    await mount();
    await click('connect');
    await click('demo');
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mode()).toBe('demo');
  });
  it('does not restore or reseed the workspace when the language changes', async () => {
    await mount();
    await click('language');
    expect(mocks.init).toHaveBeenCalledOnce();
  });
  it('restores demo only after an explicit demo choice', async () => {
    localStorage.setItem('ownly_web_onboarding_dismissed', 'true');
    localStorage.setItem('ownly_web_demo_selected', 'true');
    await mount();
    expect(mode()).toBe('demo');
    expect(mocks.seed).toHaveBeenCalledOnce();
    await click('connect');
    await click('dismiss');
    expect(mode()).toBe('demo');
  });
});
