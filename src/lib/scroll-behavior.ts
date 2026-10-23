/** Explicit smooth scrolling must respect the same preference as CSS/motion. */
export function getScrollBehavior(): ScrollBehavior {
  return typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';
}
