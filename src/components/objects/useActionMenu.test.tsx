// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useActionMenu } from './useActionMenu';
import { ObjectCardPhysical } from './ObjectCardPhysical';
import { ObjectCardSupporting } from './ObjectCardSupporting';
vi.mock('@/core/i18n-context', () => ({ useI18n: () => ({ t: (key: string) => key, language: 'en', currency: 'CNY' }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement; let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function key(target: HTMLElement, key: string) { await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))); }
async function click(target: HTMLElement) { await act(async () => target.click()); }
function Menu({ outside }: { outside: () => void }) {
 const [open, setOpen] = useState(false);
 const { rootRef, toggle, close, onKeyDown, onPointerDown, onMouseDown } = useActionMenu(open, setOpen);
 return <><div ref={rootRef} onKeyDown={onKeyDown} onPointerDown={onPointerDown} onMouseDown={onMouseDown}><button aria-haspopup="menu" aria-expanded={open} aria-controls="test-menu" onClick={toggle}>Actions</button>{open ? <div role="menu" id="test-menu"><button role="menuitem" tabIndex={-1} onClick={close}>First</button><button role="menuitem" tabIndex={-1} onClick={close}>Second</button></div> : null}</div><button onClick={outside}>Outside action</button></>;
}
it('Enter/Space open and focus first, arrows/Home/End navigate, Escape restores trigger', async () => {
 await act(async () => root.render(<Menu outside={vi.fn()} />));
 const trigger = host.querySelector('button')!;
 await key(trigger, 'Enter');
 const items = Array.from(host.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
 expect(document.activeElement).toBe(items[0]);
 await key(items[0], 'ArrowUp'); expect(document.activeElement).toBe(items[1]);
 await key(items[1], 'ArrowDown'); expect(document.activeElement).toBe(items[0]);
 await key(items[0], 'End'); expect(document.activeElement).toBe(items[1]);
 await key(items[1], 'Home'); expect(document.activeElement).toBe(items[0]);
 await key(items[0], 'Escape'); expect(host.querySelector('[role="menu"]')).toBeNull(); expect(document.activeElement).toBe(trigger);
 await key(trigger, ' '); expect(document.activeElement).toBe(host.querySelector('[role="menuitem"]'));
});
it('native pointer trigger click dismisses; outside pointer does not consume the intended action; keyboard departure closes', async () => {
 const outside = vi.fn(); await act(async () => root.render(<Menu outside={outside} />)); const trigger = host.querySelector('button')!;
 await click(trigger);
 await act(async () => { trigger.dispatchEvent(new Event('pointerdown', { bubbles: true })); trigger.focus(); trigger.dispatchEvent(new Event('pointerup', { bubbles: true })); });
 await click(trigger); expect(host.querySelector('[role="menu"]')).toBeNull();
 await click(trigger); const destination = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Outside action')!;
 const pointer = new Event('pointerdown', { bubbles: true, cancelable: true });
 await act(async () => destination.dispatchEvent(pointer)); expect(pointer.defaultPrevented).toBe(false);
 await click(destination); expect(outside).toHaveBeenCalledOnce(); expect(host.querySelector('[role="menu"]')).toBeNull();
 await click(trigger); await act(async () => destination.focus()); expect(document.activeElement).toBe(destination); expect(host.querySelector('[role="menu"]')).toBeNull();
});
it('pointer opening resets the guard so Shift+Tab focus back to the trigger dismisses', async () => {
 await act(async () => root.render(<Menu outside={vi.fn()} />));
 const trigger = host.querySelector('button')!;
 await act(async () => {
  trigger.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  trigger.focus();
  trigger.dispatchEvent(new Event('pointerup', { bubbles: true }));
  trigger.click();
 });
 expect(document.activeElement).toBe(host.querySelector('[role="menuitem"]'));
 await act(async () => trigger.focus());
 expect(host.querySelector('[role="menu"]')).toBeNull();
 expect(document.activeElement).toBe(trigger);
});
it('retiring retains focus on the card after its action trigger disappears', async () => {
 const select = vi.fn();
 function Card() {
  const [status, setStatus] = useState('using');
  const [openActionMenuFileName, setOpenActionMenuFileName] = useState<string | null>(null);
  const [exitingFileName, setExitingFileName] = useState<string | null>(null);
  const props = { stored: { fileName: 'object.md', body: '', entity: { schema_version: '0.1', created_at: '2026-01-01', started_at: '2026-01-01', id: 'item', title: 'Item', type: 'object', object_type: 'physical', status, purchase_price: 100 } }, isEditing: false, isDetailing: false, openActionMenuFileName, setOpenActionMenuFileName, exitingFileName, deletingFileName: null, onUpdate: async () => { setStatus('idle'); }, onDelete: vi.fn(), setEditingFileName: vi.fn(), setSelectedFileName: select, setExitingFileName, setDeletingFileName: vi.fn(), confirm: vi.fn(), menuItemClass: '' };
  return <ObjectCardPhysical {...props as unknown as Parameters<typeof ObjectCardPhysical>[0]} />;
 }
 await act(async () => root.render(<Card />));
 await key(host.querySelector('button[aria-haspopup="menu"]') as HTMLElement, 'Enter');
 await click(host.querySelector('[role="menuitem"]') as HTMLElement);
 expect(host.querySelector('button[aria-haspopup="menu"]')).toBeNull();
 expect(document.activeElement).toBe(host.querySelector('[role="button"]'));
 expect(select).not.toHaveBeenCalled();
});
it.each(['physical', 'recurring_cost'])('%s card menu uses shared keyboard behavior without opening details', async (kind) => {
 const select = vi.fn();
 function Card() {
  const [openActionMenuFileName, setOpenActionMenuFileName] = useState<string | null>(null);
  const common = { stored: { fileName: 'object.md', body: '', entity: { schema_version: '0.1', created_at: '2026-01-01', started_at: '2026-01-01', id: 'item', title: 'Item', type: 'object', object_type: kind, status: kind === 'physical' ? 'using' : 'active', purchase_price: 100, billing_amount: 10, billing_cycle: 'monthly' } }, isEditing: false, isDetailing: false, openActionMenuFileName, setOpenActionMenuFileName, exitingFileName: null, deletingFileName: null, onUpdate: vi.fn(), onDelete: vi.fn(), setEditingFileName: vi.fn(), setSelectedFileName: select, setExitingFileName: vi.fn(), setDeletingFileName: vi.fn(), confirm: vi.fn(), menuItemClass: '' };
  if (kind === 'physical') return <ObjectCardPhysical {...common as unknown as Parameters<typeof ObjectCardPhysical>[0]} />;
  return <ObjectCardSupporting {...{ ...common, reviews: [], isReviewing: false, reviewSummary: '', reviewFoodScore: '', reviewSceneryScore: '', reviewExperienceScore: '', setReviewingFileName: vi.fn(), setReviewSummary: vi.fn(), setReviewFoodScore: vi.fn(), setReviewSceneryScore: vi.fn(), setReviewExperienceScore: vi.fn(), onCreateObjectReview: vi.fn(), cancelObjectReview: vi.fn(), prompt: vi.fn() } as unknown as Parameters<typeof ObjectCardSupporting>[0]} />;
 }
 await act(async () => root.render(<Card />)); const trigger = host.querySelector('button[aria-haspopup="menu"]') as HTMLElement;
 await key(trigger, ' '); const item = host.querySelector('[role="menuitem"]') as HTMLElement;
 expect(document.activeElement).toBe(item); expect(select).not.toHaveBeenCalled();
 await key(item, 'ArrowDown'); expect(document.activeElement).toBe(item);
 await key(item, 'Escape'); expect(document.activeElement).toBe(trigger); expect(host.querySelector('[role="menu"]')).toBeNull();
});
