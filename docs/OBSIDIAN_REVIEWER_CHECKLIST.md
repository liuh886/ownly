# Obsidian Reviewer Compliance Checklist

Before opening any PR for the Obsidian plugin runtime, run an Obsidian reviewer compliance pass.

## Blocking rules

1. Do not disable `obsidianmd/no-unsupported-api`.
   - If a newer Obsidian API is required, raise `manifest.minAppVersion`.
   - Update `versions.json` accordingly.
   - Do not hide unsupported API usage with eslint comments.

2. Do not add bare directive comments.
   - No bare `eslint-disable`.
   - No bare `@ts-ignore`.
   - No bare `@ts-expect-error`.
   - No bare `/* global */`.
   - If unavoidable, the directive must:
     - have a precise explanation,
     - be scoped to the smallest possible line/rule,
     - be re-enabled immediately where applicable.

3. Use Obsidian-safe globals in UI/runtime code.
   - Prefer `activeDocument` / `activeWindow` where popout compatibility matters.
   - Avoid direct `document`, `window`, or `globalThis` usage in Obsidian UI code unless clearly safe.

4. Use Obsidian Setting APIs for settings UI.
   - Prefer `new Setting(...)`, `.setName(...)`, `.setDesc(...)`, `.setHeading()`, `.addText(...)`, `.addDropdown(...)`, `.addToggle(...)`, `.addButton(...)`.
   - Avoid raw HTML headings and uncontrolled custom settings markup unless necessary.

5. Keep versions synchronized.
   - `package.json`
   - `manifest.json`
   - `src/version.ts` if present
   - `versions.json`
   - README badges or release text if they mention a concrete version.

6. Declare every imported dependency.
   - If a file imports a package directly, that package must be explicitly listed in `package.json`.
   - Do not rely on transitive dependencies.

7. Treat reviewer findings by severity.
   - Reviewer Errors are blockers.
   - Reviewer Warnings are cleanup targets and should be fixed when practical.
   - Reviewer Recommendations are backlog unless the migration is small and low-risk.

8. Run validation before marking a PR ready.
   - `npm run validate`
   - `npm run validate:obsidian`
   - `npm run lint:obsidian`
   - `npm run test`
   - `npm run test:e2e`

9. Keep reviewer-compliance PRs narrow.
   - Do not mix product behavior changes with reviewer compliance fixes.
   - UI or behavior changes should be in a separate PR unless required to fix reviewer errors.

## Required PR summary section

Every PR touching `src/obsidian/**`, `manifest.json`, `versions.json`, build scripts, or package dependencies must include:

- Obsidian reviewer compliance checked: yes/no
- `manifest.minAppVersion` changed: yes/no
- `versions.json` changed: yes/no
- New dependencies added: yes/no
- Directive comments added: yes/no
- Product behavior changed: yes/no
