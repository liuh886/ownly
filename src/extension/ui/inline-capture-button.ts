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
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.2;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 9999px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
      cursor: pointer;
      outline: none;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      text-decoration: none;
      white-space: nowrap;
    }
    .card-fab-btn:hover {
      transform: translateY(-1px) scale(1.02);
      box-shadow: 0 4px 14px rgba(4, 120, 87, 0.38);
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    }
    .card-fab-btn.is-success {
      background: linear-gradient(135deg, #10b981 0%, #047857 100%);
      border-color: #6ee7b7;
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.45);
    }
    .card-fab-btn.is-exists {
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
      border-color: #7dd3fc;
      box-shadow: 0 0 12px rgba(2, 132, 199, 0.45);
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
  btn.innerHTML = `<span class="card-fab-icon">📌</span><span class="card-fab-text">${buttonText}</span>`;

  btn.addEventListener('mousedown', isolateEvent);
  btn.addEventListener('pointerdown', isolateEvent);

  let isSaving = false;
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
        btn.classList.remove('is-loading');
        btn.innerHTML = `<span class="card-fab-icon">⚠️</span><span class="card-fab-text">${errorText}</span>`;
        setTimeout(() => {
          btn.innerHTML = `<span class="card-fab-icon">📌</span><span class="card-fab-text">${buttonText}</span>`;
          isSaving = false;
        }, 2000);
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
        btn.classList.add('is-exists');
        btn.innerHTML = `<span class="card-fab-icon">ℹ️</span><span class="card-fab-text">${existsText}</span>`;
        setTimeout(() => {
          btn.classList.remove('is-exists');
          btn.innerHTML = `<span class="card-fab-icon">📌</span><span class="card-fab-text">${buttonText}</span>`;
          isSaving = false;
        }, 2500);
      } else if (resp?.ok) {
        btn.classList.add('is-success');
        btn.innerHTML = `<span class="card-fab-icon">✓</span><span class="card-fab-text">${successText}</span>`;
        setTimeout(() => {
          btn.classList.remove('is-success');
          btn.innerHTML = `<span class="card-fab-icon">📌</span><span class="card-fab-text">${buttonText}</span>`;
          isSaving = false;
        }, 2500);
      } else {
        btn.innerHTML = `<span class="card-fab-icon">⚠️</span><span class="card-fab-text">${errorText}</span>`;
        setTimeout(() => {
          btn.innerHTML = `<span class="card-fab-icon">📌</span><span class="card-fab-text">${buttonText}</span>`;
          isSaving = false;
        }, 2000);
      }
    } catch {
      btn.classList.remove('is-loading');
      btn.innerHTML = `<span class="card-fab-icon">⚠️</span><span class="card-fab-text">${errorText}</span>`;
      setTimeout(() => {
        btn.innerHTML = `<span class="card-fab-icon">📌</span><span class="card-fab-text">${buttonText}</span>`;
        isSaving = false;
      }, 2000);
    }
  });

  root.appendChild(btn);

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

