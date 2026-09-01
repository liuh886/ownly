# Planner & Capture UI Optimization (Part 1 & Part 2)

## Goals
Refactor and elevate the visual design and UX of:
1. **Candidate Pool Cards & Batch Toolbar (🗂️ 候选池卡片与操作区)**
2. **Execution Timeline & Travel Transitions (⏱️ 每日执行时间线)**

---

## Todo List

- [x] 1. **Candidate Pool Cards UI Refactoring (🗂️ 候选池精致化与信息分层)**
  - Two-tier card layout:
    - **Header row**: Place Title (truncated with tooltip), category icon pill, rating badge (`★ 4.4`), clean price tag (`฿200–400`), and quick-action icon buttons (`+` Schedule to day, `🙈` Shelve).
    - **Meta row**: Distance badge to last stop (`📍 距上一站 1.2km`), priority tag (`must`/`want`), and primary taxonomy.
    - **Tags & Signals container**: Subtle, neatly wrapped chips for signals (`✅`), risks (`⚠️`), custom tags (`🏷️`).
    - **Footer toolbar**: Compact action icons for external links (`📞 电话`, `📖 菜单`, `🎟️ 预订`, `🗺️ 地图`) and `🗑️ 删除` button on the far right.
  - Multi-select mode visual enhancement:
    - Glowing border with clear checkbox for selected cards.
    - Dark pill floating batch action toolbar with action badges (`已选 N 个`, `全选`, `清空`, `+ 排入当天`, `🙈 设为暂不考虑`, `✨ 合并`, `🗑️ 批量删除`).

- [x] 2. **Execution Timeline UI Refactoring (⏱️ 时间线流线质感重塑)**
  - Stop Cards:
    - Vertical timeline layout with elegant connected track.
    - Circle index bubble (`1`, `2`, `3`...) connected to vertical line.
    - Prominent Title and Time slot button (`🕒 09:30-11:00 · 90m` with clear hover and active timing modal trigger).
    - Compact 4-icon action cluster on right: `📌` (Pin/Unpin toggle), `↑` (Move up), `↓` (Move down), `✕` (Remove from day).
    - Micro metadata: address snippet, official links (`📞`, `📖`, `🎟️`, `🗺️`), note/why quotes in subtle container.
  - Travel Transitions (Between Stops):
    - Sleek travel pill design (`🚗 18 min · 4.2 km`) with mode icon (`🚶`, `🚗`, `🚲`, `🚇`) and quick link `Google Maps ↗`.
    - Distinctive gap pills (`◌ 机动 45 min · 11:00-11:45`) and conflict warning pills (`❌ 冲突 · 晚 15 min`).

- [x] 3. **Verification & Testing**
  - Run `npm run validate:fast && npm run test:mcp && npm run validate:extension` to ensure full build and test suite passes.
  - Visual check across responsive breakpoints.
  - Sync with remote `origin/main`.

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



