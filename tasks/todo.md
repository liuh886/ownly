# Direct RFC 5545 ICS Projection & Calendar Feed (PRO)

## Todo

- [x] 1. Domain: Implement `src/domain/calendar-feed.ts` with native RFC 5545 serializer (`buildTripCalendarIcs`, `buildDayCalendarIcs`), stable UID (`visit.id`), UTF-8 line folding (75 octets), escaping, and Feed token utilities
- [x] 2. Remove Legacy: Delete `src/domain/ical-pro.ts` and `src/domain/ical-pro.test.ts`; replace with `src/domain/calendar-feed.test.ts`
- [x] 3. Repository & Service: Update `PlannerRepository.ts` (remove `saveTripICalMarkdown`, add `exportTripIcs`, `createOrUpdateCalendarFeed`, `rotateCalendarFeed`, `disableCalendarFeed`) and `ownly-write-service.ts` / MCP tools
- [x] 4. UI: Create `src/components/planner/CalendarSubscriptionModal.tsx` and integrate unified "日历" entry in `src/components/planner/PlannerHome.tsx` (replacing the 3 old legacy buttons)
- [x] 5. Unit & E2E Tests: Update `PlannerRepository.schedule.test.ts`, `PlannerRepository.thailand-golden-path.test.ts`, and MCP write service tests
- [x] 6. Verification: Run all validation suites (`validate:fast`, `validate:shared`, `test:mcp`, `validate:extension`) and commit to `main`

## Review

### Direct RFC 5545 ICS Projection & Calendar Feed (PRO):
1. **Single Direct Serializer Architecture**:
   - Replaced multi-hop Markdown -> iCal Pro -> ICS flow with native RFC 5545 serializer `buildTripCalendarIcs()` and `buildDayCalendarIcs()` in `src/domain/calendar-feed.ts`.
   - Deleted legacy intermediate `src/domain/ical-pro.ts` and removed Vault Markdown file writes (`Trips/trip--{id}.itinerary.md`).
2. **Stable Occurrence UID & Precision Formatting**:
   - `UID:visit:${visit.id}@ownly` ensures Google Calendar / Apple Calendar / Outlook treats moved/edited visits as event updates rather than delete-and-recreates.
   - Timed events produce `DTSTART:YYYYMMDDTHHmm00` / `DTEND:YYYYMMDDTHHmm00`.
   - Untimed / full-day events produce standard all-day `VALUE=DATE:YYYYMMDD` with non-inclusive next-day `DTEND`.
   - Pure UTF-8 safe line folding (max 75 octets with `\r\n `) and character escaping.
   - Visits alone enter `VEVENT` projections; unassigned candidates and shelved (`dropped`) spots remain outside calendar events.
3. **Calendar Feed (PRO) Subscription Model**:
   - High-entropy bearer tokens (`/f/{feed_token}.ics`) allowing calendar clients to subscribe once while receiving continuous updates.
   - PRO lifecycle actions: `createOrUpdateCalendarFeed`, `rotateCalendarFeed`, and `disableCalendarFeed`.
4. **Clean Unified UI**:
   - Consolidated the 3 legacy buttons into a single, polished **「📅 日历与订阅」** button and day toolbar **「📅 日历」** action opening `CalendarSubscriptionModal.tsx`.
   - Supports Free (.ics download / copy) and PRO (live feed URL / token rotation / sync).
5. **Testing & Verification**:
   - Created `src/domain/calendar-feed.test.ts` (13 test cases covering RFC 5545 compliance, folding, escaping, stable UIDs, VALARM, and tokens).
   - Updated Thailand 2026 Golden Path E2E and MCP tools tests.
   - Full test suites passed 100% green (`validate:fast`, `validate:shared`, `test:mcp`, `validate:extension`).

## Authority

```text
Planner / Vault (Occurrence Authority)
        ↓
deterministic RFC 5545 ICS projection (buildTripCalendarIcs)
        ↓
[Download .ics (Free)]  OR  [Calendar Feed: https://calendar.ownly.app/f/{token}.ics (PRO)]
        ↓
Google Calendar / Apple Calendar / Outlook
```


