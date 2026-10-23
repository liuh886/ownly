// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Sheet } from './Sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

async function renderSheet(props: Partial<Parameters<typeof Sheet>[0]> = {}) {
  const onClose = vi.fn();
  await act(async () => {
    root?.render(
      <Sheet open title="Test sheet" onClose={onClose} {...props} />,
    );
  });
  // Let effects flush, then flush the deferred initial-focus timeout.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return onClose;
}

async function renderNode(node: ReactNode) {
  await act(async () => {
    root?.render(node);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function keydown(key: string, init?: KeyboardEventInit) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container.remove();
  document.body.innerHTML = '';
});

describe('Sheet', () => {
  it('renders nothing when closed', async () => {
    await renderSheet({ open: false });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders title, body and footer as an accessible dialog', async () => {
    await renderSheet({
      description: 'Sheet description',
      footer: <button type="button">Save</button>,
    });
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    const labelledBy = dialog?.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(container.querySelector(`#${labelledBy}`)?.textContent).toBe('Test sheet');
    expect(container.textContent).toContain('Sheet description');
    expect(container.textContent).toContain('Save');
  });

  it('closes on Escape when dismissible', async () => {
    const onClose = await renderSheet();
    await act(async () => {
      keydown('Escape');
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape when not dismissible', async () => {
    const onClose = await renderSheet({ dismissible: false });
    await act(async () => {
      keydown('Escape');
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on backdrop click but not on panel click', async () => {
    const onClose = await renderSheet();
    const backdrop = container.firstElementChild as HTMLElement;
    await act(async () => {
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    await act(async () => {
      dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('focuses the first field on open and restores focus on close', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'trigger';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    await renderNode(
      <Sheet open title="Test sheet" onClose={() => {}}>
        <input aria-label="first field" />
      </Sheet>,
    );
    const input = container.querySelector('input');
    expect(document.activeElement).toBe(input);

    await act(async () => {
      root?.unmount();
    });
    root = null;
    expect(document.activeElement).toBe(trigger);
  });

  it('traps Tab focus inside the panel', async () => {
    await renderNode(
      <Sheet
        open
        title="Test sheet"
        onClose={() => {}}
        footer={<button type="button">Save</button>}
      >
        <button type="button">Action</button>
      </Sheet>,
    );
    // Focus starts on the panel itself (no input present); move to last item.
    const save = container.querySelectorAll('button');
    const last = save[save.length - 1];
    last.focus();
    await act(async () => {
      keydown('Tab');
    });
    // The decorative drag handle has tabIndex=-1 and stays out of the Tab order.
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    const first = Array.from(dialog.querySelectorAll<HTMLElement>('button')).find((item) => item.tabIndex >= 0);
    expect(document.activeElement).toBe(first);
  });

  it('only closes the topmost dialog on Escape', async () => {
    const outer = vi.fn();
    const inner = vi.fn();
    await renderNode(<>
      <Sheet open title="Outer" onClose={outer} />
      <Sheet open title="Inner" onClose={inner} />
    </>);
    await act(async () => keydown('Escape'));
    expect(inner).toHaveBeenCalledOnce();
    expect(outer).not.toHaveBeenCalled();
    expect(document.body.classList.contains('ownly-scroll-locked')).toBe(true);
  });

  it('wraps Shift+Tab from the panel to the last enabled control', async () => {
    await renderSheet({ children: <button>Action</button>, footer: <button>Save</button> });
    (container.querySelector('[role="dialog"]') as HTMLElement).focus();
    await act(async () => keydown('Tab', { shiftKey: true }));
    expect(document.activeElement?.textContent).toBe('Save');
  });

  it('skips hidden and inherited-disabled fields for initial focus', async () => {
    await renderSheet({ children: <>
      <input type="hidden" />
      <fieldset disabled><input aria-label="Disabled" /></fieldset>
      <div hidden><input aria-label="Hidden" /></div>
      <input aria-label="Editable" />
    </> });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Editable');
  });

  it('keeps focus in place when saving makes a dialog non-dismissible', async () => {
    const content = <><input aria-label="First" /><input aria-label="Second" /></>;
    await renderSheet({ children: content });
    (container.querySelector('[aria-label="Second"]') as HTMLElement).focus();
    await renderSheet({ children: content, dismissible: false });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Second');
  });

  it('keeps Tab on the panel when there are no tabbable controls', async () => {
    await renderSheet();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(container.querySelector('[role="dialog"]'));
  });

  it('restores focus to the underlying dialog without unlocking scroll', async () => {
    const outer = <Sheet open title="Outer" onClose={() => {}}><input aria-label="Outer field" /></Sheet>;
    await renderNode(outer);
    const outerField = container.querySelector('input');
    await renderNode(<>{outer}<Sheet open title="Inner" onClose={() => {}}><input aria-label="Inner field" /></Sheet></>);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Inner field');
    await renderNode(<>{outer}</>);
    expect(document.activeElement).toBe(outerField);
    expect(document.body.classList.contains('ownly-scroll-locked')).toBe(true);
  });

  it('includes disclosure summaries but skips controls inside closed disclosures', async () => {
    await renderSheet({ children: <details><summary>Storage help</summary><input aria-label="Hidden details" /></details> });
    const summary = container.querySelector('summary') as HTMLElement;
    summary.focus();
    await act(async () => keydown('Tab'));
    expect(document.activeElement).toBe(summary);
  });
});
