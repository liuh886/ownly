import { Heart, MoreHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useI18n } from '@/core/i18n-context';
import { useOwnlyWorkspace } from '@/core/ownly-workspace-context';
import { getOwnlyLocalDataCopy } from '@/core/local-data-copy';
import { getWYQDRuntimeCapabilities } from '@/core/runtime-capabilities';
import { WYQD_CURRENCIES, WYQD_CURRENCY_LABELS } from '@/lib/format';
import { PwaInstallButton } from '@/components/pwa/PwaInstallButton';
import type { AppTab } from './BottomNav';
import type { WYQDTranslationKey } from '@/core/i18n';
import './account-integration.css';

const tabHeadingKeys: Record<Exclude<AppTab, 'planner'>, { title: WYQDTranslationKey; description: WYQDTranslationKey }> = {
  home: { title: 'tabHome', description: 'tabHomeDesc' },
  objects: { title: 'tabObjects', description: 'tabObjectsDesc' },
  accounts: { title: 'tabAccounts', description: 'tabAccountsDesc' },
  reviews: { title: 'tabReviews', description: 'tabReviewsDesc' },
};

export function AppHeader({
  activeTab,
  objectCount,
  snapshotCount,
  onConnectVault,
  onDisconnectFolder,
  onOpenAgentGuide,
}: {
  activeTab: AppTab;
  objectCount: number;
  snapshotCount: number;
  onConnectVault: () => void;
  onDisconnectFolder: () => void;
  onOpenAgentGuide: () => void;
}) {
  const { t, language, setLanguage, currency, setCurrency } = useI18n();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [connectionMenuOpen, setConnectionMenuOpen] = useState(false);
  const overflowId = useId();
  const connectionId = useId();
  const overflowRoot = useRef<HTMLDivElement>(null);
  const connectionRoot = useRef<HTMLDivElement>(null);
  const overflowTrigger = useRef<HTMLButtonElement>(null);
  const connectionTrigger = useRef<HTMLButtonElement>(null);
  const overflowPanel = useRef<HTMLDivElement>(null);
  const connectionPanel = useRef<HTMLDivElement>(null);
  const openAtEnd = useRef(false);
  const connectionPointerFocus = useRef(false);
  const [restoreUnavailableFocus, setRestoreUnavailableFocus] = useState(false);
  const { runtimeTarget, mode, isLoading, membership, openLicenseModal } = useOwnlyWorkspace();
  const runtimeCapabilities = getWYQDRuntimeCapabilities(runtimeTarget);
  const usesBrowserLocalData = runtimeCapabilities.dataRuntime === 'browser';
  const localDataCopy = getOwnlyLocalDataCopy(language);
  // The header pill is the always-visible half of the mode answer, so it must
  // say which of the three states it is in rather than collapsing the two
  // folderless states into one "demo" label.
  const connectionLabel = isLoading
    ? language === 'zh' ? '正在连接…' : 'Connecting…'
    : mode === 'connected'
      ? usesBrowserLocalData ? localDataCopy.connected : t('vaultConnected')
      : mode === 'demo'
        ? t('demoMode')
        : usesBrowserLocalData ? localDataCopy.disconnected : t('demoMode');
  const isSettled = mode === 'connected' && !isLoading;
  // The pill is the single home for the connection state. When a folder is
  // attached there are two things worth doing to it, so the pill opens a menu
  // instead of acting on click — a caret that does not open anything is a lie.
  // Obsidian always holds the Vault open: nothing to change, nothing to detach,
  // so it keeps the single-action button.
  const hasConnectionMenu = isSettled && usesBrowserLocalData;
  const [connectionAvailable, setConnectionAvailable] = useState(hasConnectionMenu);
  if (connectionAvailable !== hasConnectionMenu) {
    setConnectionAvailable(hasConnectionMenu);
    setRestoreUnavailableFocus(!hasConnectionMenu && connectionMenuOpen);
    if (!hasConnectionMenu) {
      setConnectionMenuOpen(false);
    }
  }
  const connectionTitle = mode === 'connected' && !isLoading
    ? language === 'zh'
      ? hasConnectionMenu
        ? '已连接。点击可更换数据目录或断开连接。'
        : '已连接。点击可重新连接。'
      : hasConnectionMenu
        ? 'Connected. Click to change or disconnect the data folder.'
        : 'Connected. Click to reconnect.'
    : mode === 'demo'
      ? language === 'zh'
        ? '演示模式：正在浏览仅存在于内存中的示例数据，不会保存任何内容。'
        : 'Demo mode: browsing example data held in memory. Nothing is saved.'
      : language === 'zh'
        ? '尚未连接数据目录。'
        : 'No data folder connected yet.';
  const heading = activeTab === 'planner'
    ? {
        title: 'Planner',
        description: language === 'zh'
          ? '把 Google Maps 研究候选填入可执行的日程骨架'
          : 'Turn Google Maps research into an executable day plan',
      }
    : {
        title: t(tabHeadingKeys[activeTab].title),
        description: t(tabHeadingKeys[activeTab].description),
      };

  const closeOverflow = () => { setOverflowOpen(false); overflowTrigger.current?.focus(); };
  const closeConnectionMenu = () => { setConnectionMenuOpen(false); connectionTrigger.current?.focus(); };

  const menuItems = () => Array.from(connectionPanel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
  function connectionKeys(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = menuItems();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    items[next]?.focus();
  }

  useEffect(() => {
    if (restoreUnavailableFocus) {
      document.getElementById('ownly-view-title')?.focus();
    }
  }, [restoreUnavailableFocus]);

  useEffect(() => {
    if (connectionMenuOpen) {
      const items = menuItems();
      (openAtEnd.current ? items.at(-1) : items[0])?.focus();
      openAtEnd.current = false;
    }
    if (overflowOpen) {
      const controls = Array.from(overflowPanel.current?.querySelectorAll<HTMLElement>('a, button, select') ?? []);
      controls.find((control) => getComputedStyle(control).display !== 'none')?.focus();
    }
  }, [overflowOpen, connectionMenuOpen]);

  useEffect(() => {
    if (!overflowOpen && !connectionMenuOpen) return;
    const dismissOutside = (event: Event) => {
      if (!(event.target instanceof Node)) return;
      if (connectionMenuOpen && event.type === 'focusin' && event.target === connectionTrigger.current && !connectionPointerFocus.current) setConnectionMenuOpen(false);
      if (overflowOpen && !overflowRoot.current?.contains(event.target)) {
        if (event.type === 'pointerdown' && overflowPanel.current?.contains(document.activeElement)) overflowTrigger.current?.focus({ preventScroll: true });
        setOverflowOpen(false);
      }
      if (connectionMenuOpen && !connectionRoot.current?.contains(event.target)) {
        if (event.type === 'pointerdown' && connectionPanel.current?.contains(document.activeElement)) connectionTrigger.current?.focus({ preventScroll: true });
        setConnectionMenuOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      if (overflowOpen) { setOverflowOpen(false); overflowTrigger.current?.focus(); }
      if (connectionMenuOpen) { setConnectionMenuOpen(false); connectionTrigger.current?.focus(); }
    };
    const releasePointerFocus = () => { connectionPointerFocus.current = false; };
    document.addEventListener('pointerup', releasePointerFocus);
    document.addEventListener('pointercancel', releasePointerFocus);
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerup', releasePointerFocus);
      document.removeEventListener('pointercancel', releasePointerFocus);
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
      document.removeEventListener('keydown', escape);
    };
  }, [overflowOpen, connectionMenuOpen]);

  useEffect(() => {
    if (!overflowOpen || typeof window.matchMedia !== 'function') return;
    const desktop = window.matchMedia('(min-width: 640px)');
    const dismissHiddenPanel = () => {
      if (!desktop.matches) return;
      if (overflowRoot.current?.contains(document.activeElement)) document.getElementById('ownly-view-title')?.focus();
      setOverflowOpen(false);
    };
    desktop.addEventListener('change', dismissHiddenPanel);
    return () => desktop.removeEventListener('change', dismissHiddenPanel);
  }, [overflowOpen]);

  return (
    <header className="mb-6 rounded-2xl border border-line bg-surface shadow-sm">
      {/* ── L1 品牌 / 身份 / 偏好：低频、幽灵样式，不抢视觉 ── */}
      <div className="flex h-10 items-center gap-2 px-4 sm:px-5">
        <span className="text-sm font-extrabold tracking-tight text-ink">Ownly</span>
        {membership.isPro ? (
          <button
            type="button"
            onClick={openLicenseModal}
            className="ownly-hit-expand rounded-full bg-primary px-1.5 py-px text-[10px] font-bold text-on-primary transition hover:bg-primary-hover"
          >
            PRO
          </button>
        ) : null}
        <a
          href="https://liuh886.gumroad.com/l/ownly"
          target="_blank"
          rel="noopener noreferrer"
          className="ownly-hit-expand hidden shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium text-ink-muted transition hover:bg-rose-50 hover:text-rose-600 min-[480px]:inline"
          title={t('sponsor')}
        >
          <Heart size={13} aria-hidden="true" /> {t('sponsor')}
        </a>
        <div className="ml-auto flex items-center gap-1">
          <div className="ownly-account-slot ownly-account-slot--bare" data-account-slot aria-label={t('membership')} />
          <span className="mx-1 hidden h-3 w-px bg-surface-sunken sm:block" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
            className="ownly-hit-expand hidden min-h-9 min-w-9 touch-manipulation rounded-md px-1.5 py-1 text-[11px] font-medium text-ink-muted transition duration-150 active:scale-95 hover:bg-surface-muted hover:text-ink-secondary sm:block"
          >
            {language === 'zh' ? 'EN' : '中文'}
          </button>
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value as typeof currency)}
            aria-label={t('defaultRecordCurrency')}
            title={t('defaultRecordCurrency')}
            className="hidden min-h-9 cursor-pointer touch-manipulation rounded-md bg-transparent px-1 py-1 text-base font-medium text-ink-muted outline-none transition hover:bg-surface-muted hover:text-ink-secondary sm:block sm:text-[11px]"
          >
            {WYQD_CURRENCIES.map((currentCurrency) => (
              <option key={currentCurrency} value={currentCurrency}>
                {WYQD_CURRENCY_LABELS[currentCurrency]}
              </option>
            ))}
          </select>
          <div ref={overflowRoot} className="relative sm:hidden">
            <button
              type="button"
              ref={overflowTrigger}
              onClick={() => { setConnectionMenuOpen(false); setOverflowOpen((open) => !open); }}
              aria-expanded={overflowOpen}
              aria-controls={overflowId}
              aria-label={language === 'zh' ? '更多选项' : 'More options'}
              className="ownly-hit-expand flex min-h-9 min-w-9 touch-manipulation items-center justify-center rounded-md px-1.5 py-1 text-sm font-bold text-ink-muted transition duration-150 active:scale-95 hover:bg-surface-muted hover:text-ink-secondary"
            >
              <MoreHorizontal size={18} aria-hidden="true" />
            </button>
            {overflowOpen ? (
              <div
                ref={overflowPanel}
                id={overflowId}
                role="region"
                aria-label={language === 'zh' ? '更多选项' : 'More options'}
                className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
              >
                <a
                  href="https://liuh886.gumroad.com/l/ownly"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={closeOverflow}
                  className="flex min-h-11 touch-manipulation items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-muted min-[480px]:hidden"
                >
                  <Heart size={13} aria-hidden="true" /> {t('sponsor')}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setLanguage(language === 'zh' ? 'en' : 'zh');
                    closeOverflow();
                  }}
                  className="flex min-h-11 w-full touch-manipulation items-center rounded-lg px-3 py-1.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-muted"
                >
                  {language === 'zh' ? 'EN' : '中文'}
                </button>
                <label className="flex min-h-11 touch-manipulation items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-secondary">
                  <span>{t('defaultRecordCurrency')}</span>
                  <select
                    value={currency}
                    onChange={(event) => {
                      setCurrency(event.target.value as typeof currency);
                      closeOverflow();
                    }}
                    aria-label={t('defaultRecordCurrency')}
                    title={t('defaultRecordCurrency')}
                    className="cursor-pointer rounded-md bg-surface-muted px-1.5 py-1 text-base font-medium text-ink-secondary outline-none"
                  >
                    {WYQD_CURRENCIES.map((currentCurrency) => (
                      <option key={currentCurrency} value={currentCurrency}>
                        {WYQD_CURRENCY_LABELS[currentCurrency]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── L2 页面上下文 + 核心工作区操作：唯一视觉重心 ── */}
      <div className="flex flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h1 id="ownly-view-title" tabIndex={-1} className="text-lg font-semibold tracking-tight text-ink sm:text-xl">
            {heading.title}
          </h1>
          <p className="mt-0.5 text-xs text-ink-muted">{heading.description}</p>
          <p className="mt-1 text-[11px] tabular-nums text-ink-muted">
            {objectCount} {t('objects')} · {snapshotCount} {t('snapshots')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {runtimeCapabilities.canPromptForLocalData ? (
            <div ref={connectionRoot} className="relative">
              <button
                type="button"
                ref={connectionTrigger}
                onPointerDown={() => { connectionPointerFocus.current = true; }}
                onPointerUp={() => { connectionPointerFocus.current = false; }}
                onPointerCancel={() => { connectionPointerFocus.current = false; }}
                onKeyDown={(event) => {
                  if (!hasConnectionMenu || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
                  event.preventDefault();
                  openAtEnd.current = event.key === 'ArrowUp';
                  if (connectionMenuOpen) {
                    const items = menuItems();
                    (openAtEnd.current ? items.at(-1) : items[0])?.focus();
                    openAtEnd.current = false;
                    return;
                  }
                  setOverflowOpen(false);
                  setConnectionMenuOpen(true);
                }}
                onClick={() => {
                  if (!hasConnectionMenu) {
                    onConnectVault();
                    return;
                  }
                  setOverflowOpen(false);
                  setConnectionMenuOpen((open) => !open);
                }}
                disabled={isLoading}
                aria-expanded={hasConnectionMenu ? connectionMenuOpen : undefined}
                aria-controls={hasConnectionMenu ? connectionId : undefined}
                aria-haspopup={hasConnectionMenu ? 'menu' : undefined}
                title={connectionTitle}
                className={`ownly-hit-expand inline-flex touch-manipulation items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-muted disabled:cursor-wait ${
                  isSettled
                    ? 'bg-surface-muted text-ink-secondary ring-1 ring-line hover:bg-surface-sunken hover:text-ink'
                    : mode === 'demo'
                      ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200'
                      : 'bg-primary text-on-primary shadow-sm hover:bg-primary-hover disabled:hover:bg-primary'
                }`}
              >
                {isSettled ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" aria-hidden="true" />
                ) : mode === 'demo' ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                ) : null}
                {connectionLabel}
                {hasConnectionMenu ? <span aria-hidden="true">▾</span> : null}
              </button>
              {hasConnectionMenu && connectionMenuOpen ? (
                <>
                  <div
                    ref={connectionPanel}
                    id={connectionId}
                    onKeyDown={connectionKeys}
                    role="menu"
                    aria-label={localDataCopy.connected}
                    className="absolute right-0 top-full z-50 mt-1 w-40 rounded-xl border border-line bg-surface p-1 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      onClick={() => {
                        closeConnectionMenu();
                        onConnectVault();
                      }}
                      className="flex min-h-11 w-full touch-manipulation items-center rounded-lg px-3 py-1.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-muted hover:text-ink"
                    >
                      {localDataCopy.changeFolder}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      onClick={() => {
                        closeConnectionMenu();
                        onDisconnectFolder();
                      }}
                      className="flex min-h-11 w-full touch-manipulation items-center rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      {localDataCopy.disconnect}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5 text-xs font-medium text-ink-muted ring-1 ring-line">
              <span
                className={`h-1.5 w-1.5 rounded-full ${mode === 'connected' ? 'bg-emerald-300' : 'bg-stone-400'}`}
                aria-hidden="true"
              />
              {connectionLabel}
            </span>
          )}
          {runtimeCapabilities.canPromptForLocalData && runtimeCapabilities.canInstallPwa ? (
            <div
              role="group"
              aria-label={language === 'zh' ? 'Ownly 外部能力' : 'Ownly external tools'}
              className="inline-flex overflow-hidden rounded-full text-ink-muted ring-1 ring-line"
            >
              <button
                type="button"
                onClick={onOpenAgentGuide}
                title="Agent / MCP"
                className="ownly-hit-expand border-r border-line px-2.5 py-1.5 text-xs font-medium transition hover:bg-surface-muted hover:text-ink-secondary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink-muted"
              >
                Agent
              </button>
              <PwaInstallButton variant="segmented" />
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAgentGuide}
              title="Agent / MCP"
              className="ownly-hit-expand rounded-full px-3 py-1.5 text-xs font-medium text-ink-muted ring-1 ring-line transition hover:bg-surface-muted hover:text-ink-secondary"
            >
              Agent
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
