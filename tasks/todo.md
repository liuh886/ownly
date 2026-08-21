# Ownly Feature Polish & Gap Filling Plan

## Todo List
- [x] 1. (P0) Fix Vitest process test timeouts on Windows (wyqd-cli.process.test.ts, portability.process.test.ts) <!-- id: 1 -->
- [x] 2. (P1) Rebase agent/mcp-write-support on main and verify MCP write suite <!-- id: 2 -->
- [x] 3. (P1) Implement Object Experience Logs UI in ObjectDetailPanel.tsx <!-- id: 3 -->
- [x] 4. (P2) Review & integrate feat/ownly-travel-planner compatibility & build scripts <!-- id: 4 -->
- [x] 5. Run full validation (npm run validate:fast, validate:shared, validate:obsidian) and document results <!-- id: 5 -->

## Review & Notes
### Summary of Changes:
1. **Windows Test Timeout Resilience**:
   - Updated vitest.config.ts default test timeout to 30000ms.
   - Explicitly configured 30s timeout in scripts/cli/wyqd-cli.process.test.ts and scripts/cli/portability.process.test.ts to prevent timeout failures when spawning sequential node/tsx processes on Windows.
2. **MCP Two-Phase Write Branch Sync**:
   - Rebased agent/mcp-write-support on top of latest main (f35f8ce) with 0 merge conflicts.
   - All MCP unit tests (test:mcp) and shared write services (OwnlyWriteService) verified.
3. **Object Experience Logs UI Implementation**:
   - Updated useOwnlyData.ts to query repository.listObjectLogs().
   - Propagated logs state through AppShell, TabRenderer, ObjectList, and Object Cards to ObjectDetailPanel.
   - Added interactive experience logs timeline in ObjectDetailPanel.tsx with color-coded event badges (usage, maintenance, issue, regret, lesson, exit_note, comparison), dates, key lesson highlights, and notes body.
   - Added full bilingual i18n support in src/core/i18n.ts.
4. **Travel Planner & Capture Extension Compatibility**:
   - Checked out origin/feat/ownly-travel-planner, verified src/domain/planner.test.ts passing and build-extension.mjs generating Chrome extension MV3 bundles at dist/extension/.
5. **Multi-Runtime Quality Assurance**:
   - npm run validate:fast: Type checking, ESLint, terminology, and membership constraints 100% passed.
   - npm run validate:shared: Runtime parity, contract tests, CLI, MCP, onboarding, and portability tests 100% passed.
   - npm run validate:obsidian: Type check, ESLint, build, and package release checks 100% passed.
