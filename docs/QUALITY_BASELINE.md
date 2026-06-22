# Ownly Quality Baseline

**Current Version:** 1.0.4

## Validation & Test Results
- **Overall Validation (`npm run validate`):** ✅ Passed
- **Linting (`npm run lint`):** ✅ Passed (Warnings treated as cleanup targets)
- **Web runtime (`npm run build`):** ✅ Passed
- **Obsidian package (`npm run validate:obsidian`):** ✅ Passed
- **Unit Tests (`npm run test`):** ✅ Passed (Basic schema checks established)
- **E2E Smoke Tests (`npm run test:e2e`):** ✅ Passed

**Note on Test Coverage:**
Known coverage gaps: create/update/archive/restore workflows need deeper automated coverage.

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
- None currently.

### Major
- Core data mutation workflows (create/update/archive/restore) are not yet deeply guarded. UI navigation and build quality are guarded, but these core behaviors lack behavior-level E2E coverage.
- The CLI (`scripts/wyqd-cli.ts`) still contains `@ts-nocheck`. It needs strict typing (Phase 7A) since it's the core read/write entry point for agents.

### Minor
- 2-4 ESLint warnings across the app (React Hooks exhaustive-deps and unused vars).

### Polish
- The smoke test suite needs to be expanded into full behavioral E2E tests for the core workflows.
