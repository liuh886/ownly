/**
 * Shared UI class constants for consistent styling across components.
 */

/** Standard card container */
export const CARD_CLASS = 'rounded-xl border border-stone-200 bg-white p-5 shadow-sm';

/** Standard form input/select/textarea — 16px base prevents iOS auto-zoom */
export const FIELD_CLASS =
  'min-h-11 w-full touch-manipulation rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-base text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200/50 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400 sm:text-sm';

/** Standard button (primary) — 44px target + press feedback */
export const BUTTON_CLASS =
  'inline-flex min-h-11 touch-manipulation items-center justify-center rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition duration-150 active:scale-[0.98] hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-900/50 disabled:cursor-not-allowed disabled:opacity-50';

/** Secondary button */
export const BUTTON_SECONDARY_CLASS =
  'inline-flex min-h-11 touch-manipulation items-center justify-center rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition duration-150 active:scale-[0.98] hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-200/50 disabled:cursor-not-allowed disabled:opacity-50';

/** Danger button */
export const BUTTON_DANGER_CLASS =
  'inline-flex min-h-11 touch-manipulation items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition duration-150 active:scale-[0.98] hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600/50 disabled:cursor-not-allowed disabled:opacity-50';

/** Standard small tag/chip */
export const CHIP_CLASS =
  'inline-flex items-center rounded-md bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-600 transition';

/** Standard section title */
export const SECTION_TITLE_CLASS =
  'text-sm font-semibold tracking-tight text-stone-950';

/** Standard muted text (for descriptions/details) */
export const MUTED_TEXT_CLASS =
  'text-xs text-stone-500';

/** Standard number display (monospace, tracking-tight) */
export const NUMBER_CLASS =
  'font-mono text-xl font-semibold tracking-tight text-stone-950';
