# Import Integrity: No Silent Drops

## Problem
- 46 places captured → only 43 appear in Planner
- `importResearchPlaces` silently `continue`s places that lack `trip_id` or whose trip doesn't exist
- `catch` block on line 227 silently swallows errors
- ACK only removes successfully imported IDs, but the UI shows no feedback about failures
- User has no way to know what was lost or why

## Plan

### Step 1: ImportReport type + refactor importResearchPlaces
- [x] Add `ImportReport` interface with received/imported/failed
- [x] Change `importResearchPlaces` return type from `string[]` to `ImportReport`
- [x] Track failures with reason: `missing_id`, `missing_trip`, `unknown_trip`, `write_error`
- [x] Update public methods `importCapturedPlaces` and `importExternalCandidates`

### Step 2: Update syncCapture in PlannerHome
- [x] Use ImportReport to show detailed results
- [x] Only ACK imported IDs (already does this)
- [x] Failed places stay in Capture pending (not ACKed = stays)
- [x] Show import result summary in notice

### Step 3: Tests
- [x] Update existing import tests for new return type
- [x] Add test: place with missing trip_id → appears in failed
- [x] Add test: place with unknown trip_id → appears in failed

### Step 4: Verify & commit
- [x] tsc --noEmit
- [x] npm run validate:fast
- [x] Commit & push
