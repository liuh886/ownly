import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';

/** WAI action-menu behavior shared by cards; native outside clicks remain usable. */
export function useActionMenu(open: boolean, onOpenChange: (open: boolean) => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  const openChange = useRef(onOpenChange);
  const focusLast = useRef(false);
  const pointerFocus = useRef(false);
  useEffect(() => { openChange.current = onOpenChange; });
  const trigger = () => rootRef.current?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  const items = () => Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
  const close = () => { openChange.current(false); trigger()?.focus(); };
  const toggle = () => openChange.current(!open);

  useEffect(() => {
    if (!open) return;
    const entries = items();
    (focusLast.current ? entries.at(-1) : entries[0])?.focus();
    focusLast.current = false;
    pointerFocus.current = false;
    const outside = (event: Event) => {
      if (!(event.target instanceof Node)) return;
      if (event.type === 'focusin' && event.target === trigger() && !pointerFocus.current) {
        openChange.current(false);
        return;
      }
      if (rootRef.current?.contains(event.target)) return;
      if (event.type === 'pointerdown' && rootRef.current?.querySelector('[role="menu"]')?.contains(document.activeElement)) trigger()?.focus({ preventScroll: true });
      openChange.current(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      openChange.current(false);
      trigger()?.focus();
    };
    const release = () => { pointerFocus.current = false; };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation(); // The surrounding card also opens details on Enter/Space.
    if (event.target === trigger() && ['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      if (open && ['Enter', ' '].includes(event.key)) { close(); return; }
      focusLast.current = event.key === 'ArrowUp';
      if (open) {
        (focusLast.current ? items().at(-1) : items()[0])?.focus();
        focusLast.current = false;
      }
      else openChange.current(true);
      return;
    }
    if (!open) return;
    const entries = items();
    const index = entries.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (event.key === 'ArrowDown') next = (index + 1) % entries.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + entries.length) % entries.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = entries.length - 1;
    else if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    else return;
    event.preventDefault(); entries[next]?.focus();
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => { pointerFocus.current = Boolean(trigger()?.contains(event.target as Node)); };
  const onMouseDown = (event: MouseEvent<HTMLDivElement>) => event.stopPropagation();
  return { rootRef, toggle, close, onKeyDown, onPointerDown, onMouseDown };
}
