# Todo: Code Health & Architecture Refactoring Execution

## Tasks
- [x] 1. Clean up catch variable naming (`catch (event)` -> `catch (error)`) across React components <!-- id: 1 -->
- [x] 2. Standardize Quick Chips & Risk/Signal classification into domain (`src/domain/planner.ts`) with unit tests <!-- id: 2 -->
- [x] 3. Modularize extension sidepanel helpers into decoupled modules (`src/extension/chips.ts`, `src/extension/dom.ts`, `src/extension/trips.ts`) <!-- id: 3 -->
- [x] 4. Run validation & tests (`validate:fast`, `validate:extension`, `test`) <!-- id: 4 -->
- [x] 5. Record results and update Review section <!-- id: 5 -->

## Review
- Standardized all `catch (event)` instances across React components (`useOwnlyActions.ts`, `DataSafetyButton.tsx`, `WebShell.tsx`) to canonical `catch (error)`.
- Extracted and encapsulated Quick Chips & Risk/Signal classification into a pure domain function (`classifyResearchChip`, `STANDARD_RESEARCH_CHIPS` in `src/domain/planner.ts`) and verified with comprehensive unit tests in `src/domain/planner.test.ts`.
- Modularized extension sidepanel logic, extracted `api.ts`, `i18n.ts`, `utils.ts`, removed temporary scripts and orphaned files, and resolved type strictness warnings.
- Ran `validate:fast`, `validate:extension`, `build:all`, and full Vitest suite (147 tests across 16 files) — all passed with 0 errors.

