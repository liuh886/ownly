import type { CurrentResearchPlace } from '../content';

export interface InlineCaptureButtonOptions {
  container: HTMLElement;
  anchor: HTMLElement;
  position?: 'before' | 'after' | 'prepend' | 'append';
  getPlace: () => CurrentResearchPlace | null | Promise<CurrentResearchPlace | null>;
  buttonText?: string;
  loadingText?: string;
  successText?: string;
  existsText?: string;
  errorText?: string;
  injectedAttribute?: string;
  customStyle?: string;
}

/**
 * Creates and injects an encapsulated Shadow-DOM "📌 放入案板" quick capture button.
 * Ensures zero style bleed, micro-animations, atomic messaging to background worker,
 * and resilient in-place deduplication feedback.
 */
export function injectInlineCaptureButton(options: InlineCaptureButtonOptions): HTMLElement | null {
  const {
    container,
    anchor,
    position = 'before',
    getPlace,
    buttonText = '放入案板',
    loadingText = '采集中...',
    successText = '已放入案板',
    existsText = '已在案板中',
    errorText = '保存失败',
    injectedAttribute = 'ownlyCardInjected',
    customStyle = '',
  } = options;

  if (container.dataset[injectedAttribute] === 'true' || anchor.dataset[injectedAttribute] === 'true') {
    return null;
  }

  container.dataset[injectedAttribute] = 'true';
  anchor.dataset[injectedAttribute] = 'true';

  const btnContainer = document.createElement('div');
  btnContainer.className = 'ownly-inline-fab-root';
  btnContainer.style.cssText = [
    'display: inline-flex',
    'align-items: center',
    'margin-right: 8px',
    'margin-bottom: 2px',
    'vertical-align: middle',
    'user-select: none',
    'pointer-events: auto',
    'position: relative',
    'z-index: 100',
    customStyle,
  ].filter(Boolean).join(';');

  // Prevent all mouse/pointer events from bubbling to ancestor links or card containers
  const isolateEvent = (ev: Event) => {
    ev.stopPropagation();
    if (ev.type === 'click' || ev.type === 'mousedown' || ev.type === 'pointerdown') {
      ev.preventDefault();
    }
  };

  btnContainer.addEventListener('click', isolateEvent);
  btnContainer.addEventListener('mousedown', isolateEvent);
  btnContainer.addEventListener('mouseup', isolateEvent);
  btnContainer.addEventListener('pointerdown', isolateEvent);
  btnContainer.addEventListener('pointerup', isolateEvent);

  const shadow = btnContainer.attachShadow ? btnContainer.attachShadow({ mode: 'open' }) : null;
  const root = shadow || btnContainer;

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .card-fab-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      background: #047857;
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.2;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 9999px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
      cursor: pointer;
      outline: none;
      transition: background 0.15s ease, transform 0.1s ease;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      text-decoration: none;
      white-space: nowrap;
    }
    .card-fab-btn:hover {
      background: #065f46;
    }
    .card-fab-btn:focus-visible {
      outline: 2px solid #047857;
      outline-offset: 2px;
    }
    .card-fab-btn.is-success {
      background: #047857;
      border-color: #6ee7b7;
    }
    .card-fab-btn.is-exists {
      background: #0369a1;
      border-color: #7dd3fc;
    }
    .card-fab-btn.is-loading {
      opacity: 0.85;
      cursor: wait;
    }
    .card-fab-icon {
      font-size: 12px;
      display: inline-flex;
    }
    .card-fab-text {
      white-space: nowrap;
    }
  `;
  root.appendChild(styleEl);

  const btn = document.createElement('button');
  btn.className = 'card-fab-btn';
  btn.setAttribute('type', 'button');
  btn.setAttribute('title', '一键采集到 Ownly 案板 (Inbox)');
  btn.setAttribute('aria-label', '一键采集到 Ownly 案板 (Inbox)');
  btn.innerHTML = `<span class="card-fab-icon">📌</span><span class="card-fab-text">${buttonText}</span>`;

  btn.addEventListener('mousedown', isolateEvent);
  btn.addEventListener('pointerdown', isolateEvent);

  let isSaving = false;
  const setPersistentState = (icon: string, text: string, cls: string) => {
    btn.classList.remove('is-loading', 'is-success', 'is-exists');
    if (cls) btn.classList.add(cls);
    btn.innerHTML = `<span class="card-fab-icon">${icon}</span><span class="card-fab-text">${text}</span>`;
    btn.setAttribute('aria-label', text);
    isSaving = false;
  };
  btn.addEventListener('click', async (ev) => {
    isolateEvent(ev);
    if (isSaving) return;

    isSaving = true;
    btn.classList.remove('is-success', 'is-exists');
    btn.classList.add('is-loading');
    btn.innerHTML = `<span class="card-fab-icon">⏳</span><span class="card-fab-text">${loadingText}</span>`;

    try {
      const place = await getPlace();
      if (!place || !place.title) {
        setPersistentState('⚠️', errorText, '');
        return;
      }

      btn.setAttribute('title', `一键采集「${place.title}」到 Ownly 案板 (Inbox)`);

      const resp = (await chrome.runtime.sendMessage({
        type: 'OWNLY_QUICK_SAVE_PLACE',
        place,
      }).catch((err: unknown) => ({ ok: false, error: String(err) }))) as {
        ok?: boolean;
        placeId?: string;
        alreadyExists?: boolean;
        error?: string;
      } | undefined;

      btn.classList.remove('is-loading');
      if (resp?.alreadyExists) {
        setPersistentState('ℹ️', existsText, 'is-exists');
      } else if (resp?.ok) {
        setPersistentState('✓', successText, 'is-success');
      } else {
        setPersistentState('⚠️', errorText, '');
      }
    } catch {
      setPersistentState('⚠️', errorText, '');
    }
  });

  root.appendChild(btn);

  // State awareness: places already on the board render the persistent
  // exists-state on load instead of the default action label.
  void (async () => {
    try {
      const place = await getPlace();
      if (!place?.title) return;
      const resp = await chrome.runtime.sendMessage({ type: 'OWNLY_CHECK_CAPTURED', place }) as {
        captured?: boolean;
      } | undefined;
      if (resp?.captured) {
        btn.classList.add('is-exists');
        btn.innerHTML = `<span class="card-fab-icon">ℹ️</span><span class="card-fab-text">${existsText}</span>`;
      }
    } catch {}
  })();

  if (position === 'before' && anchor.parentNode) {
    anchor.parentNode.insertBefore(btnContainer, anchor);
  } else if (position === 'after' && anchor.parentNode) {
    if (anchor.nextSibling) {
      anchor.parentNode.insertBefore(btnContainer, anchor.nextSibling);
    } else {
      anchor.parentNode.appendChild(btnContainer);
    }
  } else if (position === 'prepend') {
    anchor.insertBefore(btnContainer, anchor.firstChild);
  } else if (position === 'append') {
    anchor.appendChild(btnContainer);
  } else if (container.firstChild) {
    container.insertBefore(btnContainer, container.firstChild);
  } else {
    container.appendChild(btnContainer);
  }

  return btnContainer;
}

