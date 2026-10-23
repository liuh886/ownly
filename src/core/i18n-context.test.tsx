// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider, useI18n } from './i18n-context';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
function Probe() {
  const { language, currency, setLanguage, setCurrency } = useI18n();
  return <>
    <output>{language}:{currency}</output>
    <button id="language" onClick={() => setLanguage('en')}>English</button>
    <button id="currency" onClick={() => setCurrency('JPY')}>JPY</button>
  </>;
}
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['zh-CN']);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
async function mount() { await act(async () => root.render(<I18nProvider><Probe /></I18nProvider>)); }
async function click(id: string) { await act(async () => (host.querySelector(`#${id}`) as HTMLButtonElement).click()); }
it('derives first-record currency from the detected language instead of the server English fallback', async () => {
  await mount();
  expect(host.querySelector('output')?.textContent).toBe('zh:CNY');
  await click('language');
  expect(host.querySelector('output')?.textContent).toBe('en:USD');
});
it('keeps an explicit currency preference across language changes and reloads', async () => {
  await mount(); await click('currency'); await click('language');
  expect(host.querySelector('output')?.textContent).toBe('en:JPY');
  expect(localStorage.getItem('ownly_currency')).toBe('JPY');
  await act(async () => root.unmount()); root = createRoot(host); await mount();
  expect(host.querySelector('output')?.textContent).toBe('en:JPY');
});
