# Ownly - UI Refinement Spec

## Core Objective

Converge the UI from decorative cards into a professional, dense personal ledger. The reference direction is closer to operational tools such as Linear and finance dashboards such as Monarch Money: clear hierarchy, low visual noise, and fast scanning.

## Design Rules

### Flat And Compact

- Use `rounded-xl` for major surfaces.
- Use `rounded-lg` or `rounded-md` for internal controls.
- Avoid `rounded-3xl`, heavy shadows, and decorative card walls.
- Prefer `border border-stone-200` and `shadow-sm` for default surfaces.
- Use hover border changes before adding heavier shadows.

### Typography

- Use `font-mono` for money, counts, and key numeric values.
- Prefer `font-semibold` for headings and `font-medium` for labels.
- Avoid excessive `font-black`, `tracking-widest`, and uppercase text.
- Keep Chinese labels as the primary UI language.

### Layout

- Object lists should use single-column horizontal rows.
- Physical objects, recurring costs, and one-time experiences should share the same row grammar.
- Keep primary actions visible and move low-frequency or destructive actions into a secondary menu.
- Desktop layouts should use the wider workspace container; mobile layouts should remain single-column and readable.

### Interaction

- Every icon-only button must keep `aria-label` and `title`.
- Destructive actions should require confirmation or an explicit prompt.
- Filters and dashboard bars should be clickable when they represent a navigable data slice.

## Design Tokens (2026-09-18)

The web app now ships a semantic ramp in `src/app/globals.css` (`--ds-*` → Tailwind `@theme`):

| Utility family | Use for | Light value |
|---|---|---|
| `bg-surface` / `bg-surface-subtle` / `bg-surface-muted` / `bg-surface-sunken` | Cards, page, hovers, chips | `#ffffff` / `#fafaf9` / `#f5f5f4` / `#e7e5e4` |
| `border-line` / `border-line-strong` | Dividers, card borders, inputs | `#e7e5e4` / `#d6d3d1` |
| `text-ink` / `text-ink-secondary` / `text-ink-muted` / `text-ink-faint` | Primary, labels, muted body, decorative chrome | `#1c1917` / `#57534e` / `#78716c` / `#a8a29e` |
| `bg-primary` / `hover:bg-primary-hover` / `text-on-primary` | Primary action buttons | `#0c0a09` / `#292524` / `#fafaf9` |

Rules:

- New code uses these utilities (or the `src/lib/ui-constants.ts` constants) instead of raw `stone-*` for surfaces, borders, and text. Tokens resolve through `prefers-color-scheme`, so no `dark:` variants or class overrides are needed.
- `text-ink-faint` is for decorative chrome only; readable text uses `text-ink-muted` or stronger (WCAG AA 4.5:1).
- Opacity modifiers (`bg-surface/70`) are dropped by Tailwind on `var()`-based theme colors. Use a small purpose-named CSS class with `color-mix` instead (see `.ownly-bottom-nav`).
- Entrance motion uses the `ownly-fade-in` / `ownly-pop-in` / `ownly-drop-in` classes (reduced-motion aware). The legacy `animate-in`/`fade-in`/`zoom-in-95` strings were dead classes and must not be reintroduced.
- UI chrome icons (close, more, search-clear, etc.) use `lucide-react`; emoji stay reserved for content semantics (place kinds, travel flavor).

## Dialog Contract (2026-09-18)

- Form dialogs use `src/components/common/Sheet.tsx` (bottom sheet <sm, centered ≥sm).
- Any hand-rolled overlay must call `useDialogA11y` (`src/components/common/useDialogA11y.ts`) for Escape, Tab trap, focus restore, scroll lock, and initial focus.
- Panels carry `role="dialog"` + `aria-modal="true"` + `aria-labelledby`/`aria-label`; icon-only controls keep `aria-label` + `title`.
- The app shell exposes a skip link (`#ownly-main-content`); `/c`, `/trip`, and `error.tsx` render inside `<main>`.

## Performance Budget (2026-09-18)

`scripts/validate-bundle-size.mjs` (wired into `validate:pages`) enforces per-route gzip budgets from `scripts/bundle-budgets.json`. Current budgets: `/` 228 KB, `/app/` 365 KB, `/c/` 305 KB, `/trip/` 250 KB JS (+30 KB CSS each). Raise a budget only in the same PR that earns it, with a reviewed reason.

