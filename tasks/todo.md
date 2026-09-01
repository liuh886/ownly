# Phase 2: Calendar Feed Service (PRO)

## Todo

- [x] 1. Security & Token Entropy: Upgrade `generateCalendarFeedToken()` to use `crypto.getRandomValues()` (CSPRNG 32 bytes) and implement `hashFeedToken(token)` SHA-256 token hashing
- [x] 2. Database Migration: Create `supabase/migrations/20260901_calendar_feeds.sql` defining `calendar_feeds` table (`id`, `trip_id`, `user_id`, `token_hash`, `ics_content`, `enabled`, `created_at`, `updated_at`)
- [x] 3. Service Layer & API Contract: Implement `src/services/CalendarFeedService.ts` (`publishFeed`, `rotateFeed`, `disableFeed`, `handlePublicFeedRequest`) with PRO entitlement gate `canUseWYQDProFeature`
- [x] 4. UI Integration: Connect `CalendarSubscriptionModal.tsx` and `PlannerHome.tsx` to `CalendarFeedService`, passing `membership` and enforcing PRO gate with upgrade prompt for Free tier
- [x] 5. Testing & Verification: Add `src/services/CalendarFeedService.test.ts`, update `src/domain/calendar-feed.test.ts`, and run all CI suites

---

## Phase 2 Review (Calendar Feed Service & PRO Gate)

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



