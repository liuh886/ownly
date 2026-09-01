# Phase 2.1: Supabase Calendar Feed Backend & Hardening

## Todo

- [x] 1. Security: Remove plaintext hash fallback in `hashFeedToken()` (throw error if crypto unavailable)
- [x] 2. Fix Rotate Bug: Update `rotateFeed()` to accept `places` and `visits`, build new ICS snapshot, save new record, and disable old record
- [x] 3. Database Migration: Ensure `supabase/migrations/20260901_calendar_feeds.sql` has `user_id uuid/text`, `create unique index on calendar_feeds(token_hash)`, and `user_id` is non-nullable
- [x] 4. Production Store: Implement `src/services/SupabaseCalendarFeedStore.ts` using Supabase REST API (with strict `userId` requirement and zero weak `local_user` fallback)
- [x] 5. Public Edge Function: Implement `supabase/functions/calendar-feed/index.ts` for public `GET /f/:token.ics` serving
- [x] 6. Wiring & Testing: Update `CalendarFeedService.ts` to use `SupabaseCalendarFeedStore` by default, test with mocks and memory store, and run all CI suites

---

## Phase 2.1 Review (Supabase Persistence & Edge Backend)

1. **Production Supabase Store (`SupabaseCalendarFeedStore.ts`)**:
   - Replaced memory-only fallback with direct Supabase PostgREST store (`upsertFeed`, `getFeedByTokenHash`, `disableFeed`).
   - Uses zero-dependency native fetch with `apikey` & `Bearer` authentication.
   - Enforces strict `userId` without silent fallback to `local_user`.
2. **Fixed Rotate Workflow**:
   - `rotateFeed()` now requires `places` & `visits`, immediately building and saving the new ICS projection alongside token generation.
   - Disables the old token hash (`enabled = false`) and returns `{ feed, url, ics }` so the new URL is instantly ready.
3. **Strict Cryptographic Security**:
   - Removed plaintext token return fallback from `hashFeedToken()`; throws error if CSPRNG/SubtleCrypto is unavailable.
4. **Public Edge Function (`supabase/functions/calendar-feed/index.ts`)**:
   - Deploys serverless handler for `GET /f/:token.ics` and `GET /calendar-feed/:token.ics`.
   - Computes SHA-256 hash, looks up enabled feed in `calendar_feeds`, and returns RFC 5545 `text/calendar; charset=utf-8` with caching headers (`Cache-Control: public, max-age=1800, stale-while-revalidate=3600`) and `ETag`.
5. **Testing**:
   - Comprehensive test suite in `CalendarFeedService.test.ts` covering both `MemoryCalendarFeedStore` and `SupabaseCalendarFeedStore`.
   - All 21 calendar tests, MCP tests, and repository tests passing green.

1. **CSPRNG 32-Byte Token & SHA-256 Hashing**:
   - Upgraded `generateCalendarFeedToken()` in `src/domain/calendar-feed.ts` to use `globalThis.crypto.getRandomValues()`.
   - Added `hashFeedToken(token)` producing deterministic SHA-256 hexadecimal digests. Plaintext bearer tokens are never stored in the database.
2. **Supabase Migration**:
   - Created `supabase/migrations/20260901_calendar_feeds.sql` hosting read-only `.ics` snapshots in `calendar_feeds` with indices on `token_hash` and `(user_id, trip_id)`.
3. **CalendarFeedService & PRO Gate**:
   - `CalendarFeedService` in `src/services/CalendarFeedService.ts` validates `canUseWYQDProFeature(membership)` on publish/rotate/disable operations.
   - `handlePublicFeedRequest(token)` handles public subscriber requests, looks up by SHA-256 hash, and returns standard HTTP headers (`Content-Type: text/calendar; charset=utf-8`, `Cache-Control`, `X-Published-By`).
4. **UI & Upgrade Flow**:
   - `CalendarSubscriptionModal.tsx` distinguishes Free from PRO membership, prompting Free users with an unlock card and connecting PRO users to live feed publishing and URL rotation.
5. **Testing**:
   - Added `src/services/CalendarFeedService.test.ts` (4 test cases verifying Free rejection, PRO publish, rotation revocation 404, and disable).
   - Added `src/domain/calendar-feed.test.ts` CSPRNG and token hash tests.
   - All tests passing 100% green across all suites.

---

## Phase 1 Review (Completed & Merged in `9d632bf`)

### Direct RFC 5545 ICS Projection & Local Engine:
1. **Single Direct Serializer**: `buildTripCalendarIcs()` and `buildDayCalendarIcs()` in `src/domain/calendar-feed.ts`. Deleted `src/domain/ical-pro.ts`.
2. **Stable Occurrence UID**: `UID:visit:${visit.id}@ownly` for in-place calendar event updates.
3. **Pure Execution Projection**: Excludes unassigned and `dropped` candidate places.
4. **Unified UI & MCP**: Consolidated into `CalendarSubscriptionModal.tsx` and `ownly_planner_get_calendar_ics`.

## Authority & Data Flow

```text
Planner / Vault (Travel State Authority)
        ↓
buildTripCalendarIcs(trip, places, visits)
        ↓
POST /calendar/feed/publish (PRO Gate: membership.isPro = true)
        ↓
Supabase Table: calendar_feeds (Only stores { token_hash, ics_content, enabled })
        ↓
GET /f/{token}.ics (Public Endpoint for Google / Apple / Outlook)
        ↓
Response: 200 OK, Content-Type: text/calendar; charset=utf-8
```



