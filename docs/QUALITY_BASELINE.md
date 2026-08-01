# Ownly Quality Baseline

**Current Version:** 1.1.0

## Validation and test results

- **Overall validation (`npm run validate`):** ✅ Passed
- **Strict TypeScript (`tsc --noEmit`):** ✅ Passed
- **Linting (`npm run lint`):** ✅ Passed
- **Terminology contract (`npm run validate:terminology`):** ✅ Passed
- **Web runtime (`npm run build`):** ✅ Passed
- **Obsidian package (`npm run validate:obsidian`):** ✅ Passed
- **Repository mutation contract (`npm run test:e2e:data`):** ✅ Passed
- **Agent CLI process contract (`npm run test:cli`):** ✅ Passed
- **Browser smoke tests (`npm run test:e2e`):** ✅ Passed

## Core data mutation coverage

`src/services/MarkdownEntityRepository.contract.test.ts` exercises the Web/PWA Markdown repository against deterministic persisted storage rather than UI-button mocks.

| Workflow | Repository contract coverage | Notes |
|---|---:|---|
| Create physical object | ✅ | Persists and reparses YAML frontmatter and Markdown body |
| Create recurring cost | ✅ | Uses the production repository and serializer |
| Create one-time experience | ✅ | Uses the production repository and serializer |
| Same-day filename collision | ✅ | Allocates a collision-safe filename instead of overwriting |
| Update and reload | ✅ | Reloaded through a fresh repository instance |
| Archive object | ✅ | Archive copy is written before active source deletion |
| Restore object | ✅ | Preserves identity/body and handles active filename collisions |
| Permanently delete archive | ✅ | Verified against persisted archive storage |
| Snapshot update/archive/restore | ✅ | Full persisted round trip |
| Review update/archive/restore | ✅ | Preserves target link and review fields |
| Object experience log read | ✅ | Reparsed through the normal list path |
| Malformed Markdown isolation | ✅ | Invalid files are isolated without hiding valid records |
| Failed archive write | ✅ | Failure propagates and active source remains present |
| Direct Ownly data root | ✅ | `Objects/`, `Reviews/`, etc. |
| Nested `Ownly/` root | ✅ | `Ownly/Objects`, `Ownly/Reviews`, etc. |

## Agent CLI contract coverage

The monolithic type-suppressed CLI has been replaced by strict modules under `scripts/cli/`. The entrypoint contains no `@ts-nocheck` or broad CLI type suppression.

`scripts/cli/wyqd-cli.process.test.ts` executes the real CLI in child processes against disposable Ownly data locations.

| CLI behavior | Coverage | Notes |
|---|---:|---|
| argv and environment boundaries | ✅ | Typed options with explicit string/boolean/number validation |
| YAML parsing and entity narrowing | ✅ | Parsed as untrusted data, narrowed by entity type, validated by shared schema |
| physical create/get/update | ✅ | stdout JSON and persisted Markdown asserted |
| archive and restore | ✅ | Exit status, archive file, restore facts asserted |
| recurring-cost create | ✅ | Shared Agent row and persisted object type asserted |
| one-time-experience create | ✅ | Same-day filename collision behavior asserted |
| stable JSON errors | ✅ | stderr shape, error code, and non-zero exit asserted |
| summary | ✅ | Deterministic counts asserted |
| Doctor | ✅ | Deterministic valid result asserted |
| atomic write path | ✅ | Temp-file replacement implemented for CLI writes |
| duplicate-ID detection | ✅ | Doctor reports duplicate IDs across supported entity types |
| all documented commands compile strictly | ✅ | Full command router is included in `tsc --noEmit` |

The process suite is part of `npm run validate`, so CLI regressions block CI.

## Browser and runtime coverage

| Scenario | Current coverage | Status/Notes |
|---|---:|---|
| First-use local-data chooser | ⚠️ Partial | Static/build coverage exists; native permission interaction is not behavior-tested |
| Create/open local directory | ⚠️ Partial | Directory-layout rules are unit-tested; native picker permission flow remains |
| New object through browser UI | ❌ | Repository write is covered, but full composer-to-filesystem browser flow remains |
| Archive/restore through browser UI | ❌ | Repository behavior is covered; UI interaction remains |
| Obsidian mutation contract | ⚠️ Partial | Package/type validation passes; shared adapter contract remains part of runtime-parity work |
| Language switching | ✅ | Existing smoke coverage |
| Currency switching | ❌ | Not yet behavior-tested |

## Risk list and known issues

### Blocker

- None currently.

### Major

- Browser-level File System Access API behavior still needs a controlled test double covering permission loss, picker cancellation, write failure, and reconnect.
- The Obsidian adapter must run the same mutation contract or an equivalent shared-adapter suite before Web/PWA/Obsidian parity can be claimed.
- CLI compatibility is protected for representative read/write/error flows, but future command additions must extend the process matrix rather than relying only on compilation.
- Versioned backup, restore preflight, and schema migration remain tracked by #34.

### Minor

- Remaining ESLint warnings should continue to be treated as cleanup targets.

## Next quality gates

- Continue #32 with browser permission and adapter-level behavioral coverage.
- Implement #34 using the repository and CLI safety foundations now in CI.
- Use these shared contracts in #37 instead of duplicating Web/PWA/Obsidian business rules.
