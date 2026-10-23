// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { getScrollBehavior } from './scroll-behavior';
afterEach(() => vi.unstubAllGlobals());
it('uses immediate scrolling when the browser requests reduced motion', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
  expect(getScrollBehavior()).toBe('auto');
  expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
});
it('retains smooth scrolling otherwise, including older browsers without matchMedia', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  expect(getScrollBehavior()).toBe('smooth');
  vi.stubGlobal('matchMedia', undefined); expect(getScrollBehavior()).toBe('smooth');
});
