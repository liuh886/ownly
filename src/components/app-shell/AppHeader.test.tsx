// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppHeader } from './AppHeader';
const state = vi.hoisted(() => ({ mode: 'connected', language: 'en', currency: 'CNY', setLanguage: vi.fn(), setCurrency: vi.fn() }));
vi.mock('@/core/i18n-context', () => ({ useI18n: () => ({ t: (key: string) => key, ...state }) }));
vi.mock('@/core/ownly-workspace-context', () => ({ useOwnlyWorkspace: () => ({ runtimeTarget: 'web', mode: state.mode, isLoading: false, membership: { isPro: false }, openLicenseModal: vi.fn() }) }));
vi.mock('@/components/pwa/PwaInstallButton', () => ({ PwaInstallButton: () => null }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement; let root: Root;
beforeEach(() => { state.mode = 'connected'; host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
const props = { activeTab: 'home' as const, objectCount: 3, snapshotCount: 2, onConnectVault: vi.fn(), onDisconnectFolder: vi.fn(), onOpenAgentGuide: vi.fn() };
async function render() { await act(async () => root.render(<AppHeader {...props} />)); }
const connection = () => host.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
const overflow = () => host.querySelector('button[aria-label="More options"]') as HTMLButtonElement;
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function key(element: HTMLElement, key: string) { await act(async () => element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))); }
it('connection menu opens at first/last item, wraps arrows, and Escape restores its trigger', async () => {
 await render(); const trigger = connection();
 await click(trigger);
 const items = Array.from(host.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
 expect(document.activeElement).toBe(items[0]);
 expect(trigger.getAttribute('aria-controls')).toBe(host.querySelector('[role="menu"]')!.id);
 await key(items[0], 'ArrowUp'); expect(document.activeElement).toBe(items[1]);
 await key(items[1], 'ArrowDown'); expect(document.activeElement).toBe(items[0]);
 await key(items[0], 'End'); expect(document.activeElement).toBe(items[1]);
 await key(items[1], 'Escape'); expect(host.querySelector('[role="menu"]')).toBeNull(); expect(document.activeElement).toBe(trigger);
 await key(trigger, 'ArrowUp'); expect(document.activeElement).toBe(host.querySelectorAll('[role="menuitem"]')[1]);
});
it('native preferences use disclosure semantics and closing a select restores focus', async () => {
 await render(); const trigger = overflow(); await click(trigger);
 const panel = host.querySelector('[role="region"]')!;
 expect(trigger.getAttribute('aria-haspopup')).toBeNull();
 expect(trigger.getAttribute('aria-controls')).toBe(panel.id);
 expect(panel.querySelector('[role="menuitem"]')).toBeNull();
 expect(panel.contains(document.activeElement)).toBe(true);
 const select = panel.querySelector('select')!;
 await act(async () => { select.focus(); select.value = 'USD'; select.dispatchEvent(new Event('change', { bubbles: true })); });
 expect(state.setCurrency).toHaveBeenCalledWith('USD'); expect(host.querySelector('[role="region"]')).toBeNull(); expect(document.activeElement).toBe(trigger);
});
it('outside focus dismisses without stealing the destination; outside pointer is not intercepted', async () => {
 await render(); await click(connection()); const agent = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Agent')!;
 await act(async () => agent.focus()); expect(host.querySelector('[role="menu"]')).toBeNull(); expect(document.activeElement).toBe(agent);
 await click(connection());
 const event = new Event('pointerdown', { bubbles: true, cancelable: true });
 await act(async () => agent.dispatchEvent(event)); expect(event.defaultPrevented).toBe(false); expect(host.querySelector('[role="menu"]')).toBeNull();
 await click(agent); expect(props.onOpenAgentGuide).toHaveBeenCalled();
});
it('runtime connection changes do not reopen an old menu and view heading accepts navigation focus', async () => {
 await render(); await click(connection()); state.mode = 'disconnected'; await render();
 expect(document.activeElement).toBe(host.querySelector('#ownly-view-title'));
 state.mode = 'connected'; await render();
 expect(host.querySelector('[role="menu"]')).toBeNull();
 const heading = host.querySelector('#ownly-view-title') as HTMLElement; heading.focus(); expect(document.activeElement).toBe(heading);
});

it('Shift+Tab departure toward the trigger closes the menu so arrow reopening works', async () => {
 await render(); const trigger = connection(); await click(trigger);
 await act(async () => trigger.focus());
 expect(host.querySelector('[role="menu"]')).toBeNull();
 await key(trigger, 'ArrowDown');
 expect(document.activeElement).toBe(host.querySelector('[role="menuitem"]'));
});

it('clicking an open menu trigger dismisses despite native pointer focus preceding click', async () => {
 await render(); const trigger = connection(); await click(trigger);
 await act(async () => trigger.dispatchEvent(new Event('pointerdown', { bubbles: true })));
 await act(async () => trigger.focus());
 await act(async () => trigger.dispatchEvent(new Event('pointerup', { bubbles: true })));
 await click(trigger);
 expect(host.querySelector('[role="menu"]')).toBeNull();
 expect(document.activeElement).toBe(trigger);
});
