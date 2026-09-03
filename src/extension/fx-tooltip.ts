import { convertPriceRange, DEFAULT_USD_PIVOT } from '../domain/planner';
import { detectPageCurrency } from './currency-detector';

function detectDefaultTargetCurrency(): string {
  try {
    const raw = (chrome.i18n?.getUILanguage?.() || (typeof navigator !== 'undefined' ? navigator.language : 'en')).toLowerCase();
    return raw.startsWith('zh') ? 'CNY' : 'USD';
  } catch {
    return 'USD';
  }
}

function isChineseUi(): boolean {
  try {
    const raw = (chrome.i18n?.getUILanguage?.() || (typeof navigator !== 'undefined' ? navigator.language : 'en')).toLowerCase();
    return raw.startsWith('zh');
  } catch {
    return false;
  }
}

let targetCurrency = detectDefaultTargetCurrency();
let pivotRates: Record<string, number> = DEFAULT_USD_PIVOT;
let enabled = true;
let overrideCurrency: string | undefined;

function setOverride(value?: string): void {
  overrideCurrency = value && value !== 'AUTO' ? value.toUpperCase() : undefined;
}

function ensureTooltip(): HTMLDivElement {
  let node = document.getElementById('ownly-fx-tooltip') as HTMLDivElement | null;
  if (node) return node;

  const style = document.createElement('style');
  style.id = 'ownly-fx-styles';
  style.textContent = `
    #ownly-fx-tooltip{position:fixed;z-index:2147483647;pointer-events:none;opacity:0;transform:translateY(4px) scale(.98);transition:opacity .14s ease,transform .14s ease;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC",sans-serif;max-width:320px;user-select:none}
    #ownly-fx-tooltip.ownly-fx-visible{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}
    #ownly-fx-tooltip .ownly-fx-card{background:rgba(24,24,27,.95);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.16);border-radius:12px;padding:8px 12px;box-shadow:0 10px 28px -4px rgba(0,0,0,.55);color:#f4f4f5}
    #ownly-fx-tooltip .ownly-fx-header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px;font-size:10.5px;color:#a1a1aa;font-weight:500}
    #ownly-fx-tooltip .ownly-fx-value{font-size:16px;font-weight:700;color:#34d399;line-height:1.25;margin-bottom:3px}
    #ownly-fx-tooltip .ownly-fx-sub{display:flex;align-items:center;gap:6px;font-size:10px;color:#a1a1aa}
    #ownly-fx-tooltip .ownly-fx-badge{background:rgba(255,255,255,.1);padding:1px 4px;border-radius:4px;color:#d4d4d8;font-size:9px}
    #ownly-fx-tooltip button{background:transparent;border:0;color:#71717a;cursor:pointer;padding:2px 4px}
  `;
  (document.head || document.documentElement).appendChild(style);

  const isZh = isChineseUi();
  const headerText = isZh ? '💱 划词汇率' : '💱 Selection FX';
  const closeLabel = isZh ? '关闭' : 'Close';

  node = document.createElement('div');
  node.id = 'ownly-fx-tooltip';
  node.innerHTML = `
    <div class="ownly-fx-card">
      <div class="ownly-fx-header"><span>${headerText}</span><button type="button" aria-label="${closeLabel}">✕</button></div>
      <div class="ownly-fx-value">--</div>
      <div class="ownly-fx-sub"><span class="ownly-fx-rate">--</span><span class="ownly-fx-badge">--</span></div>
    </div>`;
  node.querySelector('button')?.addEventListener('click', (event) => {
    event.stopPropagation();
    hideTooltip();
  });
  (document.body || document.documentElement).appendChild(node);
  return node;
}

function hideTooltip(): void {
  document.getElementById('ownly-fx-tooltip')?.classList.remove('ownly-fx-visible');
}

function showSelectionFx(): void {
  if (!enabled) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    hideTooltip();
    return;
  }
  const text = selection.toString().trim();
  if (!text || text.length > 80) {
    hideTooltip();
    return;
  }

  const pageCurrency = overrideCurrency || detectPageCurrency({
    url: window.location.href,
    priceText: text,
    overrideCurrency,
    doc: document,
  }).currency;
  const result = convertPriceRange(text, targetCurrency, pivotRates, pageCurrency);
  if (!result || result.sourceCurrency === result.targetCurrency) {
    hideTooltip();
    return;
  }

  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (rect.width <= 0 && rect.height <= 0) return;
  const node = ensureTooltip();
  const value = node.querySelector<HTMLElement>('.ownly-fx-value');
  const rate = node.querySelector<HTMLElement>('.ownly-fx-rate');
  const badge = node.querySelector<HTMLElement>('.ownly-fx-badge');
  if (value) value.textContent = `≈ ${result.formattedTarget}`;
  if (rate) rate.textContent = result.rateDescription;
  if (badge) badge.textContent = result.targetCurrency;

  const width = 230;
  const height = 65;
  let top = rect.top - height - 8;
  if (top < 10) top = rect.bottom + 8;
  const left = Math.max(10, Math.min(window.innerWidth - width - 10, rect.left + (rect.width - width) / 2));
  node.style.top = `${Math.round(top)}px`;
  node.style.left = `${Math.round(left)}px`;
  node.classList.add('ownly-fx-visible');
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  const type = (message as { type?: string }).type;
  if (type === 'OWNLY_FX_TOOLTIP_STATUS_CHANGED') {
    enabled = (message as { enabled?: boolean }).enabled !== false;
    if (!enabled) hideTooltip();
    sendResponse({ ok: true });
    return;
  }
  if (type === 'OWNLY_FX_CONFIG_UPDATED') {
    const config = message as { targetCurrency?: string; rates?: Record<string, number>; enabled?: boolean };
    if (config.targetCurrency) targetCurrency = config.targetCurrency;
    if (config.rates) pivotRates = config.rates;
    if (typeof config.enabled === 'boolean') enabled = config.enabled;
    sendResponse({ ok: true });
    return;
  }
  if (type === 'OWNLY_CURRENCY_OVERRIDE_CHANGED') {
    setOverride((message as { overrideCurrency?: string }).overrideCurrency);
    sendResponse({ ok: true });
  }
});

void chrome.runtime.sendMessage({ type: 'OWNLY_GET_FX_CONFIG' })
  .then((response: unknown) => {
    const config = response as { ok?: boolean; targetCurrency?: string; rates?: Record<string, number>; enabled?: boolean; overrideCurrency?: string } | undefined;
    if (!config?.ok) return;
    if (config.targetCurrency) targetCurrency = config.targetCurrency;
    if (config.rates) pivotRates = config.rates;
    if (typeof config.enabled === 'boolean') enabled = config.enabled;
    setOverride(config.overrideCurrency);
  })
  .catch(() => {});

document.addEventListener('mouseup', (event) => {
  const node = document.getElementById('ownly-fx-tooltip');
  if (node?.contains(event.target as Node)) return;
  window.setTimeout(showSelectionFx, 15);
});

document.addEventListener('keyup', (event) => {
  if (event.key === 'Shift' || event.key.startsWith('Arrow')) window.setTimeout(showSelectionFx, 15);
});

document.addEventListener('mousedown', (event) => {
  const node = document.getElementById('ownly-fx-tooltip');
  if (node && !node.contains(event.target as Node)) hideTooltip();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideTooltip();
});
