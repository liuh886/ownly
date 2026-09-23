/**
 * Shared UI class constants for consistent styling across components.
 *
 * These follow the semantic ramp defined in `globals.css` (`--ds-*` → `bg-surface`,
 * `border-line`, `text-ink`, `bg-primary`), which adapts to dark mode without
 * `dark:` variants or class overrides. Prefer these constants over raw stone-*
 * utilities in new code.
 */

/** Standard card container */
export const CARD_CLASS = 'rounded-xl border border-line bg-surface p-5 shadow-sm';

/** Standard form input/select/textarea — 16px base prevents iOS auto-zoom */
export const FIELD_CLASS =
  'min-h-11 w-full touch-manipulation rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none transition placeholder:text-ink-muted focus:border-line-strong focus:ring-2 focus:ring-line disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-faint sm:text-sm';

/** Standard section title */
export const SECTION_TITLE_CLASS =
  'text-sm font-semibold tracking-tight text-ink';

/** Standard muted text (for descriptions/details) */
export const MUTED_TEXT_CLASS =
  'text-xs text-ink-muted';
