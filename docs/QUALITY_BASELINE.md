# Ownly Quality Baseline

**Current Version:** 1.0.4

## Validation & Test Results
- **Overall Validation (`npm run validate`):** ❌ Failed (due to Obsidian check below)
- **Linting (`npm run lint`):** ⚠️ Passed with 6 warnings (treated as pass, does not exit with 1)
- **Web runtime (`npm run build`):** ✅ Passed
- **Obsidian package (`npm run validate:obsidian`):** ❌ Failed
  - *Error details:* `src/obsidian/vaultRepository.ts(109,11): error TS2531: Object is possibly 'null'.`
- **Unit Tests (`npm run test`):** ⚠️ N/A
  - *Error details:* unit test suite not established yet; vitest exits because no test files are present.
- **E2E Smoke Tests (`npm run test:e2e`):** ❌ Failed
  - `smoke:web` passed.
  - `smoke:site` failed. It expected the heading "Object console" but did not find it (found "Objects" instead).

## Smoke Test Checklist (Coverage Analysis)
This checklist outlines the critical paths for smoke testing based on the requirements:

| Scenario | Covered by current smoke test? | Status/Notes |
| --- | --- | --- |
| 首次打开 demo mode | ✅ Yes | Checks for "Demo mode" and basic layout |
| 连接 vault | ⚠️ Partial | Only checks for the "Connect Vault" button existence, not actual connection flow |
| auto-seed demo data | ❌ No | Not covered |
| 新增 physical object | ❌ No | Not covered |
| 新增 recurring cost | ❌ No | Not covered |
| 新增 one-time experience | ❌ No | Not covered |
| 新增 snapshot | ❌ No | Not covered |
| 新增 review | ❌ No | Not covered |
| archive / restore | ❌ No | Not covered |
| doctor run | ⚠️ Partial | Only checks for the "Run Doctor" button existence |
| 中英文切换 | ✅ Yes | Validates language toggle and label updates |
| currency 切换 | ❌ No | Not covered |
| dark mode 基础检查 | ❌ No | Not covered |

## Risk List & Known Issues

### Blocker
- `npm run test:e2e` fails due to a missing heading (`Object console`) in the UI, blocking full automated verification of basic site navigation.
- `npm run validate:obsidian` fails due to a TypeScript strict null check error in `vaultRepository.ts`.

### Major
- Unit test suite not established yet; vitest exits because no test files are present.

### Minor
- 6 ESLint warnings across the app (React Hooks exhaustive-deps and unused vars).

### Polish
- The smoke test suite currently lacks coverage for almost all critical user workflows (creating objects, snapshots, reviews, archive/restore, dark mode).
