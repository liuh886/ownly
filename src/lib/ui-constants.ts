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

/** Standard button (primary) — 44px target + press feedback */
export const BUTTON_CLASS =
  'inline-flex min-h-11 touch-manipulation items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition duration-150 active:scale-[0.98] hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-line-strong disabled:cursor-not-allowed disabled:opacity-50';

/** Secondary button */
export const BUTTON_SECONDARY_CLASS =
  'inline-flex min-h-11 touch-manipulation items-center justify-center rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-secondary shadow-sm transition duration-150 active:scale-[0.98] hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-line disabled:cursor-not-allowed disabled:opacity-50';

/** Danger button */
export const BUTTON_DANGER_CLASS =
  'inline-flex min-h-11 touch-manipulation items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition duration-150 active:scale-[0.98] hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600/50 disabled:cursor-not-allowed disabled:opacity-50';

/** Standard small tag/chip */
export const CHIP_CLASS =
  'inline-flex items-center rounded-md bg-surface-muted px-2 py-1 text-[11px] font-medium text-ink-secondary transition';

/** Standard section title */
export const SECTION_TITLE_CLASS =
  'text-sm font-semibold tracking-tight text-ink';

/** Standard muted text (for descriptions/details) */
export const MUTED_TEXT_CLASS =
  'text-xs text-ink-muted';

/** Standard number display (monospace, tracking-tight) */
export const NUMBER_CLASS =
  'font-mono text-xl font-semibold tracking-tight text-ink';
