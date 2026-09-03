# Release Gate — 1.0

每次 release 自动检查：
- Build: npm run build
- Type: tsc --noEmit
- Test: npm test
- Runtime: web / extension / obsidian
- Migration: migration/v1-to-v2 必须提供
