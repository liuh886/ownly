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
