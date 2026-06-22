# Release Checklist

Follow these steps exactly when cutting a new release for the Obsidian Community Plugins repository.

## 1. Version Bump
Ensure the version numbers are synchronized across these files:
- `package.json`
- `manifest.json`
- `versions.json` (add the new version and its minimum required Obsidian version)

## 2. Changelog Update
- Update `CHANGELOG.md` with the new version number, date, and a bulleted list of user-facing changes (features, fixes, UI polish).

## 3. Build Plugin
Generate the production bundle for Obsidian:
```bash
npm run build:obsidian
```

## 4. Obsidian Validation
Run the strict validation checks to ensure compliance with Obsidian's API rules. See the [Obsidian Reviewer Compliance Checklist](./OBSIDIAN_REVIEWER_CHECKLIST.md) for strict pre-PR rules.
```bash
npm run validate:obsidian
```

## 5. Smoke Test
Ensure core functionality works flawlessly:
```bash
npm run test:e2e
```

## 6. Manual Obsidian Install Check
1. Copy the generated `main.js`, `manifest.json`, and `styles.css` from the `dist/obsidian/ownly` folder to a test Obsidian vault (`.obsidian/plugins/ownly`).
2. Open Obsidian, enable the plugin, and verify the app opens and renders correctly.
3. Test a quick entry to ensure write permissions and reactivity work.

## 7. GitHub Release
1. Create a new tag matching the version (e.g., `1.0.1`).
2. Draft a new GitHub Release for that tag.
3. Attach the compiled `main.js`, `manifest.json`, and `styles.css` as release assets.
4. Publish the release.
