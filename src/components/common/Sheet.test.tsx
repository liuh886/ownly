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
    expect(dialog?.getAttribute('aria-label')).toBe('Test sheet');
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
    // Wraps to the first focusable element (drag handle button).
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    const first = dialog.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
    )[0];
    expect(document.activeElement).toBe(first);
  });
});
