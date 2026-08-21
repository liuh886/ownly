# Ownly Feature Rollout Plan (3 -> 1 -> 2)

## Todo List
- [ ] 1. Option 3: Process & validate feat/ownly-travel-planner branch <!-- id: 1 -->
  - [ ] Check out and rebase feat/ownly-travel-planner on latest main
  - [ ] Verify planner domain tests, Chrome extension build, and multi-runtime validations
  - [ ] Ensure navigation, UI tabs, and i18n are fully cohesive
- [ ] 2. Option 1: Push branches to remote <!-- id: 2 -->
  - [ ] Push agent/mcp-write-support with force-with-lease
  - [ ] Push feat/ownly-travel-planner to remote
- [ ] 3. Option 2: Launch local dev server for testing & verification <!-- id: 3 -->
  - [ ] Start npm run dev and report ready status
