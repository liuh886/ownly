# Ownly Quality Baseline

**Current Version:** 1.1.0

## Validation & Test Results

- **Overall Validation (`npm run validate`):** ✅ Passed
- **Linting (`npm run lint`):** ✅ Passed (warnings remain cleanup targets)
- **Web runtime (`npm run build`):** ✅ Passed
- **Obsidian package (`npm run validate:obsidian`):** ✅ Passed
- **Unit Tests (`npm run test`):** ✅ Passed
- **Repository mutation contract (`npm run test:e2e:data`):** ✅ Passed
- **Browser smoke tests (`npm run test:e2e`):** ✅ Passed

## Core Data Mutation Coverage

`src/services/MarkdownEntityRepository.contract.test.ts` exercises the Web/PWA Markdown repository against deterministic persisted storage rather than UI-button mocks.

| Workflow | Repository contract coverage | Notes |
|---|---:|---|
| Create physical object | ✅ | Persists and reparses YAML frontmatter and Markdown body |
| Create recurring cost | ✅ | Uses the same repository and serializer as production Web/PWA |
| Create one-time experience | ✅ | Uses the same repository and serializer as production Web/PWA |
| Same-day filename collision | ✅ | New records receive a collision-safe filename instead of overwriting |
| Update and reload | ✅ | Reloaded through a fresh repository instance |
| Archive object | ✅ | Archive copy is written before active source deletion |
| Restore object | ✅ | Preserves identity/body and handles active filename collisions |
| Permanently delete archive | ✅ | Verified against persisted archive storage |
| Snapshot update/archive/restore | ✅ | Full persisted round trip |
| Review update/archive/restore | ✅ | Preserves target link and review fields |
| Object experience log read | ✅ | Reparsed through the normal list path |
| Malformed Markdown isolation | ✅ | Invalid files are skipped without hiding valid records |
| Failed archive write | ✅ | Failure propagates and active source remains present |
| Direct Ownly data root | ✅ | `Objects/`, `Reviews/`, etc. |
| Nested `Ownly/` root | ✅ | `Ownly/Objects`, `Ownly/Reviews`, etc. |

The repository contract is part of `npm run validate`, so these behaviors now block CI regressions.

## Browser and Runtime Coverage

| Scenario | Current coverage | Status/Notes |
|---|---:|---|
| First-use local-data chooser | ⚠️ Partial | Static/build coverage exists; browser permission interaction is not behavior-tested |
| Create/open local directory | ⚠️ Partial | Directory-layout rules are unit-tested; native picker permission flow is not automated |
| New object through browser UI | ❌ | Repository write is covered, but full composer-to-filesystem browser flow remains |
| Archive/restore through browser UI | ❌ | Repository behavior is covered; UI interaction remains |
| Obsidian mutation contract | ⚠️ Partial | Package/type validation passes; shared adapter contract remains part of runtime-parity work |
| Doctor duplicate-ID reporting | ⚠️ Partial | Existing Doctor behavior is not yet included in this repository contract suite |
| Language switching | ✅ | Existing smoke coverage |
| Currency switching | ❌ | Not yet behavior-tested |

## Risk List & Known Issues

### Blocker

- None currently.

### Major

- Browser-level File System Access API behavior still needs a controlled test double covering permission loss, picker cancellation, write failure, and reconnect.
- The Obsidian adapter must run the same mutation contract or an equivalent shared-adapter suite before Web/PWA/Obsidian parity can be claimed.
- Duplicate-ID detection and schema-integrity diagnostics should be asserted through the Doctor/data-health contract.
- The CLI (`scripts/wyqd-cli.ts`) still contains `@ts-nocheck`; strict typing is tracked by #33.

### Minor

- Remaining ESLint warnings should continue to be treated as cleanup targets.

### Next Quality Gate

Issue #32 should continue with adapter/browser-level tests after this repository foundation is merged. Issue #37 will use this suite as the starting point for cross-runtime parity rather than duplicating business rules.
